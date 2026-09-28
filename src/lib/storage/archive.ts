import { isDocumentIcon, type DocumentIcon } from "~/lib/document-icon";
import { isDocumentId, makeDocumentId } from "~/lib/route";
import { hashText } from "./hash";

export const ARCHIVE_FORMAT = "emdy-library";
export const ARCHIVE_VERSION = 1;
export const ARCHIVE_EXTENSION = ".json";
export const ARCHIVE_MIME_TYPE = "application/json";

export interface ArchiveDocument {
  id: string;
  title: string;
  text: string;
  created: number;
  modified: number;
  icon?: DocumentIcon;
}

export interface Archive {
  format: typeof ARCHIVE_FORMAT;
  version: typeof ARCHIVE_VERSION;
  exportedAt: number;
  documents: ArchiveDocument[];
}

export interface MergePlan {
  added: ArchiveDocument[];
  skipped: number;
}

export interface ImportSummary {
  imported: number;
  skipped: number;
}

const isStamp = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export function isArchiveDocument(value: unknown): value is ArchiveDocument {
  if (typeof value !== "object" || value === null) return false;
  const doc = value as Record<string, unknown>;
  return (
    typeof doc.id === "string" &&
    isDocumentId(doc.id) &&
    typeof doc.title === "string" &&
    typeof doc.text === "string" &&
    isStamp(doc.created) &&
    isStamp(doc.modified)
  );
}

export function isArchive(value: unknown): value is Archive {
  if (typeof value !== "object" || value === null) return false;
  const archive = value as Record<string, unknown>;
  if (archive.format !== ARCHIVE_FORMAT || archive.version !== ARCHIVE_VERSION) return false;
  if (!isStamp(archive.exportedAt) || !Array.isArray(archive.documents)) return false;
  if (!archive.documents.every(isArchiveDocument)) return false;
  return new Set(archive.documents.map((doc) => doc.id)).size === archive.documents.length;
}

export function parseArchive(raw: string): Archive | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isArchive(value)) return null;
    return { ...value, documents: value.documents.map(archiveDocument) };
  } catch {
    return null;
  }
}

function archiveDocument({ id, title, text, created, modified, icon }: ArchiveDocument) {
  const doc: ArchiveDocument = { id, title, text, created, modified };
  if (isDocumentIcon(icon)) doc.icon = icon;
  return doc;
}

export function serializeArchive(
  documents: readonly ArchiveDocument[],
  exportedAt: number,
): string {
  const archive: Archive = {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    exportedAt,
    documents: documents.map(archiveDocument),
  };
  return `${JSON.stringify(archive, null, 2)}\n`;
}

export function archiveFilename(exportedAt: number): string {
  const date = new Date(exportedAt);
  const pad = (part: number) => String(part).padStart(2, "0");
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `emdy-${stamp}${ARCHIVE_EXTENSION}`;
}

const signatureOf = (doc: { title: string; text: string }) => `${doc.title}\n${hashText(doc.text)}`;

export function mergeDocuments(
  existing: readonly { id: string; title: string; text: string }[],
  incoming: readonly ArchiveDocument[],
): MergePlan {
  const ids = new Set(existing.map((doc) => doc.id));
  const signatures = new Set(existing.map(signatureOf));
  const added: ArchiveDocument[] = [];
  let skipped = 0;
  for (const doc of incoming) {
    const signature = signatureOf(doc);
    if (signatures.has(signature)) {
      skipped++;
      continue;
    }
    const id = ids.has(doc.id) ? makeDocumentId(ids) : doc.id;
    ids.add(id);
    signatures.add(signature);
    added.push({ ...doc, id });
  }
  return { added, skipped };
}

const count = (value: number, noun: string) => `${value} ${noun}${value === 1 ? "" : "s"}`;

export function describeImport(summary: ImportSummary): string {
  const { imported, skipped } = summary;
  if (imported === 0 && skipped === 0) return "The file has no documents.";
  if (imported === 0)
    return skipped === 1
      ? "That document is already here."
      : `All ${skipped} documents are already here.`;
  const base = `Imported ${count(imported, "document")}`;
  return skipped === 0 ? `${base}.` : `${base}, ${skipped} already here.`;
}
