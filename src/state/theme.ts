import { createSignal } from "solid-js";
import {
  BUILT_IN_THEMES,
  DEFAULT_THEME,
  THEME_ROLES,
  type ThemeColors,
  type ThemeDefinition,
} from "~/lib/themes/palettes";
import {
  customThemes,
  deleteCustomTheme,
  peekCustomThemes,
  resetCustomThemes,
} from "./custom-themes";
import { prefersReducedMotion } from "~/lib/motion";
import { holdTransitions } from "~/lib/transitions";
import { definePreference } from "./preferences";

export const THEME_PREFERENCES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = "light" | "dark";

export const THEME_LABELS: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && (THEME_PREFERENCES as readonly string[]).includes(value);
}

export const theme = definePreference<ThemePreference>({
  name: "theme",
  label: "Appearance",
  fallback: "system",
  parse: isThemePreference,
  control: { kind: "choice", options: THEME_PREFERENCES, labels: THEME_LABELS },
});

export function isThemeId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export const palette = definePreference<string>({
  name: "palette",
  label: "Theme",
  fallback: DEFAULT_THEME.id,
  parse: isThemeId,
  control: { kind: "themes" },
});

const themePreference = theme.value;
const DARK_QUERY = "(prefers-color-scheme: dark)";

export function prefersDarkScheme(
  target: Partial<Pick<Window, "matchMedia">> = globalThis,
): boolean {
  return typeof target.matchMedia === "function" && target.matchMedia(DARK_QUERY).matches;
}

const [systemPrefersDark, setSystemPrefersDark] = createSignal(prefersDarkScheme());

export { themePreference, systemPrefersDark };

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === "system") return prefersDark ? "dark" : "light";
  return preference;
}

export function resolvedTheme(): ResolvedTheme {
  return resolveTheme(themePreference(), systemPrefersDark());
}

export function setThemePreference(preference: ThemePreference): void {
  theme.set(preference);
}

export function nextThemePreference(current: ThemePreference): ThemePreference {
  const index = THEME_PREFERENCES.indexOf(current);
  return THEME_PREFERENCES[(index + 1) % THEME_PREFERENCES.length];
}

export function watchSystemTheme(target: Pick<Window, "matchMedia"> = window): () => void {
  if (typeof target.matchMedia !== "function") return () => {};
  const query = target.matchMedia(DARK_QUERY);
  setSystemPrefersDark(query.matches);
  const onChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function findTheme(
  id: string,
  custom: readonly ThemeDefinition[] = customThemes(),
): ThemeDefinition | undefined {
  return (
    BUILT_IN_THEMES.find((entry) => entry.id === id) ?? custom.find((entry) => entry.id === id)
  );
}

export function activeTheme(): ThemeDefinition {
  return findTheme(palette.value()) ?? DEFAULT_THEME;
}

export function selectTheme(id: string): void {
  palette.set(id);
}

export function removeCustomTheme(id: string): void {
  if (!peekCustomThemes().some((entry) => entry.id === id)) return;
  deleteCustomTheme(id);
  if (palette.peek() === id) palette.set(DEFAULT_THEME.id);
}

export function applyThemeColors(
  colors: ThemeColors,
  root: HTMLElement = document.documentElement,
): void {
  for (const role of THEME_ROLES) root.style.setProperty(`--color-${role}`, colors[role]);
}

const requestedThemes = new WeakMap<HTMLElement, ResolvedTheme>();
const requestedColors = new WeakMap<HTMLElement, ThemeColors>();

function canCrossfade(root: HTMLElement): boolean {
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  if (root !== doc.documentElement || typeof doc.startViewTransition !== "function") return false;
  if (doc.visibilityState === "hidden" || !view) return false;
  return !prefersReducedMotion(view);
}

function swapThemeAttribute(root: HTMLElement): void {
  const theme = requestedThemes.get(root);
  if (!theme) return;
  const release = holdTransitions(root);
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  const colors = requestedColors.get(root);
  if (colors) applyThemeColors(colors, root);
  release();
}

function requestTheme(theme: ResolvedTheme, root: HTMLElement, colorsChanged: boolean): void {
  const pending = requestedThemes.get(root);
  requestedThemes.set(root, theme);
  const settled =
    root.dataset.theme === theme &&
    (pending === theme || (!pending && root.style.colorScheme === theme));
  if (settled) {
    if (colorsChanged) swapThemeAttribute(root);
    return;
  }
  const current = root.dataset.theme;
  if (current && current !== theme && canCrossfade(root)) {
    const release = holdTransitions(root);
    root.ownerDocument.startViewTransition(() => {
      swapThemeAttribute(root);
      release();
    });
    return;
  }
  swapThemeAttribute(root);
}

export function applyThemeAttribute(
  theme: ResolvedTheme,
  root: HTMLElement = document.documentElement,
): void {
  requestTheme(theme, root, false);
}

export function applyTheme(
  theme: ResolvedTheme,
  colors: ThemeColors,
  root: HTMLElement = document.documentElement,
): void {
  const colorsChanged = requestedColors.get(root) !== colors;
  requestedColors.set(root, colors);
  requestTheme(theme, root, colorsChanged);
}

export function resetThemeState(): void {
  theme.reset();
  palette.reset();
  resetCustomThemes();
  setSystemPrefersDark(false);
  if (typeof document === "undefined") return;
  requestedThemes.delete(document.documentElement);
  requestedColors.delete(document.documentElement);
}

export { setSystemPrefersDark };
