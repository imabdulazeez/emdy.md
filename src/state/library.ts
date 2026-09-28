import { createEffect, createSignal, flush, onCleanup, untrack } from "solid-js";
import { downloadText } from "~/lib/download";
import {
  ARCHIVE_MIME_TYPE,
  archiveFilename,
  parseArchive,
  serializeArchive,
  type ArchiveDocument,
  type ImportSummary,
} from "~/lib/storage/archive";
import { createOriginPrivateDirectory, type Directory } from "~/lib/storage/directory";
import { clearJournal, writeJournal } from "~/lib/storage/journal";
import { createLibrary, type Library, type LibraryRefresh } from "~/lib/storage/library";
import {
  addDocuments,
  deleteDocument,
  documents,
  findDocument,
  loadDocuments,
  normalizeTitle,
  replaceDocument,
  type DocumentRecord,
} from "./document";
import { editorApi } from "./editor-api";
import { followRenamedFiles, resetLinkState, useLinkCatalog } from "./links";

export type LibraryStatus =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

export type DirectorySource = () => Promise<Directory>;

export type ImportStatus =
  | { kind: "imported"; imported: number; skipped: number }
  | { kind: "error"; message: string };

export const INVALID_ARCHIVE_MESSAGE = "This file isn’t an emdy export.";

const [status, setStatus] = createSignal<LibraryStatus>({ kind: "loading" });
const [saveError, setSaveError] = createSignal<string | null>(null);
const [importOutcome, setImportOutcome] = createSignal<ImportStatus | null>(null);

export const librarySaveError = saveError;
export const importStatus = importOutcome;

let source: DirectorySource = () => createOriginPrivateDirectory();
let library: Library | null = null;
let tracked = new Map<string, DocumentRecord>();

export const libraryStatus = status;

export function useLibraryDirectory(next: DirectorySource): () => void {
  const previous = source;
  source = next;
  return () => {
    source = previous;
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function open(directory: Directory): Promise<void> {
  await library?.flush();
  const opened = createLibrary(directory, {
    recoverJournals: true,
    onError: (error) => {
      if (library === opened) setSaveError(describe(error));
    },
    onSaved: () => {
      if (library === opened) setSaveError(null);
    },
    onRefresh: (result) => {
      if (library !== opened) return;
      applyRefresh(result);
      flush();
      followRenamedFiles();
    },
  });
  const loaded = await opened.load();
  library = opened;
  const records = loadDocuments(loaded);
  useLinkCatalog(opened);
  tracked = new Map(records.map((doc) => [doc.id, doc]));
  setSaveError(null);
  setStatus({ kind: "ready" });
}

export async function startLibrary(): Promise<void> {
  setStatus({ kind: "loading" });
  try {
    await open(await source());
  } catch (error) {
    setStatus({ kind: "error", message: describe(error) });
  }
}

export async function flushLibrary(): Promise<void> {
  editorApi()?.flush();
  flush();
  const current = library;
  if (!current) return;
  writeJournal(current.dirtyDocuments());
  await current.flush();
  if (library === current && !current.pending()) clearJournal();
}

export async function refreshLibrary(): Promise<void> {
  const current = library;
  if (!current || untrack(status).kind !== "ready") return;
  await current.refresh((id) => findDocument(id)?.text);
}

function applyRefresh(result: LibraryRefresh): void {
  for (const id of result.removed) deleteDocument(id);
  for (const doc of result.updated)
    replaceDocument(doc.id, doc.title, doc.text, doc.modified, doc.icon ?? null);
  addDocuments(result.added);
}

export interface TrackingWindow {
  document: Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState">;
  addEventListener: Window["addEventListener"];
  removeEventListener: Window["removeEventListener"];
}

export function trackLibrary(win: TrackingWindow = window): void {
  createEffect(documents, (list) => {
    const current = library;
    if (!current) return;
    const previous = tracked;
    const next = new Map<string, DocumentRecord>();
    for (const doc of list) {
      next.set(doc.id, doc);
      if (previous.get(doc.id) !== doc) current.save(doc);
    }
    for (const id of previous.keys()) if (!next.has(id)) current.remove(id);
    tracked = next;
  });

  const onVisibility = () => {
    if (win.document.visibilityState === "hidden") void retryLibrarySave();
    else void refreshLibrary().catch((error) => setSaveError(describe(error)));
  };
  const onPageHide = () => void retryLibrarySave();
  win.document.addEventListener("visibilitychange", onVisibility);
  win.addEventListener("pagehide", onPageHide);
  onCleanup(() => {
    win.document.removeEventListener("visibilitychange", onVisibility);
    win.removeEventListener("pagehide", onPageHide);
  });
}

export async function retryLibrarySave(): Promise<void> {
  try {
    await flushLibrary();
    setSaveError(null);
  } catch (error) {
    setSaveError(describe(error));
  }
}

export function currentLibrary(): Library | null {
  return library;
}

export interface LibraryExport {
  name: string;
  text: string;
}

export async function exportLibrary(now: () => number = Date.now): Promise<LibraryExport> {
  await flushLibrary();
  const current = library;
  const stamp = now();
  const archived: ArchiveDocument[] = untrack(documents).map((doc) => {
    const entry = current?.entry(doc.id);
    return {
      id: doc.id,
      title: doc.title,
      text: doc.text,
      created: entry?.created ?? doc.modified,
      modified: entry?.modified ?? doc.modified,
      ...(doc.icon ? { icon: doc.icon } : {}),
    };
  });
  return { name: archiveFilename(stamp), text: serializeArchive(archived, stamp) };
}

export async function downloadLibrary(): Promise<void> {
  const { name, text } = await exportLibrary();
  downloadText(name, text, ARCHIVE_MIME_TYPE);
}

export async function importLibraryText(raw: string): Promise<ImportSummary> {
  const archive = parseArchive(raw);
  if (!archive) throw new Error(INVALID_ARCHIVE_MESSAGE);
  const current = library;
  if (!current || untrack(status).kind !== "ready")
    throw new Error("Your documents aren’t ready yet.");
  await current.flush();
  const result = await current.import(
    archive.documents.map((doc) => ({ ...doc, title: normalizeTitle(doc.title) })),
  );
  return { imported: result.imported, skipped: result.skipped };
}

export async function importLibraryFile(file: Blob): Promise<void> {
  setImportOutcome(null);
  try {
    const summary = await importLibraryText(await file.text());
    setImportOutcome({ kind: "imported", ...summary });
  } catch (error) {
    setImportOutcome({ kind: "error", message: describe(error) });
  }
}

export function dismissImportStatus(): void {
  setImportOutcome(null);
}

export function resetLibraryState(): void {
  library = null;
  resetLinkState();
  setSaveError(null);
  setImportOutcome(null);
  tracked = new Map();
  setStatus({ kind: "loading" });
}
