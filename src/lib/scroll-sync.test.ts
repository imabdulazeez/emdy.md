import { describe, expect, it } from "vite-plus/test";
import { nearestScrollTop } from "./scroll-sync";

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
