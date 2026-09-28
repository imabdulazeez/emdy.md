import { For } from "solid-js";
import {
  THEME_LABELS,
  THEME_PREFERENCES,
  setThemePreference,
  themePreference,
  type ThemePreference,
} from "~/state/theme";
import { Icon, type IconName } from "./icons";

const ICONS: Record<ThemePreference, IconName> = { light: "sun", dark: "moon", system: "monitor" };

export default function ThemeToggle() {
  return (
    <div role="group" aria-label="Theme" class="segment-track">
      <For each={THEME_PREFERENCES}>
        {(preference) => (
          <button
            type="button"
            class="segment w-7"
            aria-pressed={themePreference() === preference ? "true" : "false"}
            aria-label={`${THEME_LABELS[preference]} theme`}
            title={`${THEME_LABELS[preference]} theme`}
            onClick={() => setThemePreference(preference)}
          >
            <Icon name={ICONS[preference]} size={14} />
          </button>
        )}
      </For>
    </div>
  );
}
