import { createSignal, untrack } from "solid-js";
import { desktopBridge, type DesktopBridge } from "~/lib/desktop/bridge";
import type { LibraryDocument } from "~/lib/storage/library";
import {
  createOpenedFileStore,
  type OpenedDocument,
  type OpenedFileStore,
  type OpenedFilesRefresh,
} from "~/lib/storage/opened-files";
import { addDocuments, deleteDocument, documents, replaceDocument } from "./document";

const [ids, setIds] = createSignal<ReadonlySet<string>>(new Set());
const [error, setError] = createSignal<string | null>(null);
let store: OpenedFileStore | null = null;
let source: () => DesktopBridge | null = () => desktopBridge();

export const openedFileIds = ids;
export const openedFileError = error;

function describe(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

export function useOpenedFilesBridge(next: DesktopBridge | null): () => void {
  const previous = source;
  source = () => next;
  return () => {
    source = previous;
  };
}

export function isOpenedFile(id: string): boolean {
  return ids().has(id);
}

export function ownsDocument(id: string): boolean {
  return untrack(ids).has(id);
}

function libraryDocumentIds(): string[] {
  const opened = untrack(ids);
  return untrack(documents)
    .filter((doc) => !opened.has(doc.id))
    .map((doc) => doc.id);
}

export function applyOpenedFiles(result: OpenedFilesRefresh): void {
  if (result.added.length > 0)
    setIds((current) => new Set([...current, ...result.added.map((doc) => doc.id)]));
  for (const id of result.removed) deleteDocument(id);
  for (const doc of result.updated)
    replaceDocument(doc.id, doc.title, doc.text, doc.modified, doc.icon);
  addDocuments(result.added);
}

export async function loadOpenedFiles(
  taken: readonly string[],
  bridge: DesktopBridge | null = source(),
): Promise<OpenedDocument[]> {
  store = null;
  setIds(new Set<string>());
  if (!bridge) return [];
  const opened = createOpenedFileStore(bridge.files, {
    onError: (failure) => {
      if (store === opened) setError(describe(failure));
    },
    onSaved: () => {
      if (store === opened) setError(null);
    },
    onRefresh: (result) => {
      if (store === opened) applyOpenedFiles(result);
    },
  });
  store = opened;
  try {
    const docs = await opened.load(taken);
    setIds(new Set(docs.map((doc) => doc.id)));
    return docs;
  } catch (failure) {
    setError(describe(failure));
    return [];
  }
}

export function saveOpenedFile(doc: LibraryDocument): void {
  store?.save(doc);
}

export function closeOpenedFile(id: string): void {
  setIds((current) => {
    const next = new Set(current);
    next.delete(id);
    return next;
  });
  void store?.close(id).catch(() => undefined);
}

export async function refreshOpenedFiles(): Promise<void> {
  const current = store;
  if (!current) return;
  const result = await current.refresh(libraryDocumentIds());
  if (store === current) applyOpenedFiles(result);
}

export async function flushOpenedFiles(): Promise<void> {
  await store?.flush();
}

export function clearOpenedFileError(): void {
  setError(null);
}

export function resetOpenedFileState(): void {
  store = null;
  setIds(new Set<string>());
  setError(null);
}
