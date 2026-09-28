import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { contrast } from "./color";
import {
  BUILT_IN_THEMES,
  DEFAULT_THEME,
  GUIDED_ROLES,
  ROLE_GROUPS,
  ROLE_LABELS,
  THEME_ROLES,
  derivePalette,
  isThemeColors,
  themeBase,
  type ThemeColors,
} from "./palettes";

const css = readFileSync(resolve(process.cwd(), "src/app.css"), "utf8");

function block(selector: string): string {
  const start = css.indexOf(selector);
  return css.slice(start, css.indexOf("\n}", start));
}

function tokens(source: string): Record<string, string> {
  return Object.fromEntries(
    Array.from(source.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6});/g), (match) => [
      match[1],
      match[2],
    ]),
  );
}

describe("built-in themes", () => {
  it("ships six complete themes with unique ids and names", () => {
    expect(BUILT_IN_THEMES).toHaveLength(6);
    expect(BUILT_IN_THEMES.map((theme) => theme.name)).toEqual([
      "Paper",
      "Sepia",
      "Sage",
      "Tide",
      "Iris",
      "Rose",
    ]);
    expect(new Set(BUILT_IN_THEMES.map((theme) => theme.id)).size).toBe(6);
    expect(BUILT_IN_THEMES[0]).toBe(DEFAULT_THEME);
    for (const theme of BUILT_IN_THEMES) {
      expect(isThemeColors(theme.light), theme.id).toBe(true);
      expect(isThemeColors(theme.dark), theme.id).toBe(true);
    }
  });

  it("keeps the default theme identical to the stylesheet fallback", () => {
    const light = tokens(block("@theme {"));
    const dark = tokens(block('[data-theme="dark"] {'));
    for (const role of THEME_ROLES) {
      expect(DEFAULT_THEME.light[role], `light ${role}`).toBe(light[role]);
      expect(DEFAULT_THEME.dark[role], `dark ${role}`).toBe(dark[role]);
    }
  });

  it("declares a stylesheet token for every themable role", () => {
    const declared = new Set(Object.keys(tokens(block("@theme {"))));
    for (const role of THEME_ROLES) expect(declared.has(role), role).toBe(true);
  });

  it("keeps body text and links readable in every theme", () => {
    for (const theme of BUILT_IN_THEMES) {
      for (const colors of [theme.light, theme.dark]) {
        expect(contrast(colors.text, colors.surface), theme.id).toBeGreaterThanOrEqual(7);
        expect(contrast(colors.accent, colors.surface), theme.id).toBeGreaterThanOrEqual(4.5);
        expect(contrast(colors["accent-fg"], colors.accent), theme.id).toBeGreaterThanOrEqual(4.5);
        expect(contrast(colors["text-muted"], colors.surface), theme.id).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe("role metadata", () => {
  it("labels every role and places each in exactly one group", () => {
    const grouped = ROLE_GROUPS.flatMap((group) => group.roles);
    expect([...grouped].sort()).toEqual([...THEME_ROLES].sort());
    for (const role of THEME_ROLES) expect(ROLE_LABELS[role]).toBeTruthy();
    expect(GUIDED_ROLES).toEqual(["canvas", "surface", "text", "accent"]);
  });
});

describe("isThemeColors", () => {
  it("rejects missing, extra, or malformed roles", () => {
    const valid: ThemeColors = DEFAULT_THEME.light;
    expect(isThemeColors(valid)).toBe(true);
    expect(isThemeColors(null)).toBe(false);
    expect(isThemeColors({ ...valid, canvas: "red" })).toBe(false);
    expect(isThemeColors({ ...valid, extra: "#000000" })).toBe(false);
    const { canvas: _, ...missing } = valid;
    expect(isThemeColors(missing)).toBe(false);
  });
});

describe("derivePalette", () => {
  it("builds every role from four base colours and keeps code hues from the seed", () => {
    const base = { canvas: "#dddddd", surface: "#ffffff", text: "#000000", accent: "#0000ff" };
    const colors = derivePalette(base, "light", DEFAULT_THEME.light);
    expect(isThemeColors(colors)).toBe(true);
    expect(themeBase(colors)).toEqual(base);
    expect(colors["syntax-heading"]).toBe("#000000");
    expect(colors["syntax-link"]).toBe("#0000ff");
    expect(colors["accent-fg"]).toBe("#ffffff");
    expect(colors["syntax-code-bg"]).toBe(colors["surface-raised"]);
    expect(colors["syntax-keyword"]).toBe(DEFAULT_THEME.light["syntax-keyword"]);
    expect(colors.danger).toBe(DEFAULT_THEME.light.danger);
    expect(contrast(colors["text-muted"], colors.surface)).toBeGreaterThan(
      contrast(colors["text-faint"], colors.surface),
    );
  });

  it("puts dark text on a light accent", () => {
    const base = { canvas: "#101010", surface: "#1a1a1a", text: "#eeeeee", accent: "#9fb0ff" };
    expect(derivePalette(base, "dark", DEFAULT_THEME.dark)["accent-fg"]).toBe("#1a1a1a");
  });
});
