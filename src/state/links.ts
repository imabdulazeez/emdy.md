import { untrack } from "solid-js";
import type { MentionSource } from "~/lib/editor/composer";
import {
  applyTextEdits,
  documentLinkEdits,
  parseLinkHref,
  type DocumentRename,
} from "~/lib/markdown/document-links";
import {
  MARKDOWN_EXTENSION,
  sameFilename,
  sanitizeStem,
  titleFromFilename,
} from "~/lib/storage/filenames";
import { activeDocumentId, documents, findDocument, title, updateDocumentText } from "./document";
import { editorApi } from "./editor-api";
import { currentDocumentPath, type NavigationWindow } from "./navigation";

export interface LinkCatalogEntry {
  id: string;
  file: string;
  title: string;
  created: number;
}

/** The files the library has written, by document id. */
export interface LinkCatalog {
  entry(id: string): LinkCatalogEntry | undefined;
  entries(): Iterable<LinkCatalogEntry>;
}

let catalog: LinkCatalog | null = null;
let known = new Map<string, { file: string; title: string }>();

function snapshot(): Map<string, { file: string; title: string }> {
  const next = new Map<string, { file: string; title: string }>();
  if (!catalog) return next;
  for (const entry of catalog.entries())
    next.set(entry.id, { file: entry.file, title: entry.title });
  return next;
}

/** Points links at the library's files, and takes the current files as the baseline for renames. */
export function useLinkCatalog(next: LinkCatalog | null): void {
  catalog = next;
  known = snapshot();
}

/** The file a new link to this document points at: its file on disk, or the one it will get. */
export function documentFile(id: string): string {
  const entry = catalog?.entry(id);
  if (entry) return entry.file;
  return `${sanitizeStem(findDocument(id)?.title ?? "")}${MARKDOWN_EXTENSION}`;
}

/** The document a link's file names: by file on disk first, then by title. */
export function resolveDocumentFile(file: string): string | null {
  const list = untrack(documents);
  for (const doc of list) {
    const entry = catalog?.entry(doc.id);
    if (entry && sameFilename(entry.file, file)) return doc.id;
  }
  for (const doc of list) {
    if (!catalog?.entry(doc.id) && sameFilename(documentFile(doc.id), file)) return doc.id;
  }
  const wanted = titleFromFilename(file).toLowerCase();
  return list.find((doc) => doc.title.toLowerCase() === wanted)?.id ?? null;
}

/**
 * Opens the document or heading a local link names, through the URL fragment so the
 * host only ever sees `/`. Returns false when the link names nothing in the library.
 */
export function followLink(
  href: string,
  win: Pick<NavigationWindow, "location"> = window,
): boolean {
  const target = parseLinkHref(href);
  if (target.kind === "external" || target.kind === "other") return false;
  const id =
    target.kind === "heading" ? untrack(activeDocumentId) : resolveDocumentFile(target.file);
  if (!id) return false;
  win.location.hash = currentDocumentPath(id, target.heading);
  return true;
}

export function rewriteDocumentLinks(renames: readonly DocumentRename[]): void {
  if (renames.length === 0) return;
  const active = untrack(activeDocumentId);
  const editor = untrack(editorApi);
  for (const doc of untrack(documents)) {
    const live = doc.id === active ? editor : null;
    const text = live ? live.getText() : doc.text;
    const edits = documentLinkEdits(text, renames);
    if (edits.length === 0) continue;
    if (live) live.applyEdits(edits);
    else updateDocumentText(doc.id, applyTextEdits(text, edits));
  }
}

/** Compares the library's files with the last baseline and rewrites links to any that moved. */
export function followRenamedFiles(): DocumentRename[] {
  const next = snapshot();
  const renames: DocumentRename[] = [];
  for (const [id, current] of next) {
    const previous = known.get(id);
    if (previous && !sameFilename(previous.file, current.file)) {
      renames.push({
        from: previous.file,
        to: current.file,
        fromTitle: previous.title,
        toTitle: current.title,
      });
    }
  }
  known = next;
  rewriteDocumentLinks(renames);
  return renames;
}

/** The `@` menu's view of the library and the open document. */
export const mentionSource: MentionSource = {
  documents: () => {
    const active = untrack(activeDocumentId);
    return untrack(documents).filter((doc) => doc.id !== active);
  },
  linkTarget: documentFile,
  title: () => untrack(title),
  created: () => catalog?.entry(untrack(activeDocumentId))?.created ?? null,
  now: () => new Date(),
};

export function resetLinkState(): void {
  catalog = null;
  known = new Map();
}
