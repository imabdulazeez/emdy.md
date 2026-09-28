import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { flush } from "solid-js";
import { resetCursorState, setCursor } from "~/state/cursor";
import { registerEditorApi, resetEditorApiState } from "~/state/editor-api";
import { resetLayoutState, setLayoutMode, type LayoutMode } from "~/state/layout";
import { resetStatsState, setOutline } from "~/state/stats";
import { resetViewportState, setViewportLine } from "~/state/viewport";
import Outline from "./Outline";

const ONE_TWO = [
  { level: 1, text: "One", line: 1 },
  { level: 2, text: "Two", line: 5 },
];

afterEach(() => {
  resetStatsState();
  resetCursorState();
  resetEditorApiState();
  resetLayoutState();
  resetViewportState();
});

function registerApis() {
  const editor = {
    scrollToLine: vi.fn(),
    focus: vi.fn(),
    getText: () => "",
    flush: vi.fn(),
    runCommand: vi.fn(),
    applyEdits: vi.fn(),
  };
  flush(() => registerEditorApi(editor));
  return { editor };
}

describe("Outline", () => {
  it("shows a hint when there are no headings", () => {
    render(() => <Outline />);
    expect(screen.getByRole("navigation", { name: "Outline" })).toBeInTheDocument();
    expect(screen.getByText(/Headings will appear here/)).toBeInTheDocument();
  });

  it("holds only the heading list; the document status lives elsewhere", () => {
    flush(() => setOutline([{ level: 1, text: "One", line: 1 }]));
    render(() => <Outline />);
    const rail = screen.getByRole("complementary", { name: "Contents" });
    const list = screen.getByRole("navigation", { name: "Outline" });
    expect(rail).toContainElement(list);
    expect(screen.queryByTestId("document-status")).toBeNull();
    expect(screen.queryByText(/min read/)).toBeNull();
  });

  it("lists headings with indentation by level", () => {
    flush(() =>
      setOutline([
        { level: 1, text: "One", line: 1 },
        { level: 2, text: "Two", line: 3 },
        { level: 3, text: "Three", line: 5 },
      ]),
    );
    render(() => <Outline />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["One", "Two", "Three"]);
    expect(buttons[0].style.getPropertyValue("--outline-depth")).toBe("0");
    expect(buttons[1].style.getPropertyValue("--outline-depth")).toBe("1");
    expect(buttons[2].style.getPropertyValue("--outline-depth")).toBe("2");
  });

  it("highlights the heading at or before the cursor", () => {
    flush(() => setOutline(ONE_TWO));
    render(() => <Outline />);
    flush(() => setCursor({ line: 3, column: 1 }));
    expect(screen.getByRole("button", { name: "One" })).toHaveAttribute("aria-current", "location");
    flush(() => setCursor({ line: 6, column: 1 }));
    expect(screen.getByRole("button", { name: "Two" })).toHaveAttribute("aria-current", "location");
    expect(screen.getByRole("button", { name: "One" })).not.toHaveAttribute("aria-current");
  });

  it("follows the scroll position when the viewport reports a line", () => {
    flush(() => setOutline(ONE_TWO));
    render(() => <Outline />);
    flush(() => setCursor({ line: 1, column: 1 }));
    flush(() => setViewportLine(5));
    expect(screen.getByRole("button", { name: "Two" })).toHaveAttribute("aria-current", "location");
    expect(screen.getByRole("button", { name: "One" })).not.toHaveAttribute("aria-current");
    flush(() => setViewportLine(2));
    expect(screen.getByRole("button", { name: "One" })).toHaveAttribute("aria-current", "location");
  });

  it("falls back to the cursor while the viewport is unknown", () => {
    flush(() => setOutline(ONE_TWO));
    render(() => <Outline />);
    flush(() => setCursor({ line: 6, column: 1 }));
    flush(() => setViewportLine(0));
    expect(screen.getByRole("button", { name: "Two" })).toHaveAttribute("aria-current", "location");
  });

  it.each<LayoutMode>(["editor", "preview"])(
    "scrolls and focuses the editor in the %s view",
    async (mode) => {
      const user = userEvent.setup();
      flush(() => {
        setOutline(ONE_TWO);
        setLayoutMode(mode);
      });
      const { editor } = registerApis();
      render(() => <Outline />);
      await user.click(screen.getByRole("button", { name: "Two" }));
      expect(editor.scrollToLine).toHaveBeenCalledWith(5);
      expect(editor.focus).toHaveBeenCalled();
    },
  );

  it("scrolls the read-only preview without focusing it", async () => {
    const user = userEvent.setup();
    flush(() => {
      setOutline(ONE_TWO);
      setLayoutMode("reader");
    });
    const { editor } = registerApis();
    render(() => <Outline />);
    await user.click(screen.getByRole("button", { name: "Two" }));
    expect(editor.scrollToLine).toHaveBeenCalledWith(5);
    expect(editor.focus).not.toHaveBeenCalled();
  });

  it("marks the clicked heading as current before the view reports its position", async () => {
    const user = userEvent.setup();
    flush(() => setOutline(ONE_TWO));
    registerApis();
    render(() => <Outline />);
    flush(() => setViewportLine(1));
    await user.click(screen.getByRole("button", { name: "Two" }));
    expect(screen.getByRole("button", { name: "Two" })).toHaveAttribute("aria-current", "location");
    flush(() => setViewportLine(4));
    expect(screen.getByRole("button", { name: "Two" })).toHaveAttribute("aria-current", "location");
    expect(screen.getByRole("button", { name: "One" })).not.toHaveAttribute("aria-current");
  });

  it("follows the view again once the reader scrolls away from the clicked heading", async () => {
    const user = userEvent.setup();
    flush(() => setOutline(ONE_TWO));
    registerApis();
    render(() => <Outline />);
    await user.click(screen.getByRole("button", { name: "Two" }));
    flush(() => setViewportLine(4));
    flush(() => setViewportLine(2));
    expect(screen.getByRole("button", { name: "One" })).toHaveAttribute("aria-current", "location");
  });

  it("labels empty headings", () => {
    flush(() => setOutline([{ level: 1, text: "", line: 1 }]));
    render(() => <Outline />);
    expect(screen.getByRole("button", { name: "Untitled heading" })).toBeInTheDocument();
  });
});
