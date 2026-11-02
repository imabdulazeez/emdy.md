import { EditorView } from "@codemirror/view";
import { fireEvent, render, screen, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { TEST_DOCUMENTS } from "~/test-documents";
import { resetCursorState } from "~/state/cursor";
import {
  activeDocumentId,
  clearDocumentState,
  findDocument,
  openDocument,
  openInSplit,
  resetDocumentState,
} from "~/state/document";
import { resetEditorApiState } from "~/state/editor-api";
import { resetFormattingState } from "~/state/formatting";
import { resetStatsState } from "~/state/stats";
import { resetUiState } from "~/state/ui";
import { resetViewportState } from "~/state/viewport";
import { resetWorkspaceState, setSplitRatio, splitLayout, splitRatio } from "~/state/workspace";
import EditorPanes from "./EditorPanes";

const [first, second, third] = TEST_DOCUMENTS;

beforeEach(() => resetDocumentState(TEST_DOCUMENTS));

afterEach(() => {
  vi.restoreAllMocks();
  clearDocumentState();
  resetCursorState();
  resetEditorApiState();
  resetFormattingState();
  resetStatsState();
  resetViewportState();
  resetWorkspaceState();
  resetUiState();
});

function pane(title: string) {
  return screen.getByRole("region", { name: `${title} pane` });
}

function viewIn(region: HTMLElement) {
  return EditorView.findFromDOM(region.querySelector<HTMLElement>(".cm-content")!)!;
}

function textOf(region: HTMLElement) {
  return viewIn(region).state.doc.toString();
}

function titleIn(region: HTMLElement) {
  return region.querySelector("[data-pane-title]");
}

function visualOrder() {
  return screen
    .getAllByRole("region", { name: / pane$/ })
    .sort((a, b) => Number(a.style.order) - Number(b.style.order));
}

describe("EditorPanes", () => {
  it("shows the active document alone without pane chrome", () => {
    render(() => <EditorPanes mode="editor" />);
    expect(screen.getAllByTestId("editor")).toHaveLength(1);
    expect(screen.queryByRole("region", { name: `${first.title} pane` })).toBeNull();
    expect(screen.queryByRole("button", { name: /pane$/ })).toBeNull();
  });

  it("shows two documents side by side with the focused pane marked", () => {
    flush(() => openInSplit(second.id));
    render(() => <EditorPanes mode="editor" />);
    const left = pane(first.title);
    const right = pane(second.title);
    expect(visualOrder()).toEqual([left, right]);
    const divider = screen.getByRole("separator", { name: "Resize panes" });
    expect(Number(divider.style.order)).toBeGreaterThan(Number(left.style.order));
    expect(Number(divider.style.order)).toBeLessThan(Number(right.style.order));
    expect(textOf(left)).toBe(first.text);
    expect(textOf(right)).toBe(second.text);
    expect(left).toHaveAttribute("data-pane-active", "false");
    expect(right).toHaveAttribute("data-pane-active", "true");
    expect(titleIn(right)).toHaveTextContent(second.title);
    expect(titleIn(left)).toHaveTextContent(first.title);
  });

  it("opens a split from a single pane and keeps that pane's editor", () => {
    render(() => <EditorPanes mode="editor" />);
    const editor = screen.getByTestId("editor");
    flush(() => openInSplit(second.id));
    expect(within(pane(first.title)).getByTestId("editor")).toBe(editor);
    expect(textOf(pane(second.title))).toBe(second.text);
    expect(visualOrder()).toEqual([pane(first.title), pane(second.title)]);
  });

  it("opens the next split to the right of a pane that survived on the right", async () => {
    const user = userEvent.setup();
    flush(() => openInSplit(second.id));
    render(() => <EditorPanes mode="editor" />);
    await user.click(screen.getByRole("button", { name: `Close ${first.title} pane` }));
    const editor = screen.getByTestId("editor");
    flush(() => openInSplit(third.id));
    expect(within(pane(second.title)).getByTestId("editor")).toBe(editor);
    expect(visualOrder()).toEqual([pane(second.title), pane(third.title)]);
    expect(pane(third.title)).toHaveAttribute("data-pane-active", "true");
  });

  it("focuses a pane when the writer clicks into it", async () => {
    const user = userEvent.setup();
    flush(() => openInSplit(second.id));
    render(() => <EditorPanes mode="editor" />);
    await user.click(pane(first.title).querySelector<HTMLElement>(".cm-content")!);
    expect(activeDocumentId()).toBe(first.id);
    expect(pane(first.title)).toHaveAttribute("data-pane-active", "true");
    expect(pane(second.title)).toHaveAttribute("data-pane-active", "false");
  });

  it("focuses a pane from its header without moving the panes", async () => {
    const user = userEvent.setup();
    flush(() => openInSplit(second.id));
    render(() => <EditorPanes mode="reader" />);
    const left = pane(first.title);
    await user.click(titleIn(left)!);
    expect(activeDocumentId()).toBe(first.id);
    expect(visualOrder()[0]).toBe(left);
  });

  it("closes the other pane and keeps the remaining editor", async () => {
    const user = userEvent.setup();
    flush(() => openInSplit(second.id));
    render(() => <EditorPanes mode="editor" />);
    const editor = within(pane(second.title)).getByTestId("editor");
    await user.click(screen.getByRole("button", { name: `Close ${first.title} pane` }));
    expect(splitLayout()).toBeNull();
    expect(activeDocumentId()).toBe(second.id);
    expect(screen.getAllByTestId("editor")).toEqual([editor]);
    expect(textOf(document.body)).toBe(second.text);
  });

  it("closes the focused pane and hands focus to the other one", async () => {
    const user = userEvent.setup();
    flush(() => openInSplit(second.id));
    render(() => <EditorPanes mode="editor" />);
    const editor = within(pane(first.title)).getByTestId("editor");
    await user.click(screen.getByRole("button", { name: `Close ${second.title} pane` }));
    expect(splitLayout()).toBeNull();
    expect(activeDocumentId()).toBe(first.id);
    expect(screen.getAllByTestId("editor")).toEqual([editor]);
    expect(viewIn(editor).hasFocus).toBe(true);
  });

  it("keeps an edit made just before its pane closes", async () => {
    const user = userEvent.setup();
    flush(() => openInSplit(second.id));
    render(() => <EditorPanes mode="editor" />);
    viewIn(pane(first.title)).dispatch({ changes: { from: 0, insert: "Last words. " } });
    await user.click(screen.getByRole("button", { name: `Close ${first.title} pane` }));
    flush();
    expect(findDocument(first.id)?.text).toBe(`Last words. ${first.text}`);
    flush(() => openDocument(third.id));
    expect(textOf(document.body)).toBe(third.text);
  });

  it("opens another document in the focused pane only", () => {
    flush(() => openInSplit(second.id));
    render(() => <EditorPanes mode="editor" />);
    flush(() => openDocument(third.id));
    expect(textOf(pane(first.title))).toBe(first.text);
    expect(textOf(pane(third.title))).toBe(third.text);
    expect(pane(third.title)).toHaveAttribute("data-pane-active", "true");
  });
});

describe("EditorPanes divider", () => {
  beforeEach(() => {
    if (!("PointerEvent" in window)) {
      class TestPointerEvent extends MouseEvent {
        pointerId: number;
        constructor(type: string, init: PointerEventInit = {}) {
          super(type, init);
          this.pointerId = init.pointerId ?? 0;
        }
      }
      vi.stubGlobal("PointerEvent", TestPointerEvent);
    }
    for (const method of ["setPointerCapture", "releasePointerCapture"] as const)
      if (!(method in HTMLElement.prototype))
        Object.defineProperty(HTMLElement.prototype, method, {
          configurable: true,
          writable: true,
          value: () => {},
        });
    if (!("hasPointerCapture" in HTMLElement.prototype))
      Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
        configurable: true,
        writable: true,
        value: () => false,
      });
  });

  afterEach(() => vi.unstubAllGlobals());

  const divider = () => screen.getByRole("separator", { name: "Resize panes" });

  function measure(width: number, left = 0) {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () =>
        ({
          left,
          top: 0,
          width,
          height: 600,
          right: left + width,
          bottom: 600,
          x: left,
          y: 0,
        }) as DOMRect,
    );
  }

  it("appears only in split view", () => {
    render(() => <EditorPanes mode="editor" />);
    expect(screen.queryByRole("separator")).toBeNull();
    flush(() => openInSplit(second.id));
    expect(divider()).toHaveAttribute("aria-valuenow", "50");
    expect(divider()).toHaveAttribute("aria-orientation", "vertical");
  });

  it("sizes the panes from the stored share, left to right", () => {
    flush(() => setSplitRatio(0.3));
    flush(() => openInSplit(second.id));
    render(() => <EditorPanes mode="editor" />);
    expect(pane(first.title).style.flex).toBe("0.3 1 0%");
    expect(pane(second.title).style.flex).toBe("0.7 1 0%");
  });

  it("leaves a lone pane to fill the sheet", () => {
    flush(() => setSplitRatio(0.3));
    render(() => <EditorPanes mode="editor" />);
    expect(screen.getByTestId("editor").closest("section")!.style.flex).toBe("");
  });

  it("follows the pointer while dragging and stops on release", () => {
    measure(1000, 100);
    flush(() => openInSplit(second.id));
    render(() => <EditorPanes mode="editor" />);
    const handle = divider();
    const release = vi.fn();
    handle.hasPointerCapture = () => true;
    handle.releasePointerCapture = release;
    fireEvent.pointerMove(handle, { clientX: 400, pointerId: 1 });
    expect(splitRatio()).toBe(0.5);
    fireEvent.pointerDown(handle, { clientX: 600, pointerId: 1, button: 0 });
    flush();
    expect(handle).toHaveAttribute("data-dragging", "true");
    expect(handle).toHaveFocus();
    fireEvent.pointerMove(handle, { clientX: 400, pointerId: 1 });
    flush();
    expect(splitRatio()).toBe(0.3);
    expect(pane(first.title).style.flex).toBe("0.3 1 0%");
    fireEvent.pointerMove(handle, { clientX: 1090, pointerId: 1 });
    flush();
    expect(splitRatio()).toBe(0.72);
    fireEvent.pointerUp(handle, { pointerId: 1 });
    flush();
    expect(handle).not.toHaveAttribute("data-dragging");
    expect(release).toHaveBeenCalledWith(1);
    fireEvent.pointerMove(handle, { clientX: 500, pointerId: 1 });
    flush();
    expect(splitRatio()).toBe(0.72);
  });

  it("ignores a drag started with another button", () => {
    measure(1000);
    flush(() => openInSplit(second.id));
    render(() => <EditorPanes mode="editor" />);
    fireEvent.pointerDown(divider(), { clientX: 500, pointerId: 1, button: 2 });
    fireEvent.pointerMove(divider(), { clientX: 300, pointerId: 1 });
    flush();
    expect(splitRatio()).toBe(0.5);
  });

  it("resizes from the keyboard and evens out on double-click", async () => {
    measure(2000);
    const user = userEvent.setup();
    flush(() => openInSplit(second.id));
    render(() => <EditorPanes mode="editor" />);
    divider().focus();
    await user.keyboard("{ArrowLeft}");
    expect(splitRatio()).toBe(0.45);
    expect(divider()).toHaveAttribute("aria-valuenow", "45");
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(splitRatio()).toBe(0.55);
    await user.keyboard("{Home}");
    expect(splitRatio()).toBe(0.2);
    await user.keyboard("{End}");
    expect(splitRatio()).toBe(0.8);
    await user.keyboard("{Control>}{ArrowLeft}{/Control}");
    expect(splitRatio()).toBe(0.8);
    await user.dblClick(divider());
    expect(splitRatio()).toBe(0.5);
  });
});
