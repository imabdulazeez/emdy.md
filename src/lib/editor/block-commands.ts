import { syntaxTree } from "@codemirror/language";
import {
  type ChangeSpec,
  EditorSelection,
  type EditorState,
  type Line,
  type StateCommand,
} from "@codemirror/state";
import {
  formatLinePrefix,
  isBlankLine,
  isOrderedMarker,
  type LinePrefix,
  orderedMarker,
  parseLinePrefix,
} from "./line-prefix";

export const FENCE_RE = /^[ \t]{0,3}(`{3,}|~{3,})/;
export const FOOTNOTE_DEF_RE = /^\[\^([^\]\s]+)\]:/gm;

export interface TableOptions {
  rows: number;
  columns: number;
  header: boolean;
}

export const DEFAULT_TABLE: TableOptions = { rows: 2, columns: 3, header: true };
export const MAX_TABLE_ROWS = 20;
export const MAX_TABLE_COLUMNS = 10;
export const TABLE_HEADER_LABEL = "Column";

function clampCount(value: number, max: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(max, Math.trunc(value)));
}

export function buildTable(options: Partial<TableOptions> = {}): string {
  const { rows, columns, header } = { ...DEFAULT_TABLE, ...options };
  const columnCount = clampCount(columns, MAX_TABLE_COLUMNS);
  const rowCount = clampCount(rows, MAX_TABLE_ROWS);
  const labels = Array.from({ length: columnCount }, (_, index) =>
    header ? `${TABLE_HEADER_LABEL} ${index + 1}` : "",
  );
  const widths = labels.map((label) => Math.max(label.length, 3));
  const toRow = (cells: string[]) =>
    `| ${cells.map((cell, index) => cell.padEnd(widths[index])).join(" | ")} |`;
  const lines = [toRow(labels), `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`];
  const bodyRows = header ? rowCount - 1 : rowCount;
  for (let row = 0; row < bodyRows; row++) lines.push(toRow(labels.map(() => "")));
  return lines.join("\n");
}

export function tableCursor(table: string, header: boolean): { from: number; to: number } {
  if (header) {
    const at = table.indexOf(`${TABLE_HEADER_LABEL} 1`);
    return { from: at, to: at + `${TABLE_HEADER_LABEL} 1`.length };
  }
  const lines = table.split("\n");
  const target = lines.length > 2 ? 2 : 0;
  const start =
    lines.slice(0, target).reduce((sum, line) => sum + line.length + 1, 0) + "| ".length;
  return { from: start, to: start };
}

export const TABLE_TEMPLATE = buildTable();

export function selectedLines(state: EditorState): Line[] {
  const lines: Line[] = [];
  const seen = new Set<number>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n++) {
      if (seen.has(n)) continue;
      seen.add(n);
      lines.push(state.doc.line(n));
    }
  }
  return lines.sort((a, b) => a.from - b.from);
}

function targetLines(lines: Line[]): Line[] {
  const filled = lines.filter((line) => !isBlankLine(line.text));
  return filled.length > 0 ? filled : lines;
}

type PrefixEdit = (prefix: LinePrefix, line: Line, index: number) => Partial<LinePrefix> | null;

interface HeadingLine {
  line: Line;
  heading: number;
  underline: Line | null;
}

function rewritePrefixes(
  lines: Line[],
  edit: PrefixEdit,
): { changes: ChangeSpec[]; changed: boolean } {
  const changes: ChangeSpec[] = [];
  lines.forEach((line, index) => {
    const prefix = parseLinePrefix(line.text);
    const patch = edit(prefix, line, index);
    if (!patch) return;
    const next = formatLinePrefix({ ...prefix, ...patch });
    const current = line.text.slice(
      0,
      line.text.length - prefix.content.length - prefix.closing.length,
    );
    if (next === current) return;
    changes.push({ from: line.from, to: line.from + current.length, insert: next });
  });
  return { changes, changed: changes.length > 0 };
}

function dispatchPrefixEdit(
  target: Parameters<StateCommand>[0],
  lines: Line[],
  edit: PrefixEdit,
): boolean {
  const { changes, changed } = rewritePrefixes(lines, edit);
  if (!changed) return true;
  const changeSet = target.state.changes(changes);
  target.dispatch(
    target.state.update({
      changes: changeSet,
      selection: target.state.selection.map(changeSet, 1),
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
}

function headingLine(state: EditorState, line: Line): HeadingLine {
  const prefix = parseLinePrefix(line.text);
  const contentFrom = line.from + line.text.length - prefix.content.length - prefix.closing.length;
  let node = syntaxTree(state).resolveInner(contentFrom, 1);
  while (node.parent && !/^SetextHeading[12]$/.test(node.name)) node = node.parent;
  const match = /^SetextHeading([12])$/.exec(node.name);
  if (!match) return { line, heading: prefix.heading, underline: null };
  return {
    line: state.doc.lineAt(node.from),
    heading: Number(match[1]),
    underline: state.doc.lineAt(Math.max(node.from, node.to - 1)),
  };
}

function selectedHeadingLines(state: EditorState): HeadingLine[] {
  const entries = selectedLines(state).map((line) => headingLine(state, line));
  const filled = entries.filter((entry) => !isBlankLine(entry.line.text));
  const targets = filled.length > 0 ? filled : entries;
  return targets.filter(
    (entry, index) =>
      targets.findIndex((candidate) => candidate.line.number === entry.line.number) === index,
  );
}

function dispatchHeadingEdit(
  target: Parameters<StateCommand>[0],
  entries: HeadingLine[],
  heading: (entry: HeadingLine) => number,
): boolean {
  const changes: ChangeSpec[] = [];
  entries.forEach((entry) => {
    const nextHeading = heading(entry);
    if (nextHeading === entry.heading) return;
    const prefix = parseLinePrefix(entry.line.text);
    const next = formatLinePrefix({ ...prefix, heading: nextHeading });
    const current = entry.line.text.slice(
      0,
      entry.line.text.length - prefix.content.length - prefix.closing.length,
    );
    if (next !== current) {
      changes.push({ from: entry.line.from, to: entry.line.from + current.length, insert: next });
    }
    if (entry.underline && entry.underline.number !== entry.line.number) {
      changes.push({ from: entry.line.to, to: entry.underline.to, insert: "" });
    }
    if (prefix.closing) {
      changes.push({ from: entry.line.to - prefix.closing.length, to: entry.line.to, insert: "" });
    }
  });
  if (changes.length === 0) return true;
  const changeSet = target.state.changes(changes);
  target.dispatch(
    target.state.update({
      changes: changeSet,
      selection: target.state.selection.map(changeSet, 1),
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
}

export function setHeading(level: number): StateCommand {
  const heading = Math.max(0, Math.min(6, Math.trunc(level)));
  return (target) => dispatchHeadingEdit(target, selectedHeadingLines(target.state), () => heading);
}

export function toggleHeading(level: number): StateCommand {
  const heading = Math.max(1, Math.min(6, Math.trunc(level)));
  return (target) => {
    const lines = selectedHeadingLines(target.state);
    const allOn = lines.every((line) => line.heading === heading);
    return dispatchHeadingEdit(target, lines, () => (allOn ? 0 : heading));
  };
}

export const toggleBlockquote: StateCommand = (target) => {
  const lines = selectedLines(target.state);
  const filled = targetLines(lines);
  const allOn = filled.every((line) => parseLinePrefix(line.text).quote !== "");
  return dispatchPrefixEdit(target, lines, (prefix, line) => {
    if (allOn) return { quote: prefix.quote.replace(/^>[ \t]?/, "") };
    if (prefix.quote !== "") return null;
    return { quote: isBlankLine(line.text) ? ">" : "> " };
  });
};

export const toggleBulletList: StateCommand = (target) => {
  const lines = targetLines(selectedLines(target.state));
  const allOn = lines.every((line) => {
    const prefix = parseLinePrefix(line.text);
    return prefix.marker !== null && !isOrderedMarker(prefix.marker) && prefix.task === null;
  });
  return dispatchPrefixEdit(target, lines, () =>
    allOn ? { marker: null, gap: "", task: null } : { marker: "-", gap: " ", task: null },
  );
};

function precedingOrderedNumber(state: EditorState, first: Line): number {
  if (first.number === 1) return 0;
  const above = parseLinePrefix(state.doc.line(first.number - 1).text);
  const current = parseLinePrefix(first.text);
  const aboveDepth = above.quote.replace(/[^>]/g, "").length;
  const currentDepth = current.quote.replace(/[^>]/g, "").length;
  if (
    !isOrderedMarker(above.marker) ||
    above.indent !== current.indent ||
    aboveDepth !== currentDepth
  ) {
    return 0;
  }
  return Number.parseInt(above.marker as string, 10);
}

export const toggleOrderedList: StateCommand = (target) => {
  const lines = targetLines(selectedLines(target.state));
  const allOn = lines.every((line) => {
    const prefix = parseLinePrefix(line.text);
    return isOrderedMarker(prefix.marker) && prefix.task === null;
  });
  let number = 0;
  return dispatchPrefixEdit(target, lines, (prefix, line, index) => {
    if (allOn) return { marker: null, gap: "", task: null };
    if (index === 0 || lines[index - 1].number !== line.number - 1) {
      number = precedingOrderedNumber(target.state, line) + 1;
    } else {
      number += 1;
    }
    return { marker: orderedMarker(number, prefix.marker), gap: " ", task: null };
  });
};

export const toggleTaskList: StateCommand = (target) => {
  const lines = targetLines(selectedLines(target.state));
  const allOn = lines.every((line) => parseLinePrefix(line.text).task !== null);
  return dispatchPrefixEdit(target, lines, (prefix) =>
    allOn
      ? { marker: null, gap: "", task: null }
      : { marker: prefix.marker ?? "-", gap: prefix.gap || " ", task: prefix.task ?? " " },
  );
};

type SyntaxNode = ReturnType<typeof syntaxTree>["topNode"];

function enclosingFence(state: EditorState, pos: number): SyntaxNode | null {
  let node = syntaxTree(state).resolveInner(pos, 1);
  while (node.name !== "FencedCode") {
    if (!node.parent) return null;
    node = node.parent;
  }
  return node;
}

export const toggleCodeBlock: StateCommand = ({ state, dispatch }) => {
  const main = state.selection.main;
  const fence = enclosingFence(state, main.from);
  if (fence) {
    const [openMark, closeMark] = fence.getChildren("CodeMark");
    const open = state.doc.lineAt(openMark.from);
    const structuralPrefix = open.text.slice(0, openMark.from - open.from);
    const preserveOpeningLine = parseLinePrefix(structuralPrefix).marker !== null;
    const changes: ChangeSpec[] = [];
    if (preserveOpeningLine) {
      changes.push({ from: openMark.from, to: open.to });
    } else {
      changes.push({ from: open.from, to: Math.min(open.to + 1, state.doc.length) });
    }
    if (closeMark) {
      const close = state.doc.lineAt(closeMark.from);
      changes.push({ from: Math.max(close.from - 1, open.to + 1), to: close.to });
    }
    const changeSet = state.changes(changes);
    dispatch(
      state.update({
        changes: changeSet,
        selection: state.selection.map(changeSet, 1),
        scrollIntoView: true,
        userEvent: "delete",
      }),
    );
    return true;
  }
  const lines = selectedLines(state);
  const first = lines[0];
  const last = lines[lines.length - 1];
  const opening = "```\n";
  const changeSet = state.changes([
    { from: first.from, insert: opening },
    { from: last.to, insert: "\n```" },
  ]);
  const selection = EditorSelection.create(
    state.selection.ranges.map((range) =>
      EditorSelection.range(range.anchor + opening.length, range.head + opening.length),
    ),
    state.selection.mainIndex,
  );
  dispatch(
    state.update({ changes: changeSet, selection, scrollIntoView: true, userEvent: "input" }),
  );
  return true;
};

interface BlockInsertion {
  from: number;
  to: number;
  insert: string;
  offset: number;
}

function blockInsertion(state: EditorState, block: string): BlockInsertion {
  const line = state.doc.lineAt(state.selection.main.head);
  const prev = line.number > 1 ? state.doc.line(line.number - 1) : null;
  const next = line.number < state.doc.lines ? state.doc.line(line.number + 1) : null;
  const trailing = !next || !isBlankLine(next.text) ? "\n" : "";
  if (isBlankLine(line.text)) {
    const leading = prev && !isBlankLine(prev.text) ? "\n" : "";
    return {
      from: line.from,
      to: line.to,
      insert: `${leading}${block}${trailing}`,
      offset: leading.length,
    };
  }
  const leading = "\n\n";
  return {
    from: line.to,
    to: line.to,
    insert: `${leading}${block}${trailing}`,
    offset: leading.length,
  };
}

export const insertHorizontalRule: StateCommand = ({ state, dispatch }) => {
  const rule = "---";
  const insertion = blockInsertion(state, rule);
  const cursor = insertion.from + insertion.offset + rule.length + 1;
  dispatch(
    state.update({
      changes: { from: insertion.from, to: insertion.to, insert: insertion.insert },
      selection: EditorSelection.cursor(cursor),
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
};

export function insertTableWith(options: Partial<TableOptions> = {}): StateCommand {
  const header = { ...DEFAULT_TABLE, ...options }.header;
  const table = buildTable(options);
  const cursor = tableCursor(table, header);
  return ({ state, dispatch }) => {
    const insertion = blockInsertion(state, table);
    const start = insertion.from + insertion.offset;
    dispatch(
      state.update({
        changes: { from: insertion.from, to: insertion.to, insert: insertion.insert },
        selection: EditorSelection.range(start + cursor.from, start + cursor.to),
        scrollIntoView: true,
        userEvent: "input",
      }),
    );
    return true;
  };
}

export const insertTable: StateCommand = insertTableWith();

export function nextFootnoteLabel(text: string): string {
  let max = 0n;
  for (const match of text.matchAll(FOOTNOTE_DEF_RE)) {
    if (!/^\d+$/.test(match[1])) continue;
    const value = BigInt(match[1]);
    if (String(value) === match[1] && value > max) max = value;
  }
  return String(max + 1n);
}

export const insertFootnote: StateCommand = ({ state, dispatch }) => {
  const label = nextFootnoteLabel(state.doc.toString());
  const main = state.selection.main;
  const end = state.doc.length;
  const tail = state.sliceDoc(Math.max(0, end - 2), end);
  const refAtEnd = main.to === end;
  const separator = refAtEnd || !tail.endsWith("\n") ? "\n\n" : tail.endsWith("\n\n") ? "" : "\n";
  const definition = `${separator}[^${label}]: `;
  const changeSet = state.changes([
    { from: main.to, insert: `[^${label}]` },
    { from: end, insert: definition },
  ]);
  dispatch(
    state.update({
      changes: changeSet,
      selection: EditorSelection.cursor(changeSet.mapPos(end, 1)),
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
};
