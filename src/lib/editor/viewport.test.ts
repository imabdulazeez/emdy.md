import { describe, expect, it, vi } from "vite-plus/test";
import {
  blockStartLine,
  lineOffset,
  topVisibleLine,
  VIEWPORT_SCROLL_MARGIN,
  type LineOffsetProbe,
  type ViewportProbe,
} from "./viewport";

function probe(pos: number, line: number) {
  const posAtCoords = vi.fn(() => pos);
  const view = {
    scrollDOM: { getBoundingClientRect: () => ({ left: 20, top: 100 }) } as HTMLElement,
    posAtCoords,
    state: { doc: { lineAt: () => ({ number: line }) } },
  } satisfies ViewportProbe;
  return { view, posAtCoords };
}

describe("topVisibleLine", () => {
  it("probes below the margin a scrolled-to line is parked at", () => {
    const { view, posAtCoords } = probe(42, 7);
    expect(topVisibleLine(view)).toBe(7);
    expect(posAtCoords).toHaveBeenCalledWith({ x: 24, y: 100 + VIEWPORT_SCROLL_MARGIN + 4 }, false);
  });

  it("honours a custom margin", () => {
    const { view, posAtCoords } = probe(0, 1);
    topVisibleLine(view, 12);
    expect(posAtCoords).toHaveBeenCalledWith(
      { x: 32, y: 100 + VIEWPORT_SCROLL_MARGIN + 12 },
      false,
    );
  });

  it("reports the line parked at the scroll margin, not the one above it", () => {
    const lines = [
      { number: 40, top: 100 },
      { number: 41, top: 100 + VIEWPORT_SCROLL_MARGIN },
    ];
    const view = {
      scrollDOM: { getBoundingClientRect: () => ({ left: 0, top: 100 }) } as HTMLElement,
      posAtCoords: ({ y }: { x: number; y: number }) =>
        y >= lines[1].top ? lines[1].number : lines[0].number,
      state: { doc: { lineAt: (pos: number) => ({ number: pos }) } },
    } satisfies ViewportProbe;
    expect(topVisibleLine(view)).toBe(41);
  });
});

describe("lineOffset", () => {
  function offsetProbe(node: Node) {
    return {
      scrollDOM: { getBoundingClientRect: () => ({ top: 100 }) } as HTMLElement,
      documentTop: 148,
      lineBlockAt: () => ({ top: 60 }),
      domAtPos: () => ({ node }),
      state: { doc: { line: () => ({ from: 10 }) } },
    } satisfies LineOffsetProbe;
  }

  it("measures the rendered line's content top below the scroller's top", () => {
    const row = document.createElement("div");
    row.className = "cm-line";
    row.style.paddingTop = "12px";
    row.append("Heading");
    document.body.append(row);
    row.getBoundingClientRect = () => ({ top: 70 }) as DOMRect;
    expect(lineOffset(offsetProbe(row.firstChild!), 3)).toBe(-18);
    row.remove();
  });

  it("falls back to the height map for a line without a rendered row", () => {
    const widget = document.createElement("table");
    expect(lineOffset(offsetProbe(widget), 3)).toBe(108);
  });
});

describe("blockStartLine", () => {
  const doc = (lines: string[]) => ({
    lines: lines.length,
    line: (n: number) => ({ text: lines[n - 1] }),
  });

  it("keeps a line with text", () => {
    expect(blockStartLine(doc(["a", "", "b"]), 1)).toBe(1);
  });

  it("moves past blank lines to the next block", () => {
    expect(blockStartLine(doc(["a", "", "  ", "b"]), 2)).toBe(4);
  });

  it("keeps the line when only blank lines follow", () => {
    expect(blockStartLine(doc(["a", "", ""]), 2)).toBe(2);
  });
});
