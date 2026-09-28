import { afterEach, describe, expect, it } from "vite-plus/test";
import { flush } from "solid-js";
import {
  outline,
  outlineDocumentId,
  resetStatsState,
  setOutline,
  stats,
  updateStatsFromText,
} from "./stats";

afterEach(() => resetStatsState());

describe("stats state", () => {
  it("starts empty", () => {
    expect(stats()).toEqual({ words: 0, characters: 0, readingMinutes: 0 });
    expect(outline()).toEqual([]);
  });

  it("derives stats from text", () => {
    flush(() => updateStatsFromText("# Title\n\nsome words here"));
    expect(stats()).toEqual({ words: 4, characters: 24, readingMinutes: 1 });
    expect(outline()).toEqual([]);
  });

  it("stores the outline published by the editor", () => {
    const entries = [{ level: 1, text: "Title", line: 1 }];
    flush(() => setOutline(entries));
    expect(outline()).toBe(entries);
    expect(outlineDocumentId()).toBeNull();
    flush(() => setOutline(entries, "abc123"));
    expect(outlineDocumentId()).toBe("abc123");
    flush(resetStatsState);
    expect(outline()).toEqual([]);
    expect(outlineDocumentId()).toBeNull();
  });
});
