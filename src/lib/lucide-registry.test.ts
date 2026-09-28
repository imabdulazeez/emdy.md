import { describe, expect, it } from "vite-plus/test";
import { POPULAR_LUCIDE_ICONS } from "./document-icon";
import { lucideGroupKey } from "./lucide-groups";
import { LUCIDE_GROUPS, loadLucideGroup } from "./lucide-registry";

describe("lucide registry", () => {
  it("splits the icons into sorted groups by first letter", () => {
    expect(LUCIDE_GROUPS.length).toBeGreaterThan(20);
    expect(LUCIDE_GROUPS).toEqual([...LUCIDE_GROUPS].sort());
    expect(LUCIDE_GROUPS).toContain("b");
  });

  it("loads one group as SVG element data holding only its own icons", async () => {
    const group = await loadLucideGroup("b");
    const node = group.get("book-open")!;
    expect(node.length).toBeGreaterThan(0);
    for (const [tag, attrs] of node) {
      expect(typeof tag).toBe("string");
      expect(typeof attrs).toBe("object");
    }
    for (const name of group.keys()) expect(lucideGroupKey(name)).toBe("b");
    expect(group.has("map-pin")).toBe(false);
  });

  it("bundles every Lucide icon across its groups", async () => {
    const groups = await Promise.all(LUCIDE_GROUPS.map(loadLucideGroup));
    const total = groups.reduce((sum, group) => sum + group.size, 0);
    expect(total).toBeGreaterThan(1000);
    const all = new Set(groups.flatMap((group) => Array.from(group.keys())));
    expect(all.size).toBe(total);
    for (const name of POPULAR_LUCIDE_ICONS) expect(all.has(name)).toBe(true);
  });

  it("returns an empty group for a key that has none", async () => {
    expect((await loadLucideGroup("?")).size).toBe(0);
  });
});
