import { For } from "solid-js";
import {
  THEME_APPEARANCES,
  THEME_ROLES,
  type ThemeColors,
  type ThemeDefinition,
} from "~/lib/themes/palettes";

export function themeStyle(colors: ThemeColors): Record<string, string> {
  return Object.fromEntries(THEME_ROLES.map((role) => [`--color-${role}`, colors[role]]));
}

export interface ThemeSwatchProps {
  theme: Pick<ThemeDefinition, "light" | "dark">;
}

export default function ThemeSwatch(props: ThemeSwatchProps) {
  return (
    <div
      aria-hidden="true"
      class="grid grid-cols-2 overflow-hidden rounded-[8px] border border-border"
      data-testid="theme-swatch"
    >
      <For each={THEME_APPEARANCES}>
        {(appearance) => (
          <div
            class="bg-canvas px-2.5 pt-2.5"
            style={themeStyle(props.theme[appearance])}
            data-appearance={appearance}
          >
            <div class="flex h-14 flex-col gap-1.5 rounded-t-[5px] border border-b-0 border-border bg-surface p-2">
              <span class="h-1.5 w-3/5 rounded-full bg-text" />
              <span class="h-1 w-full rounded-full bg-text-faint" />
              <span class="h-1 w-4/5 rounded-full bg-text-faint" />
              <span class="h-1 w-2/5 rounded-full bg-accent" />
            </div>
          </div>
        )}
      </For>
    </div>
  );
}
