import { createMemo, createSignal, untrack } from "solid-js";
import { sameDocumentIcon, type DocumentIcon } from "~/lib/document-icon";
import { makeDocumentId } from "~/lib/route";
import { deriveTitle, isAutomaticTitle, UNTITLED } from "~/lib/title";
import {
  forgetPosition,
  lastDocumentId,
  rememberDocument,
  retainPins,
  retainPositions,
  unpinDocument,
} from "./workspace";

export const DEFAULT_TITLE = UNTITLED;

export interface DocumentRecord {
  id: string;
  title: string;
  text: string;
  revision: number;
  /** When the document was last written, in epoch milliseconds. */
  modified: number;
  icon: DocumentIcon | null;
  fixedTitle?: boolean;
}

export type DocumentListing = Pick<DocumentRecord, "id" | "title" | "icon">;

export function toListing(doc: DocumentRecord): DocumentListing {
  return { id: doc.id, title: doc.title, icon: doc.icon };
}

export function sameListing(a: DocumentListing, b: DocumentListing): boolean {
  return a.id === b.id && a.title === b.title && sameDocumentIcon(a.icon, b.icon);
}

export interface DocumentInput {
  id: string;
  title: string;
  text: string;
  modified?: number;
  icon?: DocumentIcon | null;
  fixedTitle?: boolean;
}

export const EMPTY_DOCUMENT: DocumentRecord = {
  id: "",
  title: "",
  text: "",
  revision: 0,
  modified: 0,
  icon: null,
};

const now = () => Date.now();

function startingDocumentId(list: readonly DocumentRecord[]): string {
  const remembered = lastDocumentId();
  return list.find((doc) => doc.id === remembered)?.id ?? list[0]?.id ?? "";
}

const [documents, setDocumentsSignal] = createSignal<DocumentRecord[]>([]);
const [activeDocumentId, setActiveDocumentIdSignal] = createSignal("");

function activate(id: string): void {
  setActiveDocumentIdSignal(id);
  if (id) rememberDocument(id);
}

const activeDocument = createMemo(
  () =>
    documents().find((doc) => doc.id === activeDocumentId()) ?? documents()[0] ?? EMPTY_DOCUMENT,
);
const docText = createMemo(() => activeDocument().text);
const title = createMemo(() => activeDocument().title);
const activeRevision = createMemo(() => activeDocument().revision);
const titleIsAutomatic = createMemo(() => {
  const doc = activeDocument();
  return doc.id !== "" && !doc.fixedTitle && isAutomaticTitle(doc.title, doc.text);
});
const hasDocuments = createMemo(() => documents().length > 0);

const makeId = () => makeDocumentId(untrack(documents).map((doc) => doc.id));

export {
  documents,
  activeDocumentId,
  activeDocument,
  activeRevision,
  docText,
  hasDocuments,
  title,
  titleIsAutomatic,
};

export function normalizeTitle(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed : DEFAULT_TITLE;
}

function followText(doc: DocumentRecord, text: string): string {
  return !doc.fixedTitle && isAutomaticTitle(doc.title, doc.text) ? deriveTitle(text) : doc.title;
}

function updateRecord(id: string, patch: (doc: DocumentRecord) => DocumentRecord): void {
  setDocumentsSignal((list) => list.map((doc) => (doc.id === id ? patch(doc) : doc)));
}

export function findDocument(id: string): DocumentRecord | undefined {
  return untrack(documents).find((doc) => doc.id === id);
}

function toRecords(records: readonly DocumentInput[]): DocumentRecord[] {
  return records.map((record) => ({
    id: record.id,
    title: record.title,
    text: record.text,
    revision: 0,
    modified: record.modified ?? now(),
    icon: record.icon ?? null,
    ...(record.fixedTitle ? { fixedTitle: true } : {}),
  }));
}

/**
 * Replaces the whole document list, typically after the storage library has
 * loaded a folder. An empty list leaves the library empty with nothing open.
 */
export function loadDocuments(records: readonly DocumentInput[]): DocumentRecord[] {
  const list = toRecords(records);
  retainPositions(list.map((doc) => doc.id));
  retainPins(list.map((doc) => doc.id));
  setDocumentsSignal(list);
  activate(startingDocumentId(list));
  return list;
}

/**
 * Appends documents discovered outside the app without changing the active
 * one. When nothing is open yet, the first arrival opens.
 */
export function addDocuments(records: readonly DocumentInput[]): void {
  if (records.length === 0) return;
  const existing = new Set(untrack(documents).map((doc) => doc.id));
  const fresh = toRecords(records.filter((record) => !existing.has(record.id)));
  if (fresh.length === 0) return;
  setDocumentsSignal((list) => [...list, ...fresh]);
  if (!untrack(activeDocumentId)) activate(fresh[0].id);
}

/** Replaces the text of the active document. */
export function setDocText(text: string): void {
  updateDocumentText(untrack(activeDocumentId), text);
}

export function saveDocumentText(id: string, text: string): void {
  if (!findDocument(id)) return;
  updateRecord(id, (doc) =>
    doc.text === text ? doc : { ...doc, title: followText(doc, text), text, modified: now() },
  );
}

/** Replaces the text of a specific document, active or not. */
export function updateDocumentText(id: string, text: string): void {
  if (!findDocument(id)) return;
  updateRecord(id, (doc) =>
    doc.text === text
      ? doc
      : {
          ...doc,
          title: followText(doc, text),
          text,
          revision: doc.revision + 1,
          modified: now(),
        },
  );
}

/** Replaces text and title together, for changes that arrived from disk. */
export function replaceDocument(
  id: string,
  title: string,
  text: string,
  modified?: number,
  icon?: DocumentIcon | null,
): void {
  if (!findDocument(id)) return;
  updateRecord(id, (doc) => {
    const normalized = normalizeTitle(title);
    const nextIcon = icon === undefined ? doc.icon : icon;
    const sameIcon = sameDocumentIcon(doc.icon, nextIcon);
    if (doc.text === text && doc.title === normalized && sameIcon) return doc;
    if (doc.text === text && doc.title === normalized) return { ...doc, icon: nextIcon };
    return {
      ...doc,
      title: normalized,
      text,
      icon: nextIcon,
      revision: doc.text === text ? doc.revision : doc.revision + 1,
      modified: modified ?? now(),
    };
  });
}

export function setDocumentIcon(id: string, icon: DocumentIcon | null): void {
  if (!findDocument(id)) return;
  updateRecord(id, (doc) => (sameDocumentIcon(doc.icon, icon) ? doc : { ...doc, icon }));
}

export function setTitle(value: string): void {
  updateRecord(untrack(activeDocumentId), (doc) => {
    const normalized = value.trim() === "" ? deriveTitle(doc.text) : normalizeTitle(value);
    return doc.title === normalized ? doc : { ...doc, title: normalized, modified: now() };
  });
}

export function openDocument(id: string): boolean {
  if (!findDocument(id)) return false;
  activate(id);
  return true;
}

export function createDocument(titleValue = DEFAULT_TITLE, text = ""): DocumentRecord {
  const doc: DocumentRecord = {
    id: makeId(),
    title: normalizeTitle(titleValue),
    text,
    revision: 0,
    modified: now(),
    icon: null,
  };
  setDocumentsSignal((list) => [...list, doc]);
  activate(doc.id);
  return doc;
}

/**
 * Removes a document. Deleting the active document opens its nearest neighbour;
 * deleting the last remaining document leaves the library empty.
 */
export function deleteDocument(id: string): boolean {
  let index = -1;
  let remaining: DocumentRecord[] = [];
  setDocumentsSignal((list) => {
    index = list.findIndex((doc) => doc.id === id);
    if (index === -1) return list;
    remaining = list.filter((doc) => doc.id !== id);
    return remaining;
  });
  if (index === -1) return false;
  forgetPosition(id);
  unpinDocument(id);
  let next = "";
  setActiveDocumentIdSignal((current) => {
    if (current !== id) return current;
    next = remaining[Math.min(index, remaining.length - 1)]?.id ?? "";
    return next;
  });
  if (next) rememberDocument(next);
  return true;
}

/** Test helper: replaces the whole library with the given documents. */
export function resetDocumentState(records: readonly DocumentInput[] = []): void {
  const list = toRecords(records);
  setDocumentsSignal(list);
  setActiveDocumentIdSignal(list[0]?.id ?? "");
}

export function clearDocumentState(): void {
  setDocumentsSignal([]);
  setActiveDocumentIdSignal("");
}
