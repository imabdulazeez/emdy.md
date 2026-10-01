import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { URL_SCHEME } from "~/lib/markdown/href";

type SyntaxNode = ReturnType<typeof syntaxTree>["topNode"];

export function cleanUrl(raw: string): string {
  return raw.trim().replace(/^<([\s\S]*)>$/, "$1");
}

function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

const referenceCache = new WeakMap<EditorState, Map<string, string>>();

/** `[label]: url` definitions keyed by normalized label; the first definition wins, as in CommonMark. */
function linkReferences(state: EditorState): Map<string, string> {
  const cached = referenceCache.get(state);
  if (cached) return cached;
  const references = new Map<string, string>();
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== "LinkReference") return;
      const labelNode = node.node.getChild("LinkLabel");
      const url = node.node.getChild("URL");
      if (!labelNode || !url) return false;
      const key = normalizeLabel(state.sliceDoc(labelNode.from + 1, labelNode.to - 1));
      if (!references.has(key)) {
        references.set(key, cleanUrl(state.sliceDoc(url.from, url.to)));
      }
      return false;
    },
  });
  referenceCache.set(state, references);
  return references;
}

/** Destination of an inline, full, collapsed, or shortcut reference link. */
export function linkDestination(state: EditorState, link: SyntaxNode): string {
  const url = link.getChild("URL");
  if (url) return cleanUrl(state.sliceDoc(url.from, url.to));
  const label = link.getChild("LinkLabel");
  let key = label ? state.sliceDoc(label.from + 1, label.to - 1) : "";
  if (!key.trim()) {
    const [open, close] = link.getChildren("LinkMark");
    if (open && close) key = state.sliceDoc(open.to, close.from);
  }
  return linkReferences(state).get(normalizeLabel(key)) ?? "";
}

const URL_OWNERS = new Set(["Link", "Image", "Autolink", "LinkReference"]);

export function isBareUrl(node: SyntaxNode): boolean {
  return node.name === "URL" && !URL_OWNERS.has(node.parent?.name ?? "");
}

/** The target a Link, Autolink, or bare URL node points at, with `mailto:` added to a bare email and `https://` to a `www.` address. */
export function linkHref(state: EditorState, node: SyntaxNode): string {
  if (node.name !== "Autolink" && !isBareUrl(node)) return linkDestination(state, node);
  const raw = cleanUrl(state.sliceDoc(node.from, node.to));
  if (/^www\./i.test(raw)) return `https://${raw}`;
  return !URL_SCHEME.test(raw) && raw.includes("@") ? `mailto:${raw}` : raw;
}
