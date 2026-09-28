import { isDocumentIcon, type DocumentIcon } from "~/lib/document-icon";
import { isDocumentId, makeDocumentId } from "~/lib/route";
import type { FileInfo } from "./directory";
import { filenameFor, isMarkdownFile, titleFromFilename } from "./filenames";
import { hashText } from "./hash";

export const CATALOG_DIRECTORY = ".emdy";
export const CATALOG_FILE = "index.json";
export const CATALOG_VERSION = 1;

export interface CatalogEntry {
  id: string;
  file: string;
  title: string;
  hash: string;
  size: number;
  modified: number;
  created: number;
  synced: number;
  icon?: DocumentIcon;
}

export interface Catalog {
  version: typeof CATALOG_VERSION;
  documents: CatalogEntry[];
}

/** An entry as stored on disk; catalogs written before `synced` existed omit it. */
export type StoredCatalogEntry = Omit<CatalogEntry, "synced"> & { synced?: number };

export interface StoredCatalog {
  version: typeof CATALOG_VERSION;
  documents: StoredCatalogEntry[];
}

export interface LoadedDocument extends CatalogEntry {
  text: string;
}

export interface Reconciliation {
  documents: LoadedDocument[];
  added: LoadedDocument[];
  updated: LoadedDocument[];
  conflicts: LoadedDocument[];
  removed: CatalogEntry[];
  changed: boolean;
}

export interface ReconcileOptions {
  read: (name: string) => Promise<string>;
  now: number;
  readAll?: boolean;
  dirty?: ReadonlySet<string>;
  previousText?: (id: string) => string | undefined;
}

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export function isCatalogEntry(value: unknown): value is StoredCatalogEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    isDocumentId(entry.id) &&
    typeof entry.file === "string" &&
    isMarkdownFile(entry.file) &&
    typeof entry.title === "string" &&
    typeof entry.hash === "string" &&
    isCount(entry.size) &&
    isCount(entry.modified) &&
    isCount(entry.created) &&
    (entry.synced === undefined || isCount(entry.synced))
  );
}

export function isCatalog(value: unknown): value is StoredCatalog {
  if (typeof value !== "object" || value === null) return false;
  const catalog = value as Record<string, unknown>;
  if (catalog.version !== CATALOG_VERSION || !Array.isArray(catalog.documents)) return false;
  if (!catalog.documents.every(isCatalogEntry)) return false;
  const ids = new Set(catalog.documents.map((entry) => entry.id));
  const files = new Set(catalog.documents.map((entry) => entry.file));
  return ids.size === catalog.documents.length && files.size === catalog.documents.length;
}

export function withIcon<T extends CatalogEntry>(
  entry: T,
  icon: DocumentIcon | null | undefined,
): T {
  const { icon: _previous, ...rest } = entry;
  return (isDocumentIcon(icon) ? { ...rest, icon } : rest) as T;
}

export function parseCatalog(raw: string | null): Catalog | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isCatalog(value)) return null;
    return {
      version: value.version,
      documents: value.documents.map((entry) =>
        withIcon({ ...entry, synced: entry.synced ?? entry.modified }, entry.icon),
      ),
    };
  } catch {
    return null;
  }
}

export function serializeCatalog(entries: readonly StoredCatalogEntry[]): string {
  const documents = [...entries].sort(
    (a, b) => a.created - b.created || a.file.localeCompare(b.file),
  );
  return `${JSON.stringify({ version: CATALOG_VERSION, documents }, null, 2)}\n`;
}

export function entryFor(
  id: string,
  file: string,
  title: string,
  text: string,
  size: number,
  modified: number,
  created: number,
  synced = 0,
): LoadedDocument {
  return { id, file, title, hash: hashText(text), size, modified, created, synced, text };
}

export function conflictFilename(title: string, taken: Iterable<string>): string {
  return filenameFor(`${title} (conflict)`, taken);
}

export function sortDocuments<T extends CatalogEntry>(list: T[]): T[] {
  return list.sort((a, b) => a.created - b.created || a.file.localeCompare(b.file));
}

export async function reconcile(
  previous: readonly CatalogEntry[],
  files: readonly FileInfo[],
  options: ReconcileOptions,
): Promise<Reconciliation> {
  const { read, now, readAll = false, dirty, previousText } = options;
  const byFile = new Map(previous.map((entry) => [entry.file, entry]));
  const byId = new Map(previous.map((entry) => [entry.id, entry]));
  const markdown = [...files].filter((file) => isMarkdownFile(file.name));
  const seenIds = new Set<string>();
  const documents: LoadedDocument[] = [];
  const added: LoadedDocument[] = [];
  const updated: LoadedDocument[] = [];
  const conflicts: LoadedDocument[] = [];
  const unmatched: { file: FileInfo; text: string; hash: string }[] = [];
  let changed = false;

  const isUntouched = (entry: CatalogEntry, file: FileInfo) =>
    entry.size === file.size && entry.synced === file.lastModified;
  const cached = markdown.map((file) => {
    const entry = byFile.get(file.name);
    return entry && !readAll && isUntouched(entry, file) ? previousText?.(entry.id) : undefined;
  });
  const texts = await Promise.all(
    markdown.map(async (file, index) => cached[index] ?? read(file.name)),
  );

  for (const [index, file] of markdown.entries()) {
    const entry = byFile.get(file.name);
    const text = texts[index];
    if (!entry) {
      unmatched.push({ file, text, hash: hashText(text) });
      continue;
    }
    seenIds.add(entry.id);
    const untouched = isUntouched(entry, file);
    if (cached[index] !== undefined) {
      documents.push({ ...entry, text });
      continue;
    }
    const hash = hashText(text);
    const edited = hash !== entry.hash;
    const loaded: LoadedDocument = {
      ...entry,
      hash,
      size: file.size,
      modified: edited ? file.lastModified : entry.modified,
      synced: file.lastModified,
      text,
    };
    if (edited) {
      if (dirty?.has(entry.id)) {
        conflicts.push(loaded);
        documents.push({ ...entry, text: previousText?.(entry.id) ?? text });
        continue;
      }
      updated.push(loaded);
      changed = true;
    } else if (!untouched) {
      changed = true;
    }
    documents.push(loaded);
  }

  const missing = previous.filter((entry) => !seenIds.has(entry.id));
  const removed: CatalogEntry[] = [];
  const renameCandidates = new Map<string, CatalogEntry[]>();
  for (const entry of missing) {
    const list = renameCandidates.get(entry.hash) ?? [];
    list.push(entry);
    renameCandidates.set(entry.hash, list);
  }

  const taken = new Set(byId.keys());
  for (const { file, text, hash } of unmatched) {
    changed = true;
    const renamed = renameCandidates.get(hash)?.shift();
    if (renamed) {
      seenIds.add(renamed.id);
      const loaded: LoadedDocument = {
        ...renamed,
        file: file.name,
        title: titleFromFilename(file.name),
        size: file.size,
        modified: file.lastModified,
        synced: file.lastModified,
        text,
      };
      documents.push(loaded);
      updated.push(loaded);
      continue;
    }
    const id = makeDocumentId(taken);
    taken.add(id);
    const loaded = entryFor(
      id,
      file.name,
      titleFromFilename(file.name),
      text,
      file.size,
      file.lastModified,
      file.lastModified || now,
      file.lastModified,
    );
    documents.push(loaded);
    added.push(loaded);
  }

  for (const entry of missing) {
    if (!seenIds.has(entry.id)) {
      removed.push(entry);
      changed = true;
    }
  }

  return {
    documents: sortDocuments(documents),
    added,
    updated,
    conflicts,
    removed,
    changed,
  };
}
