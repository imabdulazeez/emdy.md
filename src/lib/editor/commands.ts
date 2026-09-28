import { EditorSelection, type StateCommand } from "@codemirror/state";
import { indentLess, indentMore } from "@codemirror/commands";

export const LIST_LINE_RE = /^(\s*)([-*+]|\d+[.)])(\s+)/;
export const TASK_LINE_RE = /^(\s*)([-*+]|\d+[.)])(\s+)\[([ xX])\](\s?)(.*)$/;

export function toggleWrap(marker: string): StateCommand {
  const len = marker.length;
  return ({ state, dispatch }) => {
    const changes = state.changeByRange((range) => {
      let { from, to } = range;
      if (from === to) {
        const word = state.wordAt(from);
        if (word) {
          from = word.from;
          to = word.to;
        }
      }
      const before = state.sliceDoc(Math.max(0, from - len), from);
      const after = state.sliceDoc(to, to + len);
      if (from - len >= 0 && before === marker && after === marker) {
        return {
          changes: [
            { from: from - len, to: from },
            { from: to, to: to + len },
          ],
          range: EditorSelection.range(from - len, to - len),
        };
      }
      const text = state.sliceDoc(from, to);
      if (text.length >= len * 2 && text.startsWith(marker) && text.endsWith(marker)) {
        return {
          changes: [
            { from, to: from + len },
            { from: to - len, to },
          ],
          range: EditorSelection.range(from, to - len * 2),
        };
      }
      return {
        changes: [
          { from, insert: marker },
          { from: to, insert: marker },
        ],
        range: EditorSelection.range(from + len, to + len),
      };
    });
    dispatch(state.update(changes, { scrollIntoView: true, userEvent: "input" }));
    return true;
  };
}

export const toggleBold = toggleWrap("**");
export const toggleItalic = toggleWrap("*");
export const toggleInlineCode = toggleWrap("`");

export const insertLink: StateCommand = ({ state, dispatch }) => {
  const changes = state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to);
    if (text.length === 0) {
      return {
        changes: { from: range.from, insert: "[]()" },
        range: EditorSelection.cursor(range.from + 1),
      };
    }
    if (/^(https?:\/\/|mailto:)\S+$/i.test(text)) {
      return {
        changes: { from: range.from, to: range.to, insert: `[](${text})` },
        range: EditorSelection.cursor(range.from + 1),
      };
    }
    const insert = `[${text}]()`;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.cursor(range.from + insert.length - 1),
    };
  });
  dispatch(state.update(changes, { scrollIntoView: true, userEvent: "input" }));
  return true;
};

function selectionTouchesListLine(state: Parameters<StateCommand>[0]["state"]): boolean {
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n++) {
      if (LIST_LINE_RE.test(state.doc.line(n).text)) return true;
    }
  }
  return false;
}

export const indentListItem: StateCommand = (target) => {
  if (!selectionTouchesListLine(target.state)) return false;
  return indentMore(target);
};

export const dedentListItem: StateCommand = (target) => {
  if (!selectionTouchesListLine(target.state)) return false;
  return indentLess(target);
};

export function nextListMarker(marker: string): string {
  const ordered = marker.match(/^(\d+)([.)])$/);
  if (!ordered) return marker;
  return `${Number(ordered[1]) + 1}${ordered[2]}`;
}

export const continueTaskList: StateCommand = ({ state, dispatch }) => {
  let handled = false;
  const changes = state.changeByRange((range) => {
    if (!range.empty) return { range };
    const line = state.doc.lineAt(range.from);
    const match = TASK_LINE_RE.exec(line.text);
    if (!match) return { range };
    const [, indent, marker, gap, , , content] = match;
    const prefixLength = match[0].length - content.length;
    if (range.from < line.from + prefixLength) return { range };
    handled = true;
    if (content.trim().length === 0 && range.from === line.to) {
      return {
        changes: { from: line.from, to: line.to, insert: indent },
        range: EditorSelection.cursor(line.from + indent.length),
      };
    }
    const insert = `\n${indent}${nextListMarker(marker)}${gap}[ ] `;
    return {
      changes: { from: range.from, insert },
      range: EditorSelection.cursor(range.from + insert.length),
    };
  });
  if (!handled) return false;
  dispatch(state.update(changes, { scrollIntoView: true, userEvent: "input" }));
  return true;
};

export const toggleStrikethrough = toggleWrap("~~");

export const insertImage: StateCommand = ({ state, dispatch }) => {
  const changes = state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to);
    if (text.length === 0) {
      return {
        changes: { from: range.from, insert: "![]()" },
        range: EditorSelection.cursor(range.from + 2),
      };
    }
    if (/^(https?:\/\/|data:image\/|blob:)\S+$/i.test(text)) {
      return {
        changes: { from: range.from, to: range.to, insert: `![](${text})` },
        range: EditorSelection.cursor(range.from + 2),
      };
    }
    const insert = `![${text}]()`;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.cursor(range.from + insert.length - 1),
    };
  });
  dispatch(state.update(changes, { scrollIntoView: true, userEvent: "input" }));
  return true;
};
