import { afterEach, describe, expect, it } from "vite-plus/test";
import { flush } from "solid-js";
import {
  loadLucideIcon,
  loadLucideIcons,
  lucideFailed,
  lucideIcon,
  lucideRegistry,
  resetLucideState,
} from "./lucide";

afterEach(() => resetLucideState());

describe("lucide loading", () => {
  it("starts empty and loads the registry once on demand", async () => {
    expect(lucideRegistry()).toBeNull();
    const first = loadLucideIcons();
    expect(loadLucideIcons()).toBe(first);
    const registry = await first;
    expect(registry?.icons.has("book-open")).toBe(true);
    expect(registry?.names).toContain("book-open");
    expect(registry?.names).toEqual([...(registry?.names ?? [])].sort());
    flush();
    expect(lucideRegistry()).toBe(registry);
    expect(lucideIcon("map-pin")).toBe(registry?.icons.get("map-pin"));
    expect(lucideFailed()).toBe(false);
  });

  it("loads a single icon's group without assembling the whole registry", async () => {
    expect(lucideIcon("map-pin")).toBeNull();
    const node = await loadLucideIcon("map-pin");
    flush();
    expect(node?.length).toBeGreaterThan(0);
    expect(lucideIcon("map-pin")).toBe(node);
    expect(lucideIcon("book-open")).toBeNull();
    expect(lucideRegistry()).toBeNull();
  });

  it("reports an icon missing from a loaded group, or from a group that does not exist", async () => {
    expect(await loadLucideIcon("map-not-real")).toBeUndefined();
    expect(await loadLucideIcon("?what")).toBeUndefined();
    flush();
    expect(lucideIcon("map-not-real")).toBeUndefined();
    expect(lucideIcon("?what")).toBeUndefined();
  });

  it("forgets the registry and loaded groups when reset", async () => {
    await loadLucideIcons();
    flush(() => resetLucideState());
    expect(lucideRegistry()).toBeNull();
    expect(lucideIcon("book-open")).toBeNull();
  });
});
