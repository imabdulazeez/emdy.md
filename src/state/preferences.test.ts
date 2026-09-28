import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { flush } from "solid-js";
import {
  definePreference,
  findPreference,
  preferenceKey,
  preferences,
  resetPreferences,
} from "./preferences";
import { palette, theme } from "./theme";
import { layout } from "./layout";
import { DOCUMENT_FONTS } from "./typography";

const isFlag = (value: unknown): value is boolean => typeof value === "boolean";

afterEach(() => resetPreferences());

describe("preferences registry", () => {
  it("registers theme and layout as user preferences", () => {
    const names = preferences().map((preference) => preference.name);
    expect(names).toContain("theme");
    expect(names).toContain("layout");
    expect(names).toContain("palette");
    expect(names.indexOf("palette")).toBe(names.indexOf("theme") + 1);
    expect(findPreference("palette")).toBe(palette);
    expect(palette.control).toEqual({ kind: "themes" });
    expect(palette.fallback).toBe("paper");
    expect(findPreference("theme")).toBe(theme);
    expect(findPreference("layout")).toBe(layout);
    expect(theme.key).toBe(preferenceKey("theme"));
    expect(theme.control).toEqual({
      kind: "choice",
      options: ["light", "dark", "system"],
      labels: { light: "Light", dark: "Dark", system: "System" },
    });
    expect(layout.control.kind).toBe("choice");
  });

  it("stores each preference under its own namespaced key", () => {
    flush(() => theme.set("dark"));
    expect(window.localStorage.getItem("emdy:pref:theme")).toBe('"dark"');
    flush(() => layout.set("reader"));
    expect(window.localStorage.getItem("emdy:pref:layout")).toBe('"reader"');
    flush(() => resetPreferences());
    expect(window.localStorage.getItem("emdy:pref:theme")).toBeNull();
    expect(theme.value()).toBe("system");
    expect(layout.value()).toBe("editor");
  });

  it("lets a new preference be defined with its label and control", () => {
    const flag = definePreference<boolean>({
      name: "test-flag",
      label: "Test flag",
      fallback: false,
      parse: isFlag,
      control: { kind: "toggle" },
    });
    expect(findPreference("test-flag")).toBe(flag);
    expect(flag.value()).toBe(false);
    flush(() => flag.set(true));
    expect(window.localStorage.getItem(preferenceKey("test-flag"))).toBe("true");
    flush(() => flag.reset());
    expect(window.localStorage.getItem(preferenceKey("test-flag"))).toBeNull();
  });

  it("replaces a redefined preference instead of keeping two entries", () => {
    definePreference<boolean>({
      name: "dup",
      label: "First",
      fallback: false,
      parse: isFlag,
      control: { kind: "toggle" },
    });
    const second = definePreference<boolean>({
      name: "dup",
      label: "Second",
      fallback: true,
      parse: isFlag,
      control: { kind: "toggle" },
    });
    expect(preferences().filter((preference) => preference.name === "dup")).toEqual([second]);
  });
});

describe("first-paint theme script", () => {
  const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

  it("reads the same key the theme preference writes", () => {
    expect(html).toContain(`read("${preferenceKey("theme")}")`);
    expect(html).toContain(`read("${preferenceKey("palette")}")`);
    expect(html).toContain(`read("${preferenceKey("custom-themes")}")`);
    expect(html).toContain("localStorage.getItem(key)");
    expect(html).toContain("prefers-color-scheme: dark");
  });

  it("reads the same key and fonts the document font preference uses", () => {
    expect(html).toContain(`read("${preferenceKey("font")}")`);
    for (const font of DOCUMENT_FONTS.filter((font) => font !== "sans"))
      expect(html).toContain(`font === "${font}"`);
    expect(html).toContain(': "sans"');
  });
});
