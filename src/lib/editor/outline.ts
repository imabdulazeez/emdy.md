import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";

type SyntaxNode = ReturnType<typeof syntaxTree>["topNode"];

export interface OutlineEntry {
  level: number;
  text: string;
  line: number;
}

export interface OutlineResult {
  entries: OutlineEntry[];
  complete: boolean;
}

export const OUTLINE_PARSE_BUDGET_MS = 20;

const HEADING = /^(?:ATX|Setext)Heading([1-6])$/;

const SKIPPED_NODES = new Set([
  "HeaderMark",
  "EmphasisMark",
  "CodeMark",
  "LinkMark",
  "StrikethroughMark",
  "URL",
  "LinkTitle",
  "LinkLabel",
  "HardBreak",
]);

function collectText(state: EditorState, node: SyntaxNode, out: string[]): void {
  let position = node.from;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.from > position) out.push(state.sliceDoc(position, child.from));
    if (child.name === "Escape") out.push(state.sliceDoc(child.from + 1, child.to));
    else if (!SKIPPED_NODES.has(child.name)) collectText(state, child, out);
    position = child.to;
  }
  if (position < node.to) out.push(state.sliceDoc(position, node.to));
}

export function headingText(state: EditorState, heading: SyntaxNode): string {
  const parts: string[] = [];
  collectText(state, heading, parts);
  return parts.join("").replace(/\s+/g, " ").trim();
}

export function readOutline(state: EditorState, budgetMs = OUTLINE_PARSE_BUDGET_MS): OutlineResult {
  const full = ensureSyntaxTree(state, state.doc.length, budgetMs);
  const tree = full ?? syntaxTree(state);
  const entries: OutlineEntry[] = [];
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    const match = HEADING.exec(node.name);
    if (!match) continue;
    entries.push({
      level: Number(match[1]),
      text: headingText(state, node),
      line: state.doc.lineAt(node.from).number,
    });
  }
  return { entries, complete: full !== null };
}

export function activeOutlineIndex(outline: readonly OutlineEntry[], cursorLine: number): number {
  let active = -1;
  for (let i = 0; i < outline.length; i++) {
    if (outline[i].line <= cursorLine) active = i;
    else break;
  }
  return active;
}
