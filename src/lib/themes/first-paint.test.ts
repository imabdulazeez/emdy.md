import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInThisContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  FIRST_PAINT_PLACEHOLDER,
  firstPaintThemes,
  firstPaintThemesPlugin,
  injectFirstPaintThemes,
} from "./first-paint";
import { BUILT_IN_THEMES, DEFAULT_THEME } from "./palettes";

const source = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

function runFirstPaint(prefersDark = false) {
  const html = injectFirstPaintThemes(source);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: prefersDark })),
  );
  runInThisContext(script);
}

const root = document.documentElement;
const sage = BUILT_IN_THEMES.find((theme) => theme.id === "sage")!;

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
  root.removeAttribute("style");
  delete root.dataset.theme;
});

describe("first-paint themes", () => {
  it("serializes both palettes of every built-in theme", () => {
    const parsed = JSON.parse(firstPaintThemes());
    expect(Object.keys(parsed)).toEqual(BUILT_IN_THEMES.map((theme) => theme.id));
    expect(parsed.sage).toEqual({ light: sage.light, dark: sage.dark });
  });

  it("replaces the placeholder in index.html through the Vite plugin", () => {
    expect(source).toContain(FIRST_PAINT_PLACEHOLDER);
    const plugin = firstPaintThemesPlugin();
    expect(plugin.name).toBe("emdy-first-paint-themes");
    const html = plugin.transformIndexHtml(source);
    expect(html).not.toContain(FIRST_PAINT_PLACEHOLDER);
    expect(html).toContain(`var builtIn = ${firstPaintThemes()};`);
  });

  it("paints nothing extra when no theme is stored", () => {
    runFirstPaint();
    expect(root.dataset.theme).toBe("light");
    expect(root.style.getPropertyValue("--color-canvas")).toBe("");
  });

  it("paints a stored built-in theme for the resolved appearance", () => {
    window.localStorage.setItem("emdy:pref:palette", '"sage"');
    runFirstPaint(true);
    expect(root.dataset.theme).toBe("dark");
    expect(root.style.getPropertyValue("--color-canvas")).toBe(sage.dark.canvas);
    expect(root.style.getPropertyValue("--color-syntax-type")).toBe(sage.dark["syntax-type"]);
  });

  it("paints a stored custom theme and skips malformed colours", () => {
    const custom = {
      id: "custom-night",
      name: "Night",
      light: { ...DEFAULT_THEME.light, accent: "#cc3366", border: "url(x)" },
      dark: DEFAULT_THEME.dark,
    };
    window.localStorage.setItem("emdy:pref:theme", '"light"');
    window.localStorage.setItem("emdy:pref:palette", '"custom-night"');
    window.localStorage.setItem("emdy:pref:custom-themes", JSON.stringify([custom]));
    runFirstPaint(true);
    expect(root.dataset.theme).toBe("light");
    expect(root.style.getPropertyValue("--color-accent")).toBe("#cc3366");
    expect(root.style.getPropertyValue("--color-border")).toBe("");
  });

  it("ignores unknown ids and corrupt storage", () => {
    window.localStorage.setItem("emdy:pref:palette", '"constructor"');
    window.localStorage.setItem("emdy:pref:custom-themes", "{not json");
    expect(() => runFirstPaint()).not.toThrow();
    expect(root.style.getPropertyValue("--color-canvas")).toBe("");
  });
});
