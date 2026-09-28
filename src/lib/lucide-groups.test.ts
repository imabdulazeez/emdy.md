import { describe, expect, it } from "vite-plus/test";
import {
  LUCIDE_GROUPS_ID,
  groupLucideFiles,
  lucideGroupKey,
  lucideGroupsPlugin,
} from "./lucide-groups";

const FILES = [
  "book.mjs",
  "a-arrow-down.mjs",
  "a-arrow-down.mjs.map",
  "book-open.mjs",
  "anchor.mjs",
  "README.md",
];

describe("lucide groups", () => {
  it("keys an icon by its first letter", () => {
    expect(lucideGroupKey("map-pin")).toBe("m");
  });

  it("groups icon modules by first letter in name order and skips everything else", () => {
    expect(groupLucideFiles(FILES)).toEqual(
      new Map([
        ["a", ["a-arrow-down", "anchor"]],
        ["b", ["book", "book-open"]],
      ]),
    );
  });

  it("serves an index of lazy group imports and one module per group", () => {
    const plugin = lucideGroupsPlugin("/icons", FILES);
    const index = plugin.resolveId(LUCIDE_GROUPS_ID)!;
    expect(index.startsWith("\0")).toBe(true);
    const source = plugin.load(index)!;
    expect(source).toContain('"a": () => import("virtual:lucide-group/lucide-a")');
    expect(source).toContain('"b": () => import("virtual:lucide-group/lucide-b")');
    const group = plugin.load(plugin.resolveId("virtual:lucide-group/lucide-b")!)!;
    expect(group).toContain('import i0 from "/icons/book.mjs";');
    expect(group).toContain('import i1 from "/icons/book-open.mjs";');
    expect(group).toContain('"book-open": i1,');
    expect(group).not.toContain("anchor");
  });

  it("ignores unrelated ids and unknown groups", () => {
    const plugin = lucideGroupsPlugin("/icons", FILES);
    expect(plugin.resolveId("lucide")).toBeNull();
    expect(plugin.load("/src/main.ts")).toBeNull();
    expect(plugin.load("\0virtual:lucide-group/lucide-z")).toBeNull();
  });
});
