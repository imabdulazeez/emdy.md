import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";

type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>["resolveInner"]>;

export interface ActiveFormats {
  bold: boolean;
  italic: boolean;
  strikethrough: boolean;
  code: boolean;
  link: boolean;
  heading: number;
  quote: boolean;
  bulletList: boolean;
  orderedList: boolean;
  taskList: boolean;
  codeBlock: boolean;
}

export const EMPTY_FORMATS: ActiveFormats = Object.freeze({
  bold: false,
  italic: false,
  strikethrough: false,
  code: false,
  link: false,
  heading: 0,
  quote: false,
  bulletList: false,
  orderedList: false,
  taskList: false,
  codeBlock: false,
});

export function formatsEqual(a: ActiveFormats, b: ActiveFormats): boolean {
  return (Object.keys(a) as (keyof ActiveFormats)[]).every((key) => a[key] === b[key]);
}

const HEADING_RE = /^(?:ATXHeading|SetextHeading)([1-6])$/;

function collect(node: SyntaxNode | null, formats: ActiveFormats, inline: boolean): void {
  let listSeen = false;
  for (let current = node; current; current = current.parent) {
    const name = current.name;
    if (inline) {
      if (name === "StrongEmphasis") formats.bold = true;
      else if (name === "Emphasis") formats.italic = true;
      else if (name === "Strikethrough") formats.strikethrough = true;
      else if (name === "InlineCode") formats.code = true;
      else if (name === "Link" || name === "Autolink") formats.link = true;
    }
    const heading = HEADING_RE.exec(name);
    if (heading) formats.heading = Number(heading[1]);
    else if (name === "Blockquote") formats.quote = true;
    else if (name === "FencedCode" || name === "CodeBlock") formats.codeBlock = true;
    else if (name === "Task") formats.taskList = true;
    else if ((name === "BulletList" || name === "OrderedList") && !listSeen) {
      listSeen = true;
      if (name === "BulletList") formats.bulletList = true;
      else formats.orderedList = true;
    }
  }
}

export function getActiveFormats(state: EditorState): ActiveFormats {
  const formats: ActiveFormats = { ...EMPTY_FORMATS };
  const tree = syntaxTree(state);
  const range = state.selection.main;
  const pos = range.head;
  const inlineSide = range.empty || range.head === range.to ? -1 : 1;
  collect(tree.resolveInner(pos, inlineSide), formats, true);
  const line = state.doc.lineAt(pos);
  if (line.length > 0) collect(tree.resolveInner(pos, inlineSide === -1 ? 1 : -1), formats, false);
  return formats;
}
