import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { history, isolateHistory, redo, undo } from "@codemirror/commands";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createEditorSession, EDITOR_SESSION_LIMIT, type EditorSession } from "./session";

const DELAY = 50;

let view: EditorView;
let save: ReturnType<typeof vi.fn<(id: string, text: string) => void>>;
let session: EditorSession;

const createState = (text: string) =>
  EditorState.create({
    doc: text,
    extensions: [
      history(),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) session.noteChange(update.state.doc);
      }),
    ],
  });

beforeEach(() => {
  vi.useFakeTimers();
  save = vi.fn<(id: string, text: string) => void>();
  view = new EditorView({ state: createState("alpha"), parent: document.body });
  session = createEditorSession({
    view,
    documentId: "a",
    revision: 0,
    createState,
    save,
    saveDelayMs: DELAY,
  });
});

afterEach(() => {
  session.dispose();
  view.destroy();
  vi.useRealTimers();
});

const type = (text: string) =>
  view.dispatch({
    changes: { from: view.state.doc.length, insert: text },
    annotations: isolateHistory.of("full"),
  });

describe("editor session", () => {
  it("saves a debounced snapshot for the current document", () => {
    type("!");
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DELAY - 1);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledWith("a", "alpha!");
  });

  it("flushes pending edits into the document they belong to before switching", () => {
    type("!");
    expect(session.open("b", "beta", 0)).toBe(false);
    expect(save).toHaveBeenCalledWith("a", "alpha!");
    expect(view.state.doc.toString()).toBe("beta");
    expect(session.documentId()).toBe("b");
    vi.runAllTimers();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("restores the previous state, undo history, and selection when returning", () => {
    type(" one");
    type(" two");
    view.dispatch({ selection: { anchor: 3 } });
    session.open("b", "beta", 0);
    expect(session.open("a", "alpha one two", 0)).toBe(true);
    expect(view.state.doc.toString()).toBe("alpha one two");
    expect(view.state.selection.main.head).toBe(3);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("alpha one");
    expect(redo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("alpha one two");
  });

  it("discards a kept state when the document changed while it was inactive", () => {
    type("!");
    session.open("b", "beta", 0);
    session.replaceText("a", "rewritten", 1);
    expect(session.open("a", "rewritten", 1)).toBe(false);
    expect(view.state.doc.toString()).toBe("rewritten");
    expect(undo(view)).toBe(false);
  });

  it("ignores a kept state whose revision no longer matches", () => {
    session.open("b", "beta", 0);
    expect(session.open("a", "changed elsewhere", 3)).toBe(false);
    expect(view.state.doc.toString()).toBe("changed elsewhere");
  });

  it("replaces the active text as a single undoable change", () => {
    type("!");
    session.replaceText("a", "imported", 1);
    expect(view.state.doc.toString()).toBe("imported");
    vi.runAllTimers();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("a", "imported");
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("alpha!");
  });

  it("ignores a replacement that carries the current revision", () => {
    session.replaceText("a", "stale", 0);
    expect(view.state.doc.toString()).toBe("alpha");
  });

  it("reopening the current document is a no-op", () => {
    type("!");
    expect(session.open("a", "ignored", 0)).toBe(false);
    expect(view.state.doc.toString()).toBe("alpha!");
    expect(save).not.toHaveBeenCalled();
  });

  it("drops kept states for documents that no longer exist", () => {
    session.open("b", "beta", 0);
    session.open("c", "gamma", 0);
    session.retain(["c"]);
    expect(session.open("a", "alpha again", 0)).toBe(false);
    expect(view.state.doc.toString()).toBe("alpha again");
    session.open("b", "beta again", 0);
    expect(view.state.doc.toString()).toBe("beta again");
    session.open("c", "gamma", 0);
    expect(view.state.doc.toString()).toBe("gamma");
  });

  it("keeps only the most recently left documents once the limit is reached", () => {
    session.dispose();
    session = createEditorSession({
      view,
      documentId: "a",
      revision: 0,
      createState,
      save,
      saveDelayMs: DELAY,
      limit: 2,
    });
    session.open("b", "beta", 0);
    session.open("c", "gamma", 0);
    session.open("a", "alpha", 0);
    session.open("d", "delta", 0);
    expect(session.open("c", "gamma", 0)).toBe(true);
    expect(session.open("a", "alpha", 0)).toBe(true);
    expect(session.open("b", "beta", 0)).toBe(false);
  });

  it("bounds kept states by default", () => {
    expect(EDITOR_SESSION_LIMIT).toBeGreaterThan(0);
    const ids = Array.from({ length: EDITOR_SESSION_LIMIT + 2 }, (_, index) => `doc-${index}`);
    for (const id of ids) session.open(id, id, 0);
    expect(session.open("a", "alpha", 0)).toBe(false);
    expect(session.open(ids[0], ids[0], 0)).toBe(false);
    expect(session.open(ids.at(-2)!, ids.at(-2)!, 0)).toBe(true);
  });

  it("flushes on flush and dispose", () => {
    type("?");
    session.flush();
    expect(save).toHaveBeenCalledWith("a", "alpha?");
    type("!");
    session.dispose();
    expect(save).toHaveBeenLastCalledWith("a", "alpha?!");
  });
});
