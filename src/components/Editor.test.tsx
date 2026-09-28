import { isolateHistory, undo } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { render, screen, waitFor, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { TEST_DOCUMENTS } from "~/test-documents";
import { createSignal, flush } from "solid-js";
import { cursor, resetCursorState } from "~/state/cursor";
import {
  activeDocumentId,
  createDocument,
  deleteDocument,
  docText,
  documents,
  findDocument,
  openDocument,
  resetDocumentState,
  saveDocumentText,
  setDocText,
  updateDocumentText,
} from "~/state/document";
import { editorApi, resetEditorApiState } from "~/state/editor-api";
import { activeFormats, resetFormattingState } from "~/state/formatting";
import { resetRulersState, setShowRulers } from "~/state/rulers";
import { outline, outlineDocumentId, resetStatsState } from "~/state/stats";
import { editorFocusRequested, requestEditorFocus, resetUiState } from "~/state/ui";
import {
  anchoredLine,
  anchorViewportLine,
  resetViewportState,
  setViewportLine,
  viewportLine,
} from "~/state/viewport";
import { documentPosition, resetWorkspaceState, savePosition } from "~/state/workspace";
import Editor, { SNAPSHOT_DEBOUNCE_MS } from "./Editor";

beforeEach(() => resetDocumentState(TEST_DOCUMENTS));

afterEach(() => {
  resetDocumentState(TEST_DOCUMENTS);
  resetCursorState();
  resetEditorApiState();
  resetFormattingState();
  resetRulersState();
  resetStatsState();
  resetViewportState();
  resetWorkspaceState();
  resetUiState();
  vi.useRealTimers();
});

function viewOf() {
  const content = screen.getByTestId("editor").querySelector<HTMLElement>(".cm-content")!;
  return EditorView.findFromDOM(content)!;
}

describe("Editor", () => {
  it("reports the reading position while scrolling", async () => {
    flush(() => setDocText("# One\n\ntext\n\n## Two"));
    render(() => <Editor />);
    expect(viewportLine()).toBe(0);
    viewOf().scrollDOM.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(viewportLine()).toBeGreaterThan(0);
  });

  it("renders the read-only preview with the editable preview's widgets and no way to edit", async () => {
    const user = userEvent.setup();
    const text = "# Title\n\n- [ ] task\n\n```ts\nconst a = 1;\n```";
    flush(() => setDocText(text));
    render(() => <Editor mode="reader" />);
    const host = screen.getByTestId("editor");
    expect(host).toHaveAttribute("data-editor-mode", "preview");
    expect(host).toHaveAttribute("data-readonly", "true");
    const content = screen.getByRole("document", { name: "Preview" });
    expect(content).toHaveAttribute("contenteditable", "false");
    expect(within(content).getByRole("heading", { level: 1, name: "Title" })).toBeInTheDocument();
    expect(content).toHaveAttribute("aria-readonly", "true");
    expect(within(content).getByText("ts")).toHaveClass("cm-live-language");
    expect(within(content).getByRole("button", { name: "Copy code" })).toBeInTheDocument();
    const task = within(content).getByRole("checkbox", { name: "Open task" });
    expect(task).toHaveAttribute("aria-disabled", "true");
    await user.click(task);
    expect(task).not.toBeChecked();
    expect(
      editorApi()!.runCommand(({ state, dispatch }) => {
        dispatch(state.update({ changes: { from: 0, insert: "x" } }));
        return true;
      }),
    ).toBe(false);
    expect(viewOf().state.doc.toString()).toBe(text);
    expect(screen.queryByText("Start writing…")).toBeNull();
  });

  it("mounts CodeMirror with visible Markdown syntax", () => {
    flush(() => setDocText("cursor\n\n# **Hello**\n\n- [ ] task\n\n[link](https://example.com)"));
    render(() => <Editor />);
    expect(screen.getByTestId("editor")).toHaveAttribute("data-editor-mode", "source");
    const textbox = screen.getByRole("textbox", { name: "Markdown editor" });
    const lines = [...textbox.querySelectorAll(".cm-line")].map((line) => line.textContent);
    expect(lines).toContain("# **Hello**");
    expect(lines).toContain("- [ ] task");
    expect(lines).toContain("[link](https://example.com)");
    expect(textbox.querySelector("input")).toBeNull();
    expect(textbox.querySelector("[class*='cm-md-'], [class*='cm-code-']")).toBeNull();
    expect(viewOf().state.doc.toString()).toBe(
      "cursor\n\n# **Hello**\n\n- [ ] task\n\n[link](https://example.com)",
    );
  });

  it("switches presentation with the mode prop", () => {
    const [mode, setMode] = createSignal<"editor" | "preview" | "reader">("editor");
    render(() => <Editor mode={mode()} />);
    expect(screen.getByTestId("editor")).toHaveAttribute("data-editor-mode", "source");
    flush(() => setMode("preview"));
    expect(screen.getByTestId("editor")).toHaveAttribute("data-editor-mode", "preview");
    flush(() => setMode("reader"));
    expect(screen.getByTestId("editor")).toHaveAttribute("data-editor-mode", "preview");
    expect(screen.getByTestId("editor")).toHaveAttribute("data-readonly", "true");
    expect(viewOf().state.readOnly).toBe(true);
    flush(() => setMode("preview"));
    expect(screen.getByTestId("editor")).not.toHaveAttribute("data-readonly");
    expect(viewOf().state.readOnly).toBe(false);
  });

  it("opens a document it has not shown before at the top", () => {
    render(() => <Editor mode="reader" />);
    const scroller = viewOf().scrollDOM;
    scroller.scrollTop = 500;
    const next = TEST_DOCUMENTS.find((doc) => doc.id !== activeDocumentId())!.id;
    flush(() => openDocument(next));
    expect(scroller.scrollTop).toBe(0);
  });

  it("scrolls to the very top for a line in the document's first block", () => {
    flush(() => setDocText("# One\n\ntext\n\n## Two"));
    render(() => <Editor mode="reader" />);
    const scroller = viewOf().scrollDOM;
    scroller.scrollTop = 300;
    editorApi()!.scrollToLine(1);
    expect(scroller.scrollTop).toBe(0);
    expect(viewOf().state.selection.main.head).toBe(0);
  });

  it("lets go of a jumped-to line as soon as the reader scrolls", () => {
    flush(() => setDocText("# One\n\ntext\n\n## Two\n\nmore"));
    render(() => <Editor mode="reader" />);
    flush(() => anchorViewportLine(5));
    editorApi()!.scrollToLine(5);
    expect(anchoredLine()).toBe(5);
    viewOf().scrollDOM.dispatchEvent(new WheelEvent("wheel", { deltaY: -100 }));
    flush();
    expect(anchoredLine()).toBe(0);

    flush(() => anchorViewportLine(5));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "PageUp" }));
    flush();
    expect(anchoredLine()).toBe(0);

    flush(() => anchorViewportLine(5));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    flush();
    expect(anchoredLine()).toBe(5);
  });

  it("keeps a jumped-to line when caret keys move within the editable preview", () => {
    flush(() => setDocText("# One\n\ntext\n\n## Two\n\nmore"));
    render(() => <Editor mode="preview" />);
    flush(() => anchorViewportLine(5));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "End" }));
    flush();
    expect(anchoredLine()).toBe(5);
  });

  it("applies the current mode to a document restored from the session", () => {
    const [mode, setMode] = createSignal<"editor" | "preview" | "reader">("preview");
    render(() => <Editor mode={mode()} />);
    const first = activeDocumentId();
    const second = TEST_DOCUMENTS.find((doc) => doc.id !== first)!.id;
    flush(() => openDocument(second));
    flush(() => setMode("reader"));
    flush(() => openDocument(first));
    expect(viewOf().state.readOnly).toBe(true);
  });

  it("opens the table copy menu from a rendered table in editable preview", async () => {
    const user = userEvent.setup();
    flush(() => setDocText("Intro\n\n| a | b |\n| - | - |\n| 1, 2 | x |"));
    render(() => <Editor mode="preview" />);
    await user.click(screen.getByRole("button", { name: "Copy table" }));
    const menu = await screen.findByRole("menu", { name: "Copy table" });
    await user.click(within(menu).getByRole("menuitem", { name: "Copy as CSV" }));
    await waitFor(async () => expect(await navigator.clipboard.readText()).toBe('a,b\n"1, 2",x'));
    expect(screen.getByRole("status")).toHaveTextContent("Copied table as CSV");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(screen.getByRole("button", { name: "Copy table" })).toHaveFocus();
  });

  it("drops an open table copy menu when the view changes", async () => {
    const user = userEvent.setup();
    const [mode, setMode] = createSignal<"editor" | "preview" | "reader">("preview");
    flush(() => setDocText("| a |\n| - |\n| 1 |"));
    render(() => <Editor mode={mode()} />);
    await user.click(screen.getByRole("button", { name: "Copy table" }));
    await screen.findByRole("menu", { name: "Copy table" });
    flush(() => setMode("editor"));
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("publishes a debounced snapshot after edits", () => {
    vi.useFakeTimers();
    flush(() => setDocText("abc"));
    render(() => <Editor />);
    const view = viewOf();
    view.dispatch({ changes: { from: 3, insert: "d" } });
    expect(docText()).toBe("abc");
    vi.advanceTimersByTime(SNAPSHOT_DEBOUNCE_MS - 1);
    expect(docText()).toBe("abc");
    vi.advanceTimersByTime(1);
    flush();
    expect(docText()).toBe("abcd");
    expect(findDocument(activeDocumentId())?.revision).toBe(1);
  });

  it("publishes the outline from the syntax tree and clears it on unmount", async () => {
    flush(() => setDocText("# One\n\ntext\n\n## **Two**"));
    const { unmount } = render(() => <Editor />);
    await waitFor(() =>
      expect(outline()).toEqual([
        { level: 1, text: "One", line: 1 },
        { level: 2, text: "Two", line: 5 },
      ]),
    );
    expect(outlineDocumentId()).toBe(activeDocumentId());
    viewOf().dispatch({ changes: { from: 0, insert: "# Zero\n\n" } });
    await waitFor(() => expect(outline()[0]).toEqual({ level: 1, text: "Zero", line: 1 }));
    unmount();
    flush();
    expect(outline()).toEqual([]);
    expect(outlineDocumentId()).toBeNull();
  });

  it("updates the cursor position", () => {
    flush(() => setDocText("one\ntwo"));
    render(() => <Editor />);
    viewOf().dispatch({ selection: { anchor: 6 } });
    flush();
    expect(cursor()).toEqual({ line: 2, column: 3 });
  });

  it("publishes the active formats at the cursor and clears them on unmount", () => {
    flush(() => setDocText("# Title\n\n- **bold** item"));
    const { unmount } = render(() => <Editor />);
    viewOf().dispatch({ selection: { anchor: 14 } });
    flush();
    expect(activeFormats()).toMatchObject({ bold: true, bulletList: true, heading: 0 });
    viewOf().dispatch({ selection: { anchor: 3 } });
    flush();
    expect(activeFormats()).toMatchObject({ bold: false, bulletList: false, heading: 1 });
    unmount();
    flush();
    expect(activeFormats().heading).toBe(0);
  });

  it("publishes active formats on initial mount", () => {
    flush(() => setDocText("## Heading"));
    render(() => <Editor />);
    expect(activeFormats().heading).toBe(2);
  });

  it("refreshes the active formats when switching documents", () => {
    flush(() => setDocText("## Heading"));
    render(() => <Editor />);
    viewOf().dispatch({ selection: { anchor: 5 } });
    flush();
    expect(activeFormats().heading).toBe(2);
    flush(() => createDocument());
    expect(activeFormats().heading).toBe(0);
  });

  it("registers an editor api that scrolls and focuses", () => {
    flush(() => setDocText("a\nb\nc"));
    render(() => <Editor />);
    const api = editorApi();
    expect(api).not.toBeNull();
    api!.scrollToLine(3);
    expect(viewOf().state.selection.main.head).toBe(4);
    api!.scrollToLine(99);
    expect(viewOf().state.selection.main.head).toBe(4);
    api!.focus();
    expect(api!.getText()).toBe("a\nb\nc");
  });

  it("takes focus when a new document asks for it", () => {
    render(() => <Editor />);
    const textbox = screen.getByRole("textbox", { name: "Markdown editor" });
    expect(textbox).not.toHaveFocus();
    flush(() => {
      createDocument();
      requestEditorFocus();
    });
    expect(textbox).toHaveFocus();
    expect(editorFocusRequested()).toBe(false);
  });

  it("takes a focus request made before it mounts", () => {
    flush(requestEditorFocus);
    render(() => <Editor />);
    expect(screen.getByRole("textbox", { name: "Markdown editor" })).toHaveFocus();
    expect(editorFocusRequested()).toBe(false);
  });

  it("flushes pending edits and unregisters on unmount", () => {
    vi.useFakeTimers();
    flush(() => setDocText("x"));
    const { unmount } = render(() => <Editor />);
    viewOf().dispatch({ changes: { from: 1, insert: "y" } });
    unmount();
    flush();
    expect(docText()).toBe("xy");
    expect(editorApi()).toBeNull();
  });

  it("loads a document for the first time with the cursor at the start", () => {
    flush(() => setDocText("first\nsecond"));
    render(() => <Editor />);
    viewOf().dispatch({ selection: { anchor: 8 } });
    flush();
    expect(cursor().line).toBe(2);
    const other = documents()[1];
    flush(() => openDocument(other.id));
    expect(viewOf().state.doc.toString()).toBe(other.text);
    expect(cursor()).toEqual({ line: 1, column: 1 });
    flush(() => createDocument());
    expect(viewOf().state.doc.toString()).toBe("");
  });

  it("records the selection and reading line for the open document", async () => {
    const [first, second] = documents();
    flush(() => setDocText("one\ntwo\nthree"));
    render(() => <Editor />);
    viewOf().dispatch({ selection: { anchor: 2, head: 6 } });
    expect(documentPosition(first.id)).toMatchObject({ anchor: 2, head: 6 });
    flush(() => setViewportLine(3));
    expect(documentPosition(first.id)?.line).toBe(3);
    flush(() => openDocument(second.id));
    flush(() => setViewportLine(2));
    expect(documentPosition(second.id)?.line).toBe(2);
    expect(documentPosition(first.id)).toEqual({ anchor: 2, head: 6, line: 3 });
  });

  it("restores a saved selection when a document is opened for the first time", () => {
    const [first, second] = documents();
    flush(() => setDocText("alpha beta"));
    flush(() => savePosition(first.id, { anchor: 6, head: 10, line: 1 }));
    flush(() => savePosition(second.id, { anchor: 4, head: 4, line: 1 }));
    render(() => <Editor />);
    expect(viewOf().state.selection.main.anchor).toBe(6);
    expect(viewOf().state.selection.main.head).toBe(10);
    expect(cursor()).toEqual({ line: 1, column: 11 });
    flush(() => openDocument(second.id));
    expect(viewOf().state.selection.main.head).toBe(4);
    expect(cursor()).toEqual({ line: 1, column: 5 });
  });

  it("clamps a saved selection that no longer fits the document", () => {
    const [first] = documents();
    flush(() => setDocText("ab"));
    flush(() => savePosition(first.id, { anchor: 40, head: 50, line: 99 }));
    render(() => <Editor />);
    expect(viewOf().state.selection.main.anchor).toBe(2);
    expect(viewOf().state.selection.main.head).toBe(2);
  });

  it("shows line numbers and the column ruler only while rulers are on", () => {
    render(() => <Editor />);
    const host = screen.getByTestId("editor");
    expect(host).toHaveAttribute("data-rulers", "false");
    expect(host.querySelector(".cm-lineNumbers")).toBeNull();
    expect(screen.queryByTestId("column-ruler")).toBeNull();
    flush(() => setShowRulers(true));
    expect(host).toHaveAttribute("data-rulers", "true");
    expect(host.querySelector(".cm-lineNumbers")).not.toBeNull();
    expect(screen.getByTestId("column-ruler")).toHaveAttribute("aria-hidden", "true");
    flush(() => setShowRulers(false));
    expect(host).toHaveAttribute("data-rulers", "false");
    expect(host.querySelector(".cm-lineNumbers")).toBeNull();
    expect(screen.queryByTestId("column-ruler")).toBeNull();
  });

  it("drops the column ruler but keeps line numbers in editable preview", () => {
    const [mode, setMode] = createSignal<"editor" | "preview" | "reader">("editor");
    flush(() => setShowRulers(true));
    render(() => <Editor mode={mode()} />);
    const host = screen.getByTestId("editor");
    expect(screen.getByTestId("column-ruler")).toBeInTheDocument();
    flush(() => setMode("preview"));
    expect(host.querySelector(".cm-lineNumbers")).not.toBeNull();
    expect(screen.queryByTestId("column-ruler")).toBeNull();
    flush(() => setMode("editor"));
    expect(screen.getByTestId("column-ruler")).toBeInTheDocument();
  });

  it("applies the current rulers setting to a document restored from its session", () => {
    const [first, second] = documents();
    render(() => <Editor />);
    const host = screen.getByTestId("editor");
    flush(() => openDocument(second.id));
    flush(() => setShowRulers(true));
    expect(host.querySelector(".cm-lineNumbers")).not.toBeNull();
    flush(() => openDocument(first.id));
    expect(host.querySelector(".cm-lineNumbers")).not.toBeNull();
    flush(() => setShowRulers(false));
    flush(() => openDocument(second.id));
    expect(host.querySelector(".cm-lineNumbers")).toBeNull();
    expect(screen.queryByTestId("column-ruler")).toBeNull();
  });

  it("restores text, selection, and undo history when returning to a document", () => {
    vi.useFakeTimers();
    const [first, second] = documents();
    flush(() => setDocText("draft"));
    render(() => <Editor />);
    const isolated = isolateHistory.of("full");
    viewOf().dispatch({ changes: { from: 5, insert: " one" }, annotations: isolated });
    viewOf().dispatch({ changes: { from: 9, insert: " two" }, annotations: isolated });
    viewOf().dispatch({ selection: { anchor: 3 } });
    flush(() => openDocument(second.id));
    expect(viewOf().state.doc.toString()).toBe(second.text);
    flush(() => openDocument(first.id));
    expect(viewOf().state.doc.toString()).toBe("draft one two");
    expect(cursor()).toEqual({ line: 1, column: 4 });
    expect(undo(viewOf())).toBe(true);
    expect(viewOf().state.doc.toString()).toBe("draft one");
    vi.runAllTimers();
    flush();
    expect(findDocument(first.id)?.text).toBe("draft one");
  });

  it("flushes pending edits into the document they belong to before switching", () => {
    vi.useFakeTimers();
    const [first, second] = documents();
    flush(() => setDocText("draft"));
    render(() => <Editor />);
    viewOf().dispatch({ changes: { from: 5, insert: "!" } });
    flush(() => openDocument(second.id));
    expect(findDocument(first.id)?.text).toBe("draft!");
    expect(docText()).toBe(second.text);
    expect(viewOf().state.doc.toString()).toBe(second.text);
    vi.runAllTimers();
    flush();
    expect(findDocument(second.id)?.text).toBe(second.text);
  });

  it("reloads the active document when its text is replaced outside the editor", () => {
    vi.useFakeTimers();
    flush(() => setDocText("typed"));
    render(() => <Editor />);
    const id = activeDocumentId();
    flush(() => saveDocumentText(id, "saved elsewhere"));
    expect(viewOf().state.doc.toString()).toBe("typed");
    flush(() => updateDocumentText(id, "imported"));
    expect(viewOf().state.doc.toString()).toBe("imported");
    expect(undo(viewOf())).toBe(true);
    expect(viewOf().state.doc.toString()).toBe("typed");
    vi.runAllTimers();
    flush();
    expect(findDocument(id)?.text).toBe("typed");
  });

  it("does not resurrect a kept state for a document that was replaced while inactive", () => {
    const [first, second] = documents();
    flush(() => setDocText("draft"));
    render(() => <Editor />);
    flush(() => openDocument(second.id));
    flush(() => updateDocumentText(first.id, "rewritten"));
    flush(() => openDocument(first.id));
    expect(viewOf().state.doc.toString()).toBe("rewritten");
    expect(undo(viewOf())).toBe(false);
  });

  it("forgets kept states for deleted documents", () => {
    const [first, second] = documents();
    flush(() => setDocText("draft"));
    render(() => <Editor />);
    flush(() => openDocument(second.id));
    flush(() => deleteDocument(first.id));
    expect(documents().some((doc) => doc.id === first.id)).toBe(false);
    expect(viewOf().state.doc.toString()).toBe(second.text);
  });
});
