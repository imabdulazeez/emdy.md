import { debounce } from "~/lib/debounce";
import { sameDocumentIcon, type DocumentIcon } from "~/lib/document-icon";
import { makeDocumentId } from "~/lib/route";
import { mergeDocuments, type ArchiveDocument, type ImportSummary } from "./archive";
import {
  CATALOG_DIRECTORY,
  CATALOG_FILE,
  CATALOG_VERSION,
  entryFor,
  parseCatalog,
  reconcile,
  serializeCatalog,
  sortDocuments,
  withIcon,
  type CatalogEntry,
  type LoadedDocument,
} from "./catalog";
import type { Directory } from "./directory";
import { filenameFor, isMarkdownFile } from "./filenames";
import { byteLength, hashText } from "./hash";
import { isJournalEntry, readJournals, replayJournal, type JournalSnapshot } from "./journal";
import {
  readOptional,
  recoverTransaction,
  TRANSACTION_FILE,
  writeTransaction,
  type Transaction,
} from "./transaction";

export const LIBRARY_WRITE_DELAY_MS = 500;

export interface LibraryDocument {
  id: string;
  title: string;
  text: string;
  icon?: DocumentIcon | null;
}

export interface PendingDocument extends LibraryDocument {
  bases: string[];
  created?: number;
  modified?: number;
}

export interface LibraryRefresh {
  added: LoadedDocument[];
  updated: LoadedDocument[];
  removed: string[];
}

export interface ImportResult extends LibraryRefresh, ImportSummary {}

export interface LibraryOptions {
  writeDelayMs?: number;
  now?: () => number;
  recoverJournals?: boolean;
  onError?: (error: unknown) => void;
  onSaved?: () => void;
  onRefresh?: (result: LibraryRefresh) => void;
}

export interface Library {
  load(): Promise<LoadedDocument[]>;
  save(doc: LibraryDocument): void;
  remove(id: string): void;
  refresh(current: (id: string) => string | undefined): Promise<LibraryRefresh>;
  import(docs: readonly ArchiveDocument[]): Promise<ImportResult>;
  flush(): Promise<void>;
  pending(): boolean;
  dirtyDocuments(): PendingDocument[];
  entry(id: string): CatalogEntry | undefined;
  entries(): CatalogEntry[];
  files(): string[];
}

export function createLibrary(directory: Directory, options: LibraryOptions = {}): Library {
  const now = options.now ?? (() => Date.now());
  const entries = new Map<string, CatalogEntry>();
  const diskText = new Map<string, { hash: string; text: string }>();
  let known: { catalog: string; documents: LoadedDocument[] } | null = null;
  const dirty = new Map<string, PendingDocument>();
  const inflight = new Map<string, PendingDocument>();
  const removed = new Set<string>();
  const removing = new Set<string>();
  let queue: Promise<unknown> = Promise.resolve();

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue
      .then(() => directory.exclusive(task))
      .catch((error: unknown) => {
        options.onError?.(error);
        throw error;
      });
    queue = next.catch(() => undefined);
    return next;
  };

  const remember = (catalog: string, documents: LoadedDocument[]) => {
    known = { catalog, documents };
    diskText.clear();
    for (const doc of documents) diskText.set(doc.id, { hash: doc.hash, text: doc.text });
  };

  const readDisk = async (): Promise<LoadedDocument[]> => {
    known = null;
    await recoverTransaction(directory);
    const metadata = await directory.child(CATALOG_DIRECTORY);
    const raw = await readOptional(metadata, CATALOG_FILE);
    const previous = parseCatalog(raw);
    const files = (await directory.list()).filter((file) => isMarkdownFile(file.name));
    const catalogById = new Map(previous?.documents.map((entry) => [entry.id, entry]));
    const result = await reconcile(previous?.documents ?? [], files, {
      read: directory.read,
      now: now(),
      previousText: (id) => {
        const cached = diskText.get(id);
        return cached?.hash === catalogById.get(id)?.hash ? cached?.text : undefined;
      },
    });
    let catalog = raw ?? "";
    if (previous === null || result.changed) {
      catalog = serializeCatalog(result.documents.map(({ text: _text, ...entry }) => entry));
      await metadata.write(CATALOG_FILE, catalog);
    }
    remember(catalog, result.documents);
    return result.documents;
  };

  const current = async (): Promise<LoadedDocument[]> => {
    const cached = known;
    if (cached) {
      const metadata = await directory.child(CATALOG_DIRECTORY);
      const [pending, catalog] = await Promise.all([
        readOptional(metadata, TRANSACTION_FILE),
        readOptional(metadata, CATALOG_FILE),
      ]);
      if (!pending && catalog === cached.catalog) return cached.documents;
    }
    return readDisk();
  };

  const apply = async (
    loaded: readonly LoadedDocument[],
    transaction: Transaction,
  ): Promise<LoadedDocument[]> => {
    known = null;
    const stored = await writeTransaction(directory, transaction);
    const texts = new Map(loaded.map((doc) => [doc.file, doc.text]));
    for (const { file, text } of transaction.writes) texts.set(file, text);
    const documents: LoadedDocument[] = [];
    for (const entry of stored) {
      const text = texts.get(entry.file);
      if (text === undefined) return readDisk();
      documents.push({ ...entry, synced: entry.synced ?? entry.modified, text });
    }
    sortDocuments(documents);
    remember(serializeCatalog(stored), documents);
    return documents;
  };

  const plan = (
    loaded: readonly LoadedDocument[],
    batch: readonly PendingDocument[],
    deletions: readonly string[],
    journals: JournalSnapshot[] = [],
  ): Transaction => {
    const next = new Map(loaded.map((doc) => [doc.id, doc]));
    const writes: Transaction["writes"] = [];
    const deletes = new Set<string>();
    const reservedIds = new Set([...next.keys(), ...batch.map((doc) => doc.id), ...entries.keys()]);
    const taken = () => Array.from(next.values(), (doc) => doc.file);
    for (const id of deletions) {
      const doc = next.get(id);
      if (doc) deletes.add(doc.file);
      next.delete(id);
    }
    for (const doc of batch) {
      const previous = next.get(doc.id);
      if (
        previous &&
        previous.text !== doc.text &&
        doc.bases.length > 0 &&
        !doc.bases.includes(previous.hash)
      ) {
        const title = `${previous.title} (conflict)`;
        const file = filenameFor(title, taken());
        const id = makeDocumentId(reservedIds);
        reservedIds.add(id);
        const copy = entryFor(id, file, title, previous.text, previous.size, now(), now());
        next.set(id, copy);
        writes.push({ file, text: copy.text });
      }
      const file =
        previous?.title === doc.title
          ? previous.file
          : filenameFor(doc.title, taken(), previous?.file);
      const updated = withIcon(
        entryFor(
          doc.id,
          file,
          doc.title,
          doc.text,
          byteLength(doc.text),
          doc.modified ?? now(),
          previous?.created ?? entries.get(doc.id)?.created ?? doc.created ?? now(),
          previous?.synced ?? entries.get(doc.id)?.synced,
        ),
        doc.icon === undefined ? (previous?.icon ?? entries.get(doc.id)?.icon) : doc.icon,
      );
      next.set(doc.id, updated);
      if (!previous || previous.file !== file || previous.text !== doc.text)
        writes.push({ file, text: doc.text });
      if (previous && previous.file !== file) deletes.add(previous.file);
    }
    const files = new Set(taken());
    return {
      catalog: {
        version: CATALOG_VERSION,
        documents: Array.from(next.values(), ({ text: _text, ...entry }) => entry),
      },
      writes,
      removes: Array.from(deletes).filter((file) => !files.has(file)),
      journals,
    };
  };

  const publish = (
    loaded: readonly LoadedDocument[],
    protectedIds: ReadonlySet<string> = new Set(),
  ): LibraryRefresh => {
    const next = new Map(loaded.map((doc) => [doc.id, doc]));
    const result: LibraryRefresh = { added: [], updated: [], removed: [] };
    for (const doc of loaded) {
      if (removed.has(doc.id)) continue;
      const previous = entries.get(doc.id);
      if (!previous) result.added.push(doc);
      else if (
        !protectedIds.has(doc.id) &&
        !dirty.has(doc.id) &&
        (previous.hash !== doc.hash ||
          previous.title !== doc.title ||
          !sameDocumentIcon(previous.icon, doc.icon))
      )
        result.updated.push(doc);
    }
    for (const id of entries.keys()) {
      if (!next.has(id) && !dirty.has(id) && !protectedIds.has(id)) result.removed.push(id);
    }
    entries.clear();
    for (const { text: _text, ...entry } of loaded) entries.set(entry.id, entry);
    return result;
  };

  const commit = (fresh = false) =>
    enqueue(async () => {
      const batch = Array.from(dirty.values());
      const deletions = Array.from(removed);
      dirty.clear();
      removed.clear();
      for (const doc of batch) inflight.set(doc.id, doc);
      for (const id of deletions) removing.add(id);
      try {
        let loaded = fresh ? await readDisk() : await current();
        if (batch.length > 0 || deletions.length > 0)
          loaded = await apply(loaded, plan(loaded, batch, deletions));
        const result = publish(loaded, new Set(batch.map((doc) => doc.id)));
        options.onRefresh?.(result);
        options.onSaved?.();
        return result;
      } catch (error) {
        for (const doc of batch)
          if (!dirty.has(doc.id) && !removed.has(doc.id)) dirty.set(doc.id, doc);
        for (const id of deletions) if (!dirty.has(id)) removed.add(id);
        throw error;
      } finally {
        for (const doc of batch) inflight.delete(doc.id);
        for (const id of deletions) removing.delete(id);
      }
    });

  const scheduled = debounce(
    () => void commit().catch(() => undefined),
    options.writeDelayMs ?? LIBRARY_WRITE_DELAY_MS,
  );

  return {
    load: () =>
      enqueue(async () => {
        let loaded = await readDisk();
        if (options.recoverJournals) {
          for (const snapshot of readJournals()) {
            const pending = (JSON.parse(snapshot.value) as unknown[]).filter(isJournalEntry);
            const replay = replayJournal(loaded, pending);
            const batch = replay.resave.map((doc) => ({
              ...doc,
              bases: loaded.filter((entry) => entry.id === doc.id).map((entry) => entry.hash),
            }));
            loaded = await apply(loaded, plan(loaded, batch, [], [snapshot]));
          }
        }
        publish(loaded);
        return loaded;
      }),
    save(doc) {
      const entry = entries.get(doc.id);
      const pending = dirty.get(doc.id);
      const inFlight = inflight.get(doc.id);
      removed.delete(doc.id);
      const icon = doc.icon === undefined ? (pending?.icon ?? entry?.icon ?? null) : doc.icon;
      const settled =
        !pending &&
        !inFlight &&
        entry !== undefined &&
        entry.title === doc.title &&
        entry.hash === hashText(doc.text);
      if (settled && sameDocumentIcon(entry.icon, icon)) return;
      const bases =
        pending?.bases ??
        (inFlight ? [...inFlight.bases, hashText(inFlight.text)] : entry ? [entry.hash] : []);
      dirty.set(doc.id, {
        id: doc.id,
        title: doc.title,
        text: doc.text,
        bases,
        ...(sameDocumentIcon(entry?.icon, icon) ? {} : { icon }),
        ...(settled ? { modified: entry.modified } : {}),
      });
      if (!settled) {
        scheduled();
        return;
      }
      scheduled.cancel();
      void commit().catch(() => undefined);
    },
    remove(id) {
      dirty.delete(id);
      if (!entries.has(id) && !inflight.has(id)) return;
      removed.add(id);
      void commit().catch(() => undefined);
    },
    refresh: () => {
      scheduled.cancel();
      return commit(true);
    },
    import: (docs) =>
      enqueue(async () => {
        let loaded = await readDisk();
        const merge = mergeDocuments(loaded, docs);
        if (merge.added.length > 0) {
          const batch = merge.added.map(({ id, title, text, created, modified, icon }) => ({
            id,
            title,
            text,
            created,
            modified,
            icon: icon ?? null,
            bases: [],
          }));
          loaded = await apply(loaded, plan(loaded, batch, []));
        }
        const result = publish(loaded);
        options.onRefresh?.(result);
        return { ...result, imported: merge.added.length, skipped: merge.skipped };
      }),
    async flush() {
      scheduled.cancel();
      await queue;
      if (dirty.size > 0 || removed.size > 0) await commit();
    },
    pending: () =>
      dirty.size > 0 ||
      inflight.size > 0 ||
      removed.size > 0 ||
      removing.size > 0 ||
      scheduled.pending(),
    dirtyDocuments: () => {
      const merged = new Map(inflight);
      for (const [id, doc] of dirty) merged.set(id, doc);
      for (const id of removed) merged.delete(id);
      return Array.from(merged.values());
    },
    entry: (id) => entries.get(id),
    entries: () => Array.from(entries.values()),
    files: () => Array.from(entries.values(), (entry) => entry.file),
  };
}
