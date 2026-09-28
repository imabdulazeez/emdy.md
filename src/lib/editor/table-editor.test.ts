import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { TableCopyRequest } from "~/lib/table-clipboard";
import { createEditorExtensions } from "./extensions";
import { livePreview } from "./live-preview";
import { tableCopyHandler } from "./table-copy";
import {
  gridForSpan,
  openTableCopyAtCursor,
  scanTables,
  tableGridAt,
  tableSpanAt,
  tableSpans,
  tableSpansField,
} from "./table-editor";
import { parseTableSource } from "./table-source";

const TABLE = ["| Mode | Amount |", "| :--- | -----: |", "| fast | 42     |"].join("\n");
const DOC = `Before\n\n${TABLE}\n\nAfter`;

let view: EditorView | undefined;

function mount(doc = DOC): EditorView {
  view = new EditorView({
    state: EditorState.create({ doc, extensions: [...createEditorExtensions(), livePreview] }),
    parent: document.body,
  });
  return view;
}

/** Raw Markdown presentation: the editor's extensions without the live preview. */
function mountRaw(doc = DOC): EditorView {
  view = new EditorView({
    state: EditorState.create({ doc, extensions: createEditorExtensions() }),
    parent: document.body,
  });
  return view;
}

function grid(editor: EditorView): HTMLElement | null {
  return editor.contentDOM.querySelector<HTMLElement>(".cm-table-editor");
}

function cells(editor: EditorView): HTMLInputElement[] {
  return [...editor.contentDOM.querySelectorAll<HTMLInputElement>(".cm-table-editor-input")];
}

function cell(editor: EditorView, row: number, column: number): HTMLInputElement {
  const input = editor.contentDOM.querySelector<HTMLInputElement>(
    `input[data-row="${row}"][data-column="${column}"]`,
  );
  if (!input) throw new Error(`no cell at ${row},${column}`);
  return input;
}

function action(editor: EditorView, key: string): HTMLButtonElement {
  const button = editor.contentDOM.querySelector<HTMLButtonElement>(`[data-action="${key}"]`);
  if (!button) throw new Error(`no action ${key}`);
  return button;
}

function tableText(editor: EditorView): string {
  const lines = editor.state.doc.toString().split("\n");
  return lines.slice(2, lines.length - 2).join("\n");
}

/** The grid focuses its entry cell in a microtask after being mounted. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function open(editor: EditorView, row = 1, column = 0): Promise<void> {
  const target = [...editor.contentDOM.querySelectorAll<HTMLElement>(".cm-live-table-widget td")][
    (row - 1) * 2 + column
  ];
  target.click();
  await settle();
}

afterEach(() => {
  view?.destroy();
  view = undefined;
});

describe("table grid editor", () => {
  it("replaces the source with a grid of inputs when a cell is clicked", async () => {
    const editor = mount();
    await open(editor);
    expect(grid(editor)).not.toBeNull();
    expect(editor.contentDOM.querySelector(".cm-live-table-widget")).toBeNull();
    expect(editor.contentDOM.textContent).not.toContain("| Mode");
    expect(cells(editor).map((input) => input.value)).toEqual(["Mode", "Amount", "fast", "42"]);
    expect(document.activeElement).toBe(cell(editor, 1, 0));
  });

  it("opens at the cell the cursor moved into", async () => {
    const editor = mount();
    editor.focus();
    editor.dispatch({ selection: { anchor: DOC.indexOf("42") } });
    await settle();
    expect(document.activeElement).toBe(cell(editor, 1, 1));
  });

  it("keeps the selection in the editor when select all spans a table", async () => {
    const editor = mountRaw();
    editor.focus();
    editor.dispatch({ selection: { anchor: 0, head: DOC.length } });
    await settle();
    expect(grid(editor)).toBeNull();
    expect(document.activeElement).toBe(editor.contentDOM);
    expect(
      editor.state.sliceDoc(editor.state.selection.main.from, editor.state.selection.main.to),
    ).toBe(DOC);
  });

  it("keeps the table as text while a selection extends across it", async () => {
    const editor = mount();
    editor.focus();
    editor.dispatch({ selection: { anchor: DOC.indexOf("fast"), head: DOC.indexOf("After") } });
    await settle();
    expect(grid(editor)).toBeNull();
    expect(document.activeElement).toBe(editor.contentDOM);
  });

  it("keeps the rendered table while nothing in the table is focused", () => {
    const editor = mount();
    expect(grid(editor)).toBeNull();
    expect(editor.contentDOM.querySelector(".cm-live-table-widget")).not.toBeNull();
  });

  it("writes edited cells back as aligned pipe Markdown", async () => {
    const editor = mount();
    await open(editor);
    await userEvent.type(cell(editor, 1, 0), "er");
    expect(tableText(editor)).toBe(
      ["| Mode   | Amount |", "| :----- | -----: |", "| faster |     42 |"].join("\n"),
    );
    expect(document.activeElement).toBe(cell(editor, 1, 0));
    expect(cell(editor, 1, 0).value).toBe("faster");
  });

  it("escapes a pipe typed into a cell", async () => {
    const editor = mount();
    await open(editor);
    await userEvent.type(cell(editor, 1, 0), " | slow");
    expect(tableText(editor)).toContain("fast \\| slow");
    expect(cell(editor, 1, 0).value).toBe("fast | slow");
  });

  it("moves between cells with Tab and adds a row past the last cell", async () => {
    const editor = mount();
    await open(editor, 1, 0);
    await userEvent.tab();
    expect(document.activeElement).toBe(cell(editor, 1, 1));
    await userEvent.tab();
    expect(tableText(editor).split("\n")).toHaveLength(4);
    expect(document.activeElement).toBe(cell(editor, 2, 0));
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(cell(editor, 1, 1));
  });

  it("moves down a column with Enter and up with ArrowUp", async () => {
    const editor = mount();
    await open(editor, 1, 1);
    await userEvent.keyboard("{Enter}");
    expect(document.activeElement).toBe(cell(editor, 2, 1));
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(cell(editor, 1, 1));
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(cell(editor, 0, 1));
  });

  it("leaves the grid on Escape and renders the table again", async () => {
    const editor = mount();
    await open(editor);
    await userEvent.keyboard("{Escape}");
    await settle();
    expect(grid(editor)).toBeNull();
    expect(editor.contentDOM.querySelector(".cm-live-table-widget")).not.toBeNull();
    expect(editor.hasFocus).toBe(true);
    expect(editor.state.doc.lineAt(editor.state.selection.main.head).number).toBe(6);
  });

  it("leaves the grid upwards from the header row", async () => {
    const editor = mount();
    await open(editor);
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    await settle();
    expect(grid(editor)).toBeNull();
    expect(editor.state.doc.lineAt(editor.state.selection.main.head).number).toBe(2);
  });

  it("closes the grid when focus moves to another part of the document", async () => {
    const editor = mount();
    await open(editor);
    editor.focus();
    editor.dispatch({ selection: { anchor: 0 } });
    await settle();
    expect(grid(editor)).toBeNull();
  });

  it("inserts and deletes rows and columns from the action bar", async () => {
    const editor = mount();
    await open(editor);
    action(editor, "row-after").click();
    expect(tableText(editor).split("\n")).toHaveLength(4);
    action(editor, "column-after").click();
    expect(tableText(editor).split("\n")[0]).toBe("| Mode |     | Amount |");
    action(editor, "column-remove").click();
    expect(tableText(editor).split("\n")[0]).toBe("| Mode | Amount |");
    action(editor, "row-remove").click();
    expect(tableText(editor).split("\n")).toHaveLength(3);
  });

  it("disables row deletion while the header is focused", async () => {
    const editor = mount();
    await open(editor);
    expect(action(editor, "row-remove").disabled).toBe(false);
    cell(editor, 0, 0).focus();
    expect(action(editor, "row-remove").disabled).toBe(true);
  });

  it("cycles the focused column's alignment", async () => {
    const editor = mount();
    await open(editor);
    action(editor, "align").click();
    expect(tableText(editor).split("\n")[1]).toBe("| :--: | -----: |");
    expect(cell(editor, 1, 0).dataset.align).toBe("center");
    action(editor, "align").click();
    expect(tableText(editor).split("\n")[1]).toBe("| ---: | -----: |");
    action(editor, "align").click();
    expect(tableText(editor).split("\n")[1]).toBe("| ---- | -----: |");
    expect(cell(editor, 1, 0).dataset.align).toBeUndefined();
  });

  it("opens over the raw Markdown when the live preview is off", async () => {
    const editor = mountRaw();
    expect(editor.contentDOM.textContent).toContain("| Mode | Amount |");
    editor.focus();
    editor.dispatch({ selection: { anchor: DOC.indexOf("fast") } });
    await settle();
    expect(grid(editor)).not.toBeNull();
    expect(editor.contentDOM.querySelector(".cm-live-table-widget")).toBeNull();
    expect(editor.contentDOM.textContent).not.toContain("| Mode");
  });

  it("restores aligned raw Markdown when the grid closes in raw mode", async () => {
    const ragged = "Before\n\n| Mode|Amount |\n|:-|-:|\n|fast | 42 |\n\nAfter";
    const editor = mountRaw(ragged);
    editor.focus();
    editor.dispatch({ selection: { anchor: ragged.indexOf("fast") } });
    await settle();
    await userEvent.keyboard("{Escape}");
    await settle();
    expect(grid(editor)).toBeNull();
    expect(tableText(editor)).toBe(
      ["| Mode | Amount |", "| :--- | -----: |", "| fast |     42 |"].join("\n"),
    );
    expect(editor.contentDOM.textContent).toContain("| Mode | Amount |");
  });

  it("realigns a ragged table as soon as the grid opens", async () => {
    const ragged = "| a |b|\n| - | - |\n| 1 | 22222 |";
    const editor = mountRaw(ragged);
    editor.focus();
    editor.dispatch({ selection: { anchor: 2 } });
    await settle();
    expect(editor.state.doc.toString()).toBe(
      ["| a   | b     |", "| --- | ----- |", "| 1   | 22222 |"].join("\n"),
    );
    expect(cell(editor, 0, 1).value).toBe("b");
  });

  it("keeps the raw source for a table nested in a blockquote", () => {
    const doc = "> | a | b |\n> | - | - |\n> | 1 | two |";
    const editor = mount(doc);
    const target = [...editor.contentDOM.querySelectorAll<HTMLElement>("td")].find(
      (td) => td.textContent === "two",
    )!;
    target.click();
    expect(grid(editor)).toBeNull();
    expect(editor.contentDOM.textContent).toContain("| 1 | two |");
  });
});

describe("table spans", () => {
  const QUOTED = ["> | q | t |", "> |---|---|", "> | 1 | 2 |"].join("\n");
  const FENCED = ["```", "| not | table |", "|---|---|", "```"].join("\n");
  const MANY = [TABLE, "", "para", "", FENCED, "", QUOTED, "", TABLE].join("\n");

  it("lists every table in document order, including nested ones, and skips fenced text", () => {
    const state = EditorState.create({ doc: MANY, extensions: createEditorExtensions() });
    const spans = scanTables(state);
    expect(spans).toHaveLength(3);
    expect(spans[0]).toEqual({ from: 0, to: TABLE.length, nodeFrom: 0 });
    expect(spans[1].nodeFrom).toBeGreaterThan(spans[1].from);
    expect(state.sliceDoc(spans[1].from, spans[1].to)).toBe(QUOTED);
    expect(state.sliceDoc(spans[2].from, spans[2].to)).toBe(TABLE);
    expect(spans.map((span) => span.from)).toEqual(
      [...spans].map((s) => s.from).sort((a, b) => a - b),
    );
  });

  it("caches spans across selection changes and rescans on edits", () => {
    const state = EditorState.create({ doc: MANY, extensions: createEditorExtensions() });
    const cached = state.field(tableSpansField);
    expect(tableSpans(state)).toBe(cached);
    const moved = state.update({ selection: { anchor: 5 } }).state;
    expect(moved.field(tableSpansField)).toBe(cached);
    const edited = moved.update({ changes: { from: 0, insert: "x\n\n" } }).state;
    const rescanned = edited.field(tableSpansField);
    expect(rescanned).not.toBe(cached);
    expect(rescanned).toHaveLength(3);
    expect(rescanned[0].from).toBe(3);
  });

  it("falls back to scanning when the field is absent", () => {
    const state = EditorState.create({
      doc: TABLE,
      extensions: createEditorExtensions().slice(0, 5),
    });
    expect(state.field(tableSpansField, false)).toBeUndefined();
    expect(tableSpans(state)).toHaveLength(1);
  });
});

describe("copying a table", () => {
  function mountWithHandler(doc: string, preview: boolean) {
    const handler = vi.fn<(request: TableCopyRequest) => void>();
    view = new EditorView({
      state: EditorState.create({
        doc,
        extensions: [
          ...createEditorExtensions(),
          ...(preview ? [livePreview] : []),
          tableCopyHandler.of(handler),
        ],
      }),
      parent: document.body,
    });
    return { editor: view, handler };
  }

  function copyAction(editor: EditorView): HTMLButtonElement {
    const button = editor.contentDOM.querySelector<HTMLButtonElement>("[data-copy]");
    if (!button) throw new Error("no copy action");
    return button;
  }

  function lastRequest(handler: { mock: { lastCall?: [TableCopyRequest] } }): TableCopyRequest {
    return handler.mock.lastCall![0];
  }

  const SHORTCUT = { key: "C", code: "KeyC", ctrlKey: true, altKey: true, shiftKey: true };

  it("reads the grid of the table at a position, without its blockquote prefix", () => {
    const doc = `Intro\n\n> | a | b |\n> | :- | -: |\n> | 1 | 2 |`;
    const state = EditorState.create({ doc, extensions: createEditorExtensions() });
    const span = tableSpanAt(state, doc.indexOf("1 |"))!;
    expect(span.nodeFrom - span.from).toBe(2);
    expect(gridForSpan(state, span)).toEqual({
      header: ["a", "b"],
      align: ["left", "right"],
      rows: [["1", "2"]],
    });
    expect(tableGridAt(state, 0)).toBeNull();
    expect(tableGridAt(state, doc.length)).toEqual(gridForSpan(state, span));
  });

  it("offers a Copy action in the grid toolbar in both presentations", async () => {
    for (const preview of [true, false]) {
      const { editor, handler } = mountWithHandler(DOC, preview);
      editor.focus();
      editor.dispatch({ selection: { anchor: DOC.indexOf("fast") } });
      await settle();
      const button = copyAction(editor);
      expect(button).toHaveTextContent("Copy");
      expect(button).toHaveAccessibleName("Copy table as Markdown or CSV");
      expect(button).toHaveAttribute("aria-haspopup", "menu");
      expect(button).toHaveAttribute("aria-keyshortcuts", "Control+Alt+Shift+C");
      expect(button).toHaveAttribute("title", "Copy table as Markdown or CSV (Ctrl+Alt+Shift+C)");
      button.click();
      const request = lastRequest(handler);
      expect(request.anchor).toBe(button);
      expect(request.grid).toEqual(parseTableSource(TABLE));
      editor.destroy();
      view = undefined;
    }
  });

  it("returns focus to the cell that was being edited", async () => {
    const { editor, handler } = mountWithHandler(DOC, true);
    await open(editor, 1, 1);
    copyAction(editor).click();
    cell(editor, 0, 0).focus();
    lastRequest(handler).restoreFocus!();
    expect(document.activeElement).toBe(cell(editor, 1, 1));
  });

  it("keeps the grid open while focus is in its copy menu", async () => {
    const { editor } = mountWithHandler(DOC, true);
    await open(editor);
    const menu = document.createElement("div");
    menu.setAttribute("data-table-copy-menu", "");
    const item = document.createElement("button");
    menu.append(item);
    document.body.append(menu);
    item.focus();
    await settle();
    expect(grid(editor)).not.toBeNull();
    menu.remove();
  });

  it("closes the grid when its menu is dismissed and focus lands outside the editor", async () => {
    const { editor, handler } = mountWithHandler(DOC, true);
    await open(editor);
    const menu = document.createElement("div");
    menu.setAttribute("data-table-copy-menu", "");
    const item = document.createElement("button");
    menu.append(item);
    document.body.append(menu);
    copyAction(editor).click();
    item.focus();
    await settle();
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    lastRequest(handler).onDismiss!();
    await new Promise((resolve) => setTimeout(resolve));
    expect(grid(editor)).toBeNull();
    menu.remove();
    outside.remove();
  });

  it("opens the menu from the grid with the keyboard shortcut", async () => {
    const { editor, handler } = mountWithHandler(DOC, false);
    editor.focus();
    editor.dispatch({ selection: { anchor: DOC.indexOf("fast") } });
    await settle();
    const event = new KeyboardEvent("keydown", { ...SHORTCUT, bubbles: true, cancelable: true });
    cell(editor, 1, 0).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(lastRequest(handler).anchor).toBe(copyAction(editor));
    expect(lastRequest(handler).grid).toEqual(parseTableSource(TABLE));
  });

  it("opens the menu at the caret for a raw table inside a blockquote", () => {
    const doc = "> | a | b |\n> | - | - |\n> | 1 | 2 |";
    const { editor, handler } = mountWithHandler(doc, false);
    editor.focus();
    editor.dispatch({ selection: { anchor: doc.indexOf("1 |") } });
    expect(grid(editor)).toBeNull();
    expect(openTableCopyAtCursor(editor)).toBe(true);
    const request = lastRequest(handler);
    expect(request.anchor).toBe(editor.contentDOM);
    expect(request.grid).toEqual(parseTableSource("| a | b |\n| - | - |\n| 1 | 2 |"));
  });

  it("ignores the shortcut outside a table", () => {
    const { editor, handler } = mountWithHandler(DOC, false);
    editor.focus();
    editor.dispatch({ selection: { anchor: 0 } });
    const event = new KeyboardEvent("keydown", { ...SHORTCUT, bubbles: true, cancelable: true });
    editor.contentDOM.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
});
