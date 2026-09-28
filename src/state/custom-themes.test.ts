import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { flush } from "solid-js";
import { DEFAULT_THEME, type ThemeDefinition } from "~/lib/themes/palettes";
import {
  customThemes,
  deleteCustomTheme,
  isCustomTheme,
  isCustomThemeList,
  isThemeName,
  makeCustomThemeId,
  peekCustomThemes,
  resetCustomThemes,
  saveCustomTheme,
} from "./custom-themes";

const KEY = "emdy:pref:custom-themes";

const night: ThemeDefinition = {
  id: "custom-night",
  name: "Night",
  light: DEFAULT_THEME.light,
  dark: { ...DEFAULT_THEME.dark, accent: "#cc3366" },
};

afterEach(() => resetCustomThemes());

describe("custom theme validation", () => {
  it("accepts a well-formed custom theme", () => {
    expect(isCustomTheme(night)).toBe(true);
  });

  it("rejects built-in ids, bad names, and incomplete palettes", () => {
    expect(isCustomTheme({ ...night, id: "paper" })).toBe(false);
    expect(isCustomTheme({ ...night, id: "custom-Night" })).toBe(false);
    expect(isCustomTheme({ ...night, name: "" })).toBe(false);
    expect(isCustomTheme({ ...night, name: " padded " })).toBe(false);
    expect(isCustomTheme({ ...night, name: "x".repeat(41) })).toBe(false);
    expect(isCustomTheme({ ...night, dark: { ...night.dark, text: "white" } })).toBe(false);
    expect(isCustomTheme({ ...night, light: undefined })).toBe(false);
    expect(isCustomTheme("night")).toBe(false);
  });

  it("rejects lists with duplicate ids", () => {
    expect(isCustomThemeList([night])).toBe(true);
    expect(isCustomThemeList([night, night])).toBe(false);
    expect(isCustomThemeList({})).toBe(false);
  });

  it("validates names", () => {
    expect(isThemeName("Night")).toBe(true);
    expect(isThemeName(" Night")).toBe(false);
    expect(isThemeName(3)).toBe(false);
  });
});

describe("makeCustomThemeId", () => {
  it("slugs the name and avoids taken and built-in ids", () => {
    expect(makeCustomThemeId("Night Ink!", [])).toBe("custom-night-ink");
    expect(makeCustomThemeId("Night Ink", ["custom-night-ink"])).toBe("custom-night-ink-2");
    expect(makeCustomThemeId("Night Ink", ["custom-night-ink", "custom-night-ink-2"])).toBe(
      "custom-night-ink-3",
    );
    expect(makeCustomThemeId("Café Crème", [])).toBe("custom-cafe-creme");
    expect(makeCustomThemeId("✨✨", [])).toBe("custom-theme");
    expect(makeCustomThemeId("a".repeat(60), []).length).toBeLessThanOrEqual(39);
    expect(isCustomTheme({ ...night, id: makeCustomThemeId("-- Odd -- name --", []) })).toBe(true);
  });
});

describe("custom theme store", () => {
  it("starts empty", () => {
    expect(customThemes()).toEqual([]);
  });

  it("adds, updates, and deletes themes and writes each change", () => {
    flush(() => saveCustomTheme(night));
    expect(customThemes()).toEqual([night]);
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual([night]);
    const renamed = { ...night, name: "Midnight" };
    flush(() => saveCustomTheme(renamed));
    expect(customThemes()).toEqual([renamed]);
    const second = { ...night, id: "custom-day", name: "Day" };
    flush(() => saveCustomTheme(second));
    expect(peekCustomThemes().map((theme) => theme.id)).toEqual(["custom-night", "custom-day"]);
    flush(() => deleteCustomTheme("custom-night"));
    expect(customThemes()).toEqual([second]);
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual([second]);
  });

  it("restores saved themes and ignores malformed storage", async () => {
    flush(() => saveCustomTheme(night));
    vi.resetModules();
    const fresh = await import("./custom-themes");
    expect(fresh.customThemes()).toEqual([night]);
    window.localStorage.setItem(KEY, JSON.stringify([{ ...night, id: "paper" }]));
    vi.resetModules();
    const invalid = await import("./custom-themes");
    expect(invalid.customThemes()).toEqual([]);
    window.localStorage.removeItem(KEY);
  });
});
