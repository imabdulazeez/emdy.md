import { isThemeColors, BUILT_IN_THEMES, type ThemeDefinition } from "~/lib/themes/palettes";
import { createPersistedSignal } from "~/lib/storage/persisted";
import { preferenceKey } from "./preferences";

export const CUSTOM_THEME_PREFIX = "custom-";
export const THEME_NAME_MAX = 40;

const CUSTOM_ID = /^custom-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isThemeName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    value.length > 0 &&
    value.length <= THEME_NAME_MAX
  );
}

export function isCustomTheme(value: unknown): value is ThemeDefinition {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    CUSTOM_ID.test(record.id) &&
    isThemeName(record.name) &&
    isThemeColors(record.light) &&
    isThemeColors(record.dark)
  );
}

export function isCustomThemeList(value: unknown): value is readonly ThemeDefinition[] {
  if (!Array.isArray(value) || !value.every(isCustomTheme)) return false;
  return new Set(value.map((theme) => theme.id)).size === value.length;
}

const store = createPersistedSignal<readonly ThemeDefinition[]>({
  key: preferenceKey("custom-themes"),
  fallback: [],
  parse: isCustomThemeList,
});

export const customThemes = store.value;

export function peekCustomThemes(): readonly ThemeDefinition[] {
  return store.peek();
}

export function makeCustomThemeId(name: string, taken: Iterable<string>): string {
  const slug =
    name
      .normalize("NFKD")
      .replace(/\p{M}+/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32)
      .replace(/-+$/, "") || "theme";
  const used = new Set(taken);
  for (const theme of BUILT_IN_THEMES) used.add(theme.id);
  const base = `${CUSTOM_THEME_PREFIX}${slug}`;
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

export function saveCustomTheme(theme: ThemeDefinition): void {
  const { id, name, light, dark } = theme;
  const saved: ThemeDefinition = { id, name, light: { ...light }, dark: { ...dark } };
  store.set((themes) => {
    const index = themes.findIndex((existing) => existing.id === id);
    if (index === -1) return [...themes, saved];
    return themes.map((existing, position) => (position === index ? saved : existing));
  });
}

export function deleteCustomTheme(id: string): void {
  store.set((themes) => themes.filter((theme) => theme.id !== id));
}

export function resetCustomThemes(): void {
  store.reset();
}
