import { undo } from "@codemirror/commands";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView, type KeyBinding } from "@codemirror/view";
import { describe, expect, it, vi } from "vite-plus/test";
import { baseKeymap, createEditorExtensions, formattingKeymap } from "./extensions";

function mount(doc: string, hooks = {}) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({ doc, extensions: createEditorExtensions(hooks) }),
    parent,
  });
  return { view, parent, dispose: () => (view.destroy(), parent.remove()) };
}

function runKey(view: EditorView, key: string): boolean {
  const bindings = formattingKeymap.filter((binding: KeyBinding) => binding.key === key);
  for (const binding of bindings) {
    if (binding.run?.(view)) return true;
  }
  return false;
}

describe("createEditorExtensions", () => {
  it("binds Mod-b to bold", () => {
    const { view, dispose } = mount("hello", {});
    view.dispatch({ selection: EditorSelection.single(0, 5) });
    expect(runKey(view, "Mod-b")).toBe(true);
    expect(view.state.doc.toString()).toBe("**hello**");
    dispose();
  });

  it("binds Mod-i, Mod-k, and Mod-Shift-c", () => {
    const { view, dispose } = mount("hello", {});
    view.dispatch({ selection: EditorSelection.single(0, 5) });
    runKey(view, "Mod-i");
    expect(view.state.doc.toString()).toBe("*hello*");
    view.dispatch({ selection: EditorSelection.single(1, 6) });
    runKey(view, "Mod-Shift-c");
    expect(view.state.doc.toString()).toBe("*`hello`*");
    view.dispatch({ selection: EditorSelection.single(2, 7) });
    runKey(view, "Mod-k");
    expect(view.state.doc.toString()).toBe("*`[hello]()`*");
    dispose();
  });

  it("binds strikethrough, image, heading, block, and insert shortcuts", () => {
    const { view, dispose } = mount("hello", {});
    view.dispatch({ selection: EditorSelection.single(0, 5) });
    expect(runKey(view, "Mod-Shift-x")).toBe(true);
    expect(view.state.doc.toString()).toBe("~~hello~~");
    view.dispatch({ selection: EditorSelection.single(2, 7) });
    expect(runKey(view, "Mod-Shift-i")).toBe(true);
    expect(view.state.doc.toString()).toBe("~~![hello]()~~");
    expect(runKey(view, "Mod-Alt-2")).toBe(true);
    expect(view.state.doc.toString()).toBe("## ~~![hello]()~~");
    expect(runKey(view, "Mod-Alt-0")).toBe(true);
    expect(view.state.doc.toString()).toBe("~~![hello]()~~");
    expect(runKey(view, "Mod-Shift-9")).toBe(true);
    expect(view.state.doc.toString()).toBe("> ~~![hello]()~~");
    expect(runKey(view, "Mod-Shift-8")).toBe(true);
    expect(view.state.doc.toString()).toBe("> - ~~![hello]()~~");
    expect(runKey(view, "Mod-Shift-7")).toBe(true);
    expect(view.state.doc.toString()).toBe("> 1. ~~![hello]()~~");
    expect(runKey(view, "Mod-Shift-l")).toBe(true);
    expect(view.state.doc.toString()).toBe("> 1. [ ] ~~![hello]()~~");
    dispose();
  });

  it("binds code block, table, rule, and footnote shortcuts", () => {
    const { view, dispose } = mount("code", {});
    expect(runKey(view, "Mod-Alt-c")).toBe(true);
    expect(view.state.doc.toString()).toBe("```\ncode\n```");
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "" } });
    expect(runKey(view, "Mod-Alt-h")).toBe(true);
    expect(view.state.doc.toString()).toBe("---\n");
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "" } });
    expect(runKey(view, "Mod-Alt-t")).toBe(true);
    expect(view.state.doc.toString()).toContain("| Column 1 |");
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: "note" },
      selection: { anchor: 4 },
    });
    expect(runKey(view, "Mod-Alt-f")).toBe(true);
    expect(view.state.doc.toString()).toBe("note[^1]\n\n[^1]: ");
    dispose();
  });

  it("continues lists and tasks on Enter", () => {
    const { view, dispose } = mount("- item", {});
    view.dispatch({ selection: EditorSelection.cursor(6) });
    expect(runKey(view, "Enter")).toBe(true);
    expect(view.state.doc.toString()).toBe("- item\n- ");
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: "- [ ] task" },
      selection: { anchor: 10 },
    });
    expect(runKey(view, "Enter")).toBe(true);
    expect(view.state.doc.toString()).toBe("- [ ] task\n- [ ] ");
    dispose();
  });

  it("continues numbered lists on Enter", () => {
    const { view, dispose } = mount("1. one", {});
    view.dispatch({ selection: EditorSelection.cursor(6) });
    runKey(view, "Enter");
    expect(view.state.doc.toString()).toBe("1. one\n2. ");
    dispose();
  });

  it("indents and outdents list items with Tab and Shift-Tab", () => {
    const { view, dispose } = mount("- a\n- b", {});
    view.dispatch({ selection: EditorSelection.cursor(7) });
    expect(runKey(view, "Tab")).toBe(true);
    expect(view.state.doc.toString()).toBe("- a\n  - b");
    expect(runKey(view, "Shift-Tab")).toBe(true);
    expect(view.state.doc.toString()).toBe("- a\n- b");
    dispose();
  });

  it("leaves Tab unhandled outside lists", () => {
    const { view, dispose } = mount("plain", {});
    expect(runKey(view, "Tab")).toBe(false);
    dispose();
  });

  it("opens the search panel with Mod-f", () => {
    const { view, parent, dispose } = mount("find me", {});
    expect(runKey(view, "Mod-f")).toBe(true);
    expect(parent.querySelector(".cm-search")).not.toBeNull();
    dispose();
  });

  it("deletes empty pairs with Backspace", () => {
    const { view, dispose } = mount("()", {});
    view.dispatch({ selection: EditorSelection.cursor(1) });
    expect(runKey(view, "Backspace")).toBe(true);
    expect(view.state.doc.toString()).toBe("");
    dispose();
  });

  it("redoes with Mod-Shift-z on every platform, not only where CodeMirror binds it", () => {
    const { view, dispose } = mount("hello", {});
    view.dispatch({ selection: EditorSelection.single(0, 5) });
    expect(runKey(view, "Mod-b")).toBe(true);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("hello");
    expect(runKey(view, "Mod-Shift-z")).toBe(true);
    expect(view.state.doc.toString()).toBe("**hello**");
    dispose();
  });

  it("calls hooks on document and selection changes", () => {
    const onDocChanged = vi.fn();
    const onSelectionChanged = vi.fn();
    const { view, dispose } = mount("abc", { onDocChanged, onSelectionChanged });
    view.dispatch({ selection: EditorSelection.cursor(2) });
    expect(onDocChanged).not.toHaveBeenCalled();
    expect(onSelectionChanged).toHaveBeenCalledTimes(1);
    view.dispatch({ changes: { from: 0, insert: "x" } });
    expect(onDocChanged).toHaveBeenCalledTimes(1);
    expect(onSelectionChanged).toHaveBeenCalledTimes(2);
    dispose();
  });

  it("enables line wrapping and removes reserved default bindings", () => {
    const { view, dispose } = mount("x", {});
    expect(view.contentDOM.classList.contains("cm-lineWrapping")).toBe(true);
    expect(baseKeymap.some((binding) => binding.key === "Mod-/")).toBe(false);
    expect(baseKeymap.some((binding) => binding.key === "Mod-a")).toBe(true);
    dispose();
  });

  it("labels the content area for assistive technology", () => {
    const { parent, dispose } = mount("x", {});
    expect(parent.querySelector(".cm-content")?.getAttribute("aria-label")).toBe("Markdown editor");
    dispose();
  });
});
