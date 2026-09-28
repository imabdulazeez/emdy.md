import type { LoadedDocument } from "./catalog";
import { isDocumentIcon, sameDocumentIcon, type DocumentIcon } from "~/lib/document-icon";
import { hashText } from "./hash";
import { isDocumentId, makeDocumentId } from "~/lib/route";
import { storage, storageKey } from "./key-value";

const JOURNAL_AREA = storageKey("workspace", "pending");
export const JOURNAL_PREFIX = `${JOURNAL_AREA}:`;
export const JOURNAL_KEY = `${JOURNAL_PREFIX}${crypto.randomUUID()}`;

export interface JournalSnapshot {
  key: string;
  value: string;
}

export interface JournalEntry {
  id: string;
  title: string;
  text: string;
  bases: string[];
  icon?: DocumentIcon | null;
}

export function isJournalEntry(value: unknown): value is JournalEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  if (
    !(
      typeof entry.id === "string" &&
      isDocumentId(entry.id) &&
      typeof entry.title === "string" &&
      typeof entry.text === "string" &&
      Array.isArray(entry.bases) &&
      entry.bases.every((hash) => typeof hash === "string")
    )
  )
    return false;
  if (entry.icon !== undefined && entry.icon !== null && !isDocumentIcon(entry.icon))
    delete entry.icon;
  return true;
}

export function readJournal(key = JOURNAL_KEY): JournalEntry[] {
  const raw = storage().get(key);
  if (raw === null) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) && value.every(isJournalEntry) ? value : [];
  } catch {
    return [];
  }
}

export function writeJournal(entries: readonly JournalEntry[], key = JOURNAL_KEY): void {
  if (entries.length === 0) {
    storage().remove(key);
    return;
  }
  storage().set(key, JSON.stringify(entries));
}

export function clearJournal(key = JOURNAL_KEY): void {
  storage().remove(key);
}

export function isJournalSnapshot(value: unknown): value is JournalSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const snapshot = value as Record<string, unknown>;
  if (
    typeof snapshot.key !== "string" ||
    (snapshot.key !== JOURNAL_AREA && !snapshot.key.startsWith(JOURNAL_PREFIX)) ||
    typeof snapshot.value !== "string"
  )
    return false;
  try {
    const entries: unknown = JSON.parse(snapshot.value);
    return Array.isArray(entries) && entries.every(isJournalEntry);
  } catch {
    return false;
  }
}

export function readJournals(): JournalSnapshot[] {
  return storage()
    .keys()
    .filter((key) => key === JOURNAL_AREA || key.startsWith(JOURNAL_PREFIX))
    .map((key) => ({ key, value: storage().get(key) }))
    .filter(isJournalSnapshot);
}

export function acknowledgeJournal(snapshot: JournalSnapshot): void {
  if (storage().get(snapshot.key) === snapshot.value) storage().remove(snapshot.key);
}

export interface JournalDocument {
  id: string;
  title: string;
  text: string;
  icon?: DocumentIcon | null;
}

export interface JournalReplay {
  documents: JournalDocument[];
  resave: JournalDocument[];
}

/**
 * Merges edits journaled during an interrupted flush into the freshly loaded
 * documents. A journaled edit whose known bases no longer match the file on
 * disk yields a conflict copy instead of overwriting outside changes.
 */
export function replayJournal(
  loaded: readonly LoadedDocument[],
  pending: readonly JournalEntry[],
): JournalReplay {
  const byId = new Map(loaded.map((doc) => [doc.id, doc]));
  const taken = new Set(loaded.map((doc) => doc.id));
  const merged: JournalDocument[] = loaded.map(({ id, title, text }) => ({ id, title, text }));
  const extras: JournalDocument[] = [];
  const resave: JournalDocument[] = [];
  const replace = (doc: JournalDocument) => {
    const index = merged.findIndex((item) => item.id === doc.id);
    merged[index] = doc;
  };
  for (const entry of pending) {
    const icon = entry.icon === undefined ? {} : { icon: entry.icon };
    const doc = { id: entry.id, title: entry.title, text: entry.text, ...icon };
    const current = byId.get(entry.id);
    if (!current) {
      taken.add(doc.id);
      extras.push(doc);
      resave.push(doc);
      continue;
    }
    const sameIcon = entry.icon === undefined || sameDocumentIcon(current.icon, entry.icon);
    if (hashText(entry.text) === current.hash && current.title === entry.title && sameIcon)
      continue;
    if (entry.bases.length > 0 && !entry.bases.includes(current.hash)) {
      const copy = {
        id: makeDocumentId(taken),
        title: `${entry.title} (conflict)`,
        text: entry.text,
        ...icon,
      };
      taken.add(copy.id);
      extras.push(copy);
      resave.push(copy);
      continue;
    }
    if (current.text === entry.text && current.title === entry.title && sameIcon) continue;
    replace(doc);
    resave.push(doc);
  }
  return { documents: [...merged, ...extras], resave };
}
