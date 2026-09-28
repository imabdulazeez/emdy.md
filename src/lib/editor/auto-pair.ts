import {
  EditorSelection,
  type EditorState,
  type StateCommand,
  type TransactionSpec,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export const BRACKET_PAIRS: Readonly<Record<string, string>> = { "(": ")", "[": "]", "{": "}" };
export const EMPHASIS_PAIRS: Readonly<Record<string, string>> = {
  "*": "*",
  _: "_",
  "`": "`",
  "~": "~",
};

const CLOSERS = new Set(Object.values(BRACKET_PAIRS));
const WORD_CHAR = /[\p{L}\p{N}]/u;
const PAIR_AHEAD = /^[\s)\]}>*_`~.,;:!?"']?$/u;

function charAt(state: EditorState, pos: number): string {
  if (pos < 0 || pos >= state.doc.length) return "";
  return state.sliceDoc(pos, pos + 1);
}

export function autoPairTransaction(
  state: EditorState,
  from: number,
  to: number,
  text: string,
): TransactionSpec | null {
  if (text.length !== 1 || state.selection.ranges.length !== 1) return null;
  const bracketClose = BRACKET_PAIRS[text];
  const emphasisClose = EMPHASIS_PAIRS[text];
  const close = bracketClose ?? emphasisClose;
  const next = charAt(state, to);
  const prev = charAt(state, from - 1);

  if (from !== to) {
    if (!close) return null;
    return {
      changes: [
        { from, insert: text },
        { from: to, insert: close },
      ],
      selection: EditorSelection.range(from + 1, to + 1),
      userEvent: "input.type",
    };
  }

  if ((CLOSERS.has(text) || emphasisClose) && next === text) {
    if (emphasisClose && prev === text && charAt(state, to + 1) === text) {
      return {
        changes: { from, insert: text + text },
        selection: EditorSelection.cursor(from + 1),
        userEvent: "input.type",
      };
    }
    return { selection: EditorSelection.cursor(from + 1), userEvent: "input.type" };
  }

  if (!close) return null;
  if (!PAIR_AHEAD.test(next)) return null;
  if (emphasisClose && WORD_CHAR.test(prev)) return null;
  if (emphasisClose && next === text) return null;

  return {
    changes: { from, insert: text + close },
    selection: EditorSelection.cursor(from + 1),
    userEvent: "input.type",
  };
}

export const deletePairBackward: StateCommand = ({ state, dispatch }) => {
  const range = state.selection.main;
  if (!range.empty || state.selection.ranges.length !== 1) return false;
  const prev = charAt(state, range.from - 1);
  const next = charAt(state, range.from);
  const close = BRACKET_PAIRS[prev] ?? EMPHASIS_PAIRS[prev];
  if (!close || next !== close) return false;
  dispatch(
    state.update({
      changes: { from: range.from - 1, to: range.from + 1 },
      selection: EditorSelection.cursor(range.from - 1),
      userEvent: "delete.backward",
    }),
  );
  return true;
};

export const autoPair = EditorView.inputHandler.of((view, from, to, text) => {
  const spec = autoPairTransaction(view.state, from, to, text);
  if (!spec) return false;
  view.dispatch(spec);
  return true;
});
