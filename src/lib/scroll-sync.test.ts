import { describe, expect, it } from "vite-plus/test";
import { nearestScrollTop, scrollThumb, scrollTopForThumb } from "./scroll-sync";

describe("nearestScrollTop", () => {
  const base = { scrollTop: 100, viewHeight: 200, itemHeight: 20, margin: 8 };

  it("leaves the scroller alone when the item is already visible", () => {
    expect(nearestScrollTop({ ...base, itemTop: 150 })).toBe(100);
  });

  it("scrolls up to reveal an item above the viewport", () => {
    expect(nearestScrollTop({ ...base, itemTop: 60 })).toBe(52);
  });

  it("scrolls down to reveal an item below the viewport", () => {
    expect(nearestScrollTop({ ...base, itemTop: 320 })).toBe(148);
  });

  it("never returns a negative offset", () => {
    expect(nearestScrollTop({ ...base, scrollTop: 4, itemTop: 0 })).toBe(0);
  });

  it("treats a missing margin as zero", () => {
    expect(nearestScrollTop({ scrollTop: 50, viewHeight: 100, itemTop: 40, itemHeight: 20 })).toBe(
      40,
    );
  });
});

describe("scrollThumb", () => {
  const base = { scrollHeight: 1000, clientHeight: 250, trackHeight: 200 };

  it("hides the thumb when nothing overflows", () => {
    expect(scrollThumb({ ...base, scrollTop: 0, scrollHeight: 250 })).toBeNull();
  });

  it("hides the thumb when the track has no height", () => {
    expect(scrollThumb({ ...base, scrollTop: 0, trackHeight: 0 })).toBeNull();
  });

  it("sizes the thumb by the visible fraction and starts it at the top", () => {
    expect(scrollThumb({ ...base, scrollTop: 0 })).toEqual({ offset: 0, size: 50 });
  });

  it("moves the thumb in proportion to the scroll position", () => {
    expect(scrollThumb({ ...base, scrollTop: 375 })).toEqual({ offset: 75, size: 50 });
    expect(scrollThumb({ ...base, scrollTop: 750 })).toEqual({ offset: 150, size: 50 });
  });

  it("keeps a minimum size and clamps overscroll", () => {
    expect(scrollThumb({ ...base, scrollHeight: 100_000, scrollTop: 0, minSize: 24 })?.size).toBe(
      24,
    );
    expect(scrollThumb({ ...base, scrollTop: 5000 })?.offset).toBe(150);
    expect(scrollThumb({ ...base, scrollTop: -40 })?.offset).toBe(0);
  });
});

describe("scrollTopForThumb", () => {
  const base = { size: 50, trackHeight: 200, scrollHeight: 1000, clientHeight: 250 };

  it("inverts the thumb position into a scroll offset", () => {
    expect(scrollTopForThumb({ ...base, offset: 75 })).toBe(375);
  });

  it("clamps offsets past either end of the track", () => {
    expect(scrollTopForThumb({ ...base, offset: -20 })).toBe(0);
    expect(scrollTopForThumb({ ...base, offset: 900 })).toBe(750);
  });

  it("returns zero when there is no room to move", () => {
    expect(scrollTopForThumb({ ...base, offset: 10, size: 200 })).toBe(0);
    expect(scrollTopForThumb({ ...base, offset: 10, scrollHeight: 250 })).toBe(0);
  });
});
