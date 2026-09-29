import { EditorSelection, EditorState, type Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vite-plus/test";
import { autoPair, autoPairTransaction, deletePairBackward } from "./auto-pair";

function state(doc: string, anchor: number, head = anchor) {
  return EditorState.create({ doc, selection: EditorSelection.single(anchor, head) });
}

function apply(doc: string, anchor: number, head: number, text: string) {
  const s = state(doc, anchor, head);
  const spec = autoPairTransaction(s, Math.min(anchor, head), Math.max(anchor, head), text);
  if (!spec) return null;
  const tr = s.update(spec);
  return {
    doc: tr.state.doc.toString(),
    head: tr.state.selection.main.head,
    anchor: tr.state.selection.main.anchor,
  };
}

describe("autoPairTransaction", () => {
  it("inserts bracket pairs and places the cursor between them", () => {
    expect(apply("", 0, 0, "(")).toEqual({ doc: "()", head: 1, anchor: 1 });
    expect(apply("a ", 2, 2, "[")).toEqual({ doc: "a []", head: 3, anchor: 3 });
  });

  it("pairs emphasis markers at word boundaries", () => {
    expect(apply("", 0, 0, "*")).toEqual({ doc: "**", head: 1, anchor: 1 });
    expect(apply("say ", 4, 4, "`")).toEqual({ doc: "say ``", head: 5, anchor: 5 });
  });

  it("does not pair emphasis inside words", () => {
    expect(apply("snake", 5, 5, "_")).toBeNull();
    expect(apply("2", 1, 1, "*")).toBeNull();
  });

  it("does not pair when followed by text", () => {
    expect(apply("word", 0, 0, "(")).toBeNull();
  });

  it("steps over a matching closing character", () => {
    expect(apply("()", 1, 1, ")")).toEqual({ doc: "()", head: 2, anchor: 2 });
    expect(apply("**", 1, 1, "*")).toEqual({ doc: "**", head: 2, anchor: 2 });
  });

  it("doubles emphasis markers when already inside a pair with room to grow", () => {
    expect(apply("* *", 1, 1, "*")).toEqual({ doc: "*** *", head: 2, anchor: 2 });
    expect(apply("***", 1, 1, "*")).toEqual({ doc: "*****", head: 2, anchor: 2 });
  });

  it("extends a run of markers instead of pairing again", () => {
    expect(apply("``", 2, 2, "`")).toBeNull();
    expect(apply("**", 2, 2, "*")).toBeNull();
    expect(apply("~~", 2, 2, "~")).toBeNull();
  });

  it("types a code fence as three backticks", () => {
    let doc = "";
    let pos = 0;
    for (let i = 0; i < 3; i++) {
      const result = apply(doc, pos, pos, "`") ?? { doc: doc + "`", head: pos + 1 };
      doc = result.doc;
      pos = result.head;
    }
    expect(doc).toBe("```");
    expect(pos).toBe(3);
  });

  it("wraps a selection", () => {
    expect(apply("hello", 0, 5, "*")).toEqual({ doc: "*hello*", anchor: 1, head: 6 });
    expect(apply("hello", 0, 5, "(")).toEqual({ doc: "(hello)", anchor: 1, head: 6 });
    expect(apply("hello", 0, 5, "x")).toBeNull();
  });

  it("ignores multi-character input", () => {
    expect(apply("", 0, 0, "ab")).toBeNull();
  });
});

describe("deletePairBackward", () => {
  function del(doc: string, pos: number) {
    const s = state(doc, pos);
    let next = s;
    const handled = deletePairBackward({
      state: s,
      dispatch: (tr: Transaction) => {
        next = tr.state;
      },
    });
    return { handled, doc: next.doc.toString(), head: next.selection.main.head };
  }

  it("removes both characters of an empty pair", () => {
    expect(del("()", 1)).toEqual({ handled: true, doc: "", head: 0 });
    expect(del("a**b", 2)).toEqual({ handled: true, doc: "ab", head: 1 });
  });

  it("falls through otherwise", () => {
    expect(del("(a)", 2).handled).toBe(false);
    expect(del("ab", 1).handled).toBe(false);
  });
});

describe("autoPair extension", () => {
  it("handles typed input through the input handler facet", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = new EditorView({
      state: EditorState.create({ doc: "", extensions: [autoPair] }),
      parent,
    });
    const handlers = view.state.facet(EditorView.inputHandler);
    expect(handlers).toHaveLength(1);
    const handled = handlers[0](view, 0, 0, "(", () =>
      view.state.update({ changes: { from: 0, insert: "(" } }),
    );
    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe("()");
    expect(view.state.selection.main.head).toBe(1);
    const passthrough = handlers[0](view, 1, 1, "a", () =>
      view.state.update({ changes: { from: 1, insert: "a" } }),
    );
    expect(passthrough).toBe(false);
    view.destroy();
    parent.remove();
  });
});
