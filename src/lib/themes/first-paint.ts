import { BUILT_IN_THEMES } from "./palettes";

export const FIRST_PAINT_PLACEHOLDER = '"__EMDY_THEMES__"';

export function firstPaintThemes(): string {
  const entries = BUILT_IN_THEMES.map((theme) => [
    theme.id,
    { light: theme.light, dark: theme.dark },
  ]);
  return JSON.stringify(Object.fromEntries(entries));
}

export function injectFirstPaintThemes(html: string): string {
  return html.replace(FIRST_PAINT_PLACEHOLDER, firstPaintThemes());
}

export function firstPaintThemesPlugin() {
  return {
    name: "emdy-first-paint-themes",
    transformIndexHtml: (html: string) => injectFirstPaintThemes(html),
  };
}
