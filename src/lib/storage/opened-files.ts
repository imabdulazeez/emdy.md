import { debounce } from "~/lib/debounce";
import { unwrapFolderResult, type OpenedFile, type OpenedFilesApi } from "~/lib/desktop/bridge";
import { sameDocumentIcon, type DocumentIcon } from "~/lib/document-icon";
import { titleFromFilename } from "./filenames";
import { hashText } from "./hash";
import { LIBRARY_WRITE_DELAY_MS, type LibraryDocument } from "./library";

export interface OpenedDocument {
  id: string;
  title: string;
  text: string;
  modified: number;
  icon: DocumentIcon | null;
  fixedTitle: true;
}

export interface OpenedFilesRefresh {
  added: OpenedDocument[];
  updated: OpenedDocument[];
  removed: string[];
}

export interface OpenedFileStoreOptions {
  writeDelayMs?: number;
  onError?: (error: unknown) => void;
  onSaved?: () => void;
  onRefresh?: (result: OpenedFilesRefresh) => void;
}

export interface OpenedFileStore {
  load(taken: readonly string[]): Promise<OpenedDocument[]>;
  refresh(taken: readonly string[]): Promise<OpenedFilesRefresh>;
  save(doc: LibraryDocument): void;
  close(id: string): Promise<void>;
  flush(): Promise<void>;
  pending(): boolean;
  has(id: string): boolean;
}

interface KnownFile {
  name: string;
  title: string;
  hash: string;
  icon: DocumentIcon | null;
}

export function toOpenedDocument(file: OpenedFile, title = titleFromFilename(file.name)) {
  return {
    id: file.id,
    title,
    text: file.text,
    modified: file.modified,
    icon: file.icon,
    fixedTitle: true,
  } satisfies OpenedDocument;
}

export function createOpenedFileStore(
  api: OpenedFilesApi,
  options: OpenedFileStoreOptions = {},
): OpenedFileStore {
  const known = new Map<string, KnownFile>();
  const dirty = new Map<string, LibraryDocument>();
  const inflight = new Set<string>();
  let queue: Promise<unknown> = Promise.resolve();

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(task).catch((error: unknown) => {
      options.onError?.(error);
      throw error;
    });
    queue = next.catch(() => undefined);
    return next;
  };

  const remember = (file: OpenedFile, title = titleFromFilename(file.name)) => {
    known.set(file.id, { name: file.name, title, hash: hashText(file.text), icon: file.icon });
  };

  const needsSave = (doc: LibraryDocument) => {
    const file = known.get(doc.id);
    return (
      file !== undefined &&
      (file.hash !== hashText(doc.text) ||
        file.title !== doc.title ||
        !sameDocumentIcon(file.icon, doc.icon ?? null))
    );
  };

  const commit = () =>
    enqueue(async () => {
      const batch = Array.from(dirty.values());
      dirty.clear();
      const added: OpenedDocument[] = [];
      try {
        for (const doc of batch) {
          const base = known.get(doc.id);
          if (!base) continue;
          inflight.add(doc.id);
          try {
            const saved = unwrapFolderResult(
              await api.save(doc.id, {
                title: doc.title,
                text: doc.text,
                base: base.hash,
                icon: doc.icon ?? null,
              }),
            );
            remember(saved.file, doc.title);
            if (saved.conflict) {
              remember(saved.conflict);
              added.push(toOpenedDocument(saved.conflict));
            }
          } finally {
            inflight.delete(doc.id);
          }
        }
      } catch (error) {
        for (const doc of batch) if (!dirty.has(doc.id) && needsSave(doc)) dirty.set(doc.id, doc);
        throw error;
      } finally {
        if (added.length > 0) options.onRefresh?.({ added, updated: [], removed: [] });
      }
      options.onSaved?.();
    });

  const scheduled = debounce(
    () => void commit().catch(() => undefined),
    options.writeDelayMs ?? LIBRARY_WRITE_DELAY_MS,
  );

  const refresh = (taken: readonly string[]) =>
    enqueue(async () => {
      const list = unwrapFolderResult(await api.list(taken));
      const result: OpenedFilesRefresh = { added: [], updated: [], removed: [] };
      const present = new Set<string>();
      for (const file of list.files) {
        present.add(file.id);
        const previous = known.get(file.id);
        if (!previous) {
          remember(file);
          result.added.push(toOpenedDocument(file));
          continue;
        }
        if (dirty.has(file.id) || inflight.has(file.id)) continue;
        const renamed = file.name !== previous.name;
        if (!renamed && previous.hash === hashText(file.text)) {
          if (!sameDocumentIcon(previous.icon, file.icon)) {
            remember(file, previous.title);
            result.updated.push(toOpenedDocument(file, previous.title));
          }
          continue;
        }
        const title = renamed ? titleFromFilename(file.name) : previous.title;
        remember(file, title);
        result.updated.push(toOpenedDocument(file, title));
      }
      for (const id of known.keys()) {
        if (present.has(id) || dirty.has(id) || inflight.has(id)) continue;
        known.delete(id);
        result.removed.push(id);
      }
      return result;
    });

  return {
    async load(taken) {
      known.clear();
      const list = unwrapFolderResult(await api.list(taken));
      for (const id of list.missing) await api.close(id);
      for (const file of list.files) remember(file);
      return list.files.map((file) => toOpenedDocument(file));
    },
    refresh,
    save(doc) {
      if (!known.has(doc.id)) return;
      if (!dirty.has(doc.id) && !needsSave(doc)) return;
      dirty.set(doc.id, doc);
      scheduled();
    },
    async close(id) {
      scheduled.cancel();
      if (dirty.size > 0) await commit().catch(() => undefined);
      await enqueue(async () => {
        dirty.delete(id);
        known.delete(id);
        await api.close(id);
      });
    },
    async flush() {
      scheduled.cancel();
      await queue;
      if (dirty.size > 0) await commit();
    },
    pending: () => dirty.size > 0 || inflight.size > 0 || scheduled.pending(),
    has: (id) => known.has(id),
  };
}
