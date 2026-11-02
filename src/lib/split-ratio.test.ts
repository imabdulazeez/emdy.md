import { describe, expect, it } from "vite-plus/test";
import {
  clampSplitRatio,
  isSplitRatio,
  MIN_PANE_WIDTH,
  ratioAtPointer,
  roundRatio,
  SPLIT_RATIO_DEFAULT,
} from "./split-ratio";

describe("isSplitRatio", () => {
  it("accepts finite shares between a fifth and four fifths", () => {
    expect(isSplitRatio(0.2)).toBe(true);
    expect(isSplitRatio(0.5)).toBe(true);
    expect(isSplitRatio(0.8)).toBe(true);
    expect(isSplitRatio(0.19)).toBe(false);
    expect(isSplitRatio(0.81)).toBe(false);
    expect(isSplitRatio(Number.NaN)).toBe(false);
    expect(isSplitRatio("0.5")).toBe(false);
    expect(isSplitRatio(null)).toBe(false);
  });
});

describe("clampSplitRatio", () => {
  it("keeps the share within the bounds on a wide sheet", () => {
    expect(clampSplitRatio(0.1, 4000)).toBe(0.2);
    expect(clampSplitRatio(0.9, 4000)).toBe(0.8);
    expect(clampSplitRatio(0.4, 4000)).toBe(0.4);
  });

  it("keeps each pane wide enough to read on a narrower sheet", () => {
    const width = 1000;
    expect(clampSplitRatio(0.2, width)).toBe(MIN_PANE_WIDTH / width);
    expect(clampSplitRatio(0.8, width)).toBe(1 - MIN_PANE_WIDTH / width);
  });

  it("evens out when there is no room for both panes or no measurement", () => {
    expect(clampSplitRatio(0.3, 400)).toBe(SPLIT_RATIO_DEFAULT);
    expect(clampSplitRatio(Number.NaN, 2000)).toBe(SPLIT_RATIO_DEFAULT);
    expect(clampSplitRatio(0.3, 0)).toBe(0.3);
  });
});

describe("ratioAtPointer", () => {
  it("measures the pointer from the container's left edge", () => {
    expect(ratioAtPointer(600, 100, 1000)).toBe(0.5);
    expect(ratioAtPointer(400, 100, 1000)).toBe(0.3);
    expect(ratioAtPointer(0, 100, 1000)).toBe(0.28);
    expect(ratioAtPointer(300, 0, 0)).toBe(SPLIT_RATIO_DEFAULT);
  });
});

describe("roundRatio", () => {
  it("rounds to a tenth of a percent", () => {
    expect(roundRatio(0.123456)).toBe(0.123);
    expect(roundRatio(0.5)).toBe(0.5);
  });
});
