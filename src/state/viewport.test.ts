import { afterEach, describe, expect, it } from "vite-plus/test";
import { flush } from "solid-js";
import {
  anchorViewportLine,
  anchoredLine,
  readingViewportLine,
  resetViewportState,
  setViewportLine,
  viewportLine,
} from "./viewport";

afterEach(() => {
  resetViewportState();
});

describe("viewport state", () => {
  it("starts unknown", () => {
    expect(viewportLine()).toBe(0);
    expect(readingViewportLine()).toBe(0);
  });

  it("stores the reported line", () => {
    flush(() => setViewportLine(12));
    expect(viewportLine()).toBe(12);
    expect(readingViewportLine()).toBe(12);
  });

  it("floors fractional lines and clamps unknown values to zero", () => {
    flush(() => setViewportLine(4.8));
    expect(viewportLine()).toBe(4);
    flush(() => setViewportLine(-3));
    expect(viewportLine()).toBe(0);
  });

  it("resets", () => {
    flush(() => setViewportLine(9));
    flush(() => resetViewportState());
    expect(viewportLine()).toBe(0);
  });
});

describe("anchored reading position", () => {
  it("reads as the anchored line whatever the scroll reports next", () => {
    flush(() => setViewportLine(3));
    flush(() => anchorViewportLine(40));
    expect(anchoredLine()).toBe(40);
    expect(readingViewportLine()).toBe(40);
    flush(() => setViewportLine(37));
    expect(viewportLine()).toBe(37);
    expect(readingViewportLine()).toBe(40);
  });

  it("holds while the jump settles on repeated reports", () => {
    flush(() => anchorViewportLine(40));
    flush(() => setViewportLine(37));
    flush(() => setViewportLine(37));
    expect(readingViewportLine()).toBe(40);
  });

  it("releases once the view scrolls somewhere else", () => {
    flush(() => anchorViewportLine(40));
    flush(() => setViewportLine(37));
    flush(() => setViewportLine(52));
    expect(anchoredLine()).toBe(0);
    expect(readingViewportLine()).toBe(52);
  });

  it("releases on the next anchor and on reset", () => {
    flush(() => anchorViewportLine(40));
    flush(() => setViewportLine(37));
    flush(() => anchorViewportLine(80));
    expect(readingViewportLine()).toBe(80);
    flush(() => setViewportLine(78));
    expect(readingViewportLine()).toBe(80);
    flush(() => resetViewportState());
    expect(anchoredLine()).toBe(0);
    expect(readingViewportLine()).toBe(0);
  });

  it("ignores an unknown anchor line", () => {
    flush(() => setViewportLine(5));
    flush(() => anchorViewportLine(0));
    expect(anchoredLine()).toBe(0);
    expect(readingViewportLine()).toBe(0);
  });
});
