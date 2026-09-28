import { markdownLanguage } from "@codemirror/lang-markdown";
import { slugify } from "~/lib/route";
import { isExternalHref } from "./href";
import { MARKDOWN_EXTENSION, sameFilename } from "~/lib/storage/filenames";

export type LinkTarget =
  | { kind: "external" }
  | { kind: "heading"; heading: string | null }
  | { kind: "document"; file: string; heading: string | null }
  | { kind: "other" };

export interface DocumentRename {
  from: string;
  to: string;
  fromTitle: string;
  toTitle: string;
}

export interface TextEdit {
  from: number;
  to: number;
  insert: string;
}

const UNSAFE_TARGET = /[\s%()<>[\]\\#?\p{Cc}]/gu;
const encoder = new TextEncoder();

function percentEncode(character: string): string {
  return Array.from(
    encoder.encode(character),
    (byte) => `%${byte.toString(16).toUpperCase().padStart(2, "0")}`,
  ).join("");
}

/** Percent-encodes the characters that would end or confuse a Markdown link destination. */
export function encodeLinkTarget(file: string): string {
  return file.replace(UNSAFE_TARGET, percentEncode);
}

export function escapeLinkLabel(text: string): string {
  return text.replace(/[\\[\]]/g, (character) => `\\${character}`);
}

export function documentLink(title: string, file: string): string {
  return `[${escapeLinkLabel(title)}](${encodeLinkTarget(file)})`;
}

export function headingLink(text: string, slug: string): string {
  return `[${escapeLinkLabel(text)}](#${slug})`;
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function headingOf(fragment: string | undefined): string | null {
  if (!fragment) return null;
  return slugify(decode(fragment)) || null;
}

/** Classifies a link destination: another document, a heading here, or somewhere else. */
export function parseLinkHref(raw: string): LinkTarget {
  const href = raw.trim();
  if (isExternalHref(href)) return { kind: "external" };
  const hash = href.indexOf("#");
  const path = (hash === -1 ? href : href.slice(0, hash)).replace(/\?.*$/, "");
  const fragment = hash === -1 ? undefined : href.slice(hash + 1);
  if (path === "") return { kind: "heading", heading: headingOf(fragment) };
  const name = decode(path).split("/").pop() ?? "";
  if (!name.toLowerCase().endsWith(MARKDOWN_EXTENSION) || name.length <= MARKDOWN_EXTENSION.length)
    return { kind: "other" };
  return { kind: "document", file: name.normalize("NFC"), heading: headingOf(fragment) };
}

function rewrittenTarget(raw: string, renames: readonly DocumentRename[]) {
  const angled = raw.startsWith("<") && raw.endsWith(">");
  const inner = angled ? raw.slice(1, -1) : raw;
  if (isExternalHref(inner)) return null;
  const target = parseLinkHref(inner);
  if (target.kind !== "document") return null;
  const rename = renames.find((candidate) => sameFilename(candidate.from, target.file));
  if (!rename) return null;
  const hash = inner.indexOf("#");
  const fragment = hash === -1 ? "" : inner.slice(hash);
  const next = angled ? `<${rename.to}${fragment}>` : `${encodeLinkTarget(rename.to)}${fragment}`;
  return { rename, text: next };
}

/**
 * The edits that point links at renamed files. A link whose label still reads as the old
 * title takes the new one; a label the writer changed is left alone.
 */
export function documentLinkEdits(text: string, renames: readonly DocumentRename[]): TextEdit[] {
  if (renames.length === 0 || (!text.includes("](") && !text.includes("]:"))) return [];
  const edits: TextEdit[] = [];
  markdownLanguage.parser.parse(text).iterate({
    enter(node) {
      if (node.name !== "URL") return;
      const parent = node.node.parent;
      if (!parent || (parent.name !== "Link" && parent.name !== "LinkReference")) return;
      const next = rewrittenTarget(text.slice(node.from, node.to), renames);
      if (!next) return;
      if (parent.name === "Link") {
        const open = parent.firstChild;
        let labelEnd = open?.nextSibling;
        while (labelEnd && labelEnd.name !== "LinkMark") labelEnd = labelEnd.nextSibling;
        if (open && labelEnd && labelEnd.from > open.to) {
          const label = text.slice(open.to, labelEnd.from);
          if (label === escapeLinkLabel(next.rename.fromTitle) && label.length > 0) {
            const insert = escapeLinkLabel(next.rename.toTitle);
            if (insert !== label) edits.push({ from: open.to, to: labelEnd.from, insert });
          }
        }
      }
      edits.push({ from: node.from, to: node.to, insert: next.text });
    },
  });
  return edits.sort((a, b) => a.from - b.from);
}

export function applyTextEdits(text: string, edits: readonly TextEdit[]): string {
  let result = "";
  let position = 0;
  for (const edit of edits) {
    result += text.slice(position, edit.from) + edit.insert;
    position = edit.to;
  }
  return result + text.slice(position);
}
