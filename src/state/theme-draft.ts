import { createSignal } from "solid-js";
import { normalizeHex } from "~/lib/themes/color";
import {
  GUIDED_ROLES,
  THEME_ROLES,
  derivePalette,
  themeBase,
  type ThemeAppearance,
  type ThemeColors,
  type ThemeDefinition,
  type ThemeRole,
} from "~/lib/themes/palettes";
import {
  THEME_NAME_MAX,
  isCustomTheme,
  makeCustomThemeId,
  peekCustomThemes,
  saveCustomTheme,
} from "./custom-themes";
import { activeTheme, resolvedTheme, selectTheme } from "./theme";

export interface ThemeDraft {
  editingId: string | null;
  name: string;
  light: ThemeColors;
  dark: ThemeColors;
  appearance: ThemeAppearance;
  advanced: boolean;
}

export interface BeginDraftOptions {
  source: ThemeDefinition;
  editing?: boolean;
  name?: string;
  appearance?: ThemeAppearance;
}

const [themeDraft, setThemeDraftSignal] = createSignal<ThemeDraft | null>(null);
let current: ThemeDraft | null = null;

export { themeDraft };

function write(next: ThemeDraft | null): void {
  current = next;
  setThemeDraftSignal(() => next);
}

function update(change: (draft: ThemeDraft) => ThemeDraft): void {
  if (current) write(change(current));
}

export function peekThemeDraft(): ThemeDraft | null {
  return current;
}

function isFineTuned(colors: ThemeColors, appearance: ThemeAppearance): boolean {
  const derived = derivePalette(themeBase(colors), appearance, colors);
  return THEME_ROLES.some((role) => derived[role] !== colors[role]);
}

export function beginThemeDraft(options: BeginDraftOptions): void {
  const { source } = options;
  write({
    editingId: options.editing ? source.id : null,
    name: (options.name ?? (options.editing ? source.name : "")).slice(0, THEME_NAME_MAX),
    light: source.light,
    dark: source.dark,
    appearance: options.appearance ?? resolvedTheme(),
    advanced:
      !!options.editing && (isFineTuned(source.light, "light") || isFineTuned(source.dark, "dark")),
  });
}

export function setDraftName(name: string): void {
  update((draft) => ({ ...draft, name: name.slice(0, THEME_NAME_MAX) }));
}

export function setDraftAppearance(appearance: ThemeAppearance): void {
  update((draft) => ({ ...draft, appearance }));
}

export function setDraftAdvanced(advanced: boolean): void {
  update((draft) => ({ ...draft, advanced }));
}

export function isGuidedRole(role: ThemeRole): boolean {
  return (GUIDED_ROLES as readonly ThemeRole[]).includes(role);
}

export function setDraftColor(role: ThemeRole, value: string): boolean {
  const color = normalizeHex(value);
  if (!color) return false;
  update((draft) => {
    const colors = draft[draft.appearance];
    const next =
      !draft.advanced && isGuidedRole(role)
        ? derivePalette({ ...themeBase(colors), [role]: color }, draft.appearance, colors)
        : { ...colors, [role]: color };
    return { ...draft, [draft.appearance]: next };
  });
  return true;
}

export function draftName(draft: ThemeDraft): string {
  return draft.name.trim();
}

export function commitThemeDraft(): ThemeDefinition | null {
  const draft = current;
  if (!draft) return null;
  const name = draftName(draft);
  if (!name) return null;
  const custom = peekCustomThemes();
  const id =
    draft.editingId && custom.some((theme) => theme.id === draft.editingId)
      ? draft.editingId
      : makeCustomThemeId(
          name,
          custom.map((theme) => theme.id),
        );
  const saved: ThemeDefinition = { id, name, light: draft.light, dark: draft.dark };
  if (!isCustomTheme(saved)) return null;
  saveCustomTheme(saved);
  selectTheme(id);
  write(null);
  return saved;
}

export function discardThemeDraft(): void {
  if (current) write(null);
}

export function displayedAppearance(): ThemeAppearance {
  return themeDraft()?.appearance ?? resolvedTheme();
}

export function displayedColors(): ThemeColors {
  const draft = themeDraft();
  if (draft) return draft[draft.appearance];
  return activeTheme()[resolvedTheme()];
}

export function resetThemeDraft(): void {
  write(null);
}
