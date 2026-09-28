import { createSignal, createUniqueId, For, onSettled, Show } from "solid-js";
import { BUILT_IN_THEMES, type ThemeDefinition } from "~/lib/themes/palettes";
import { customThemes } from "~/state/custom-themes";
import { activeTheme, removeCustomTheme, selectTheme } from "~/state/theme";
import {
  beginThemeDraft,
  commitThemeDraft,
  discardThemeDraft,
  themeDraft,
} from "~/state/theme-draft";
import { Icon } from "./icons";
import ThemeEditor from "./ThemeEditor";
import ThemeSwatch from "./ThemeSwatch";

export interface ThemeLibraryProps {
  label: string;
}

export default function ThemeLibrary(props: ThemeLibraryProps) {
  const labelId = createUniqueId();
  const [confirming, setConfirming] = createSignal<string | null>(null);
  let root: HTMLDivElement | undefined;

  onSettled(() => () => discardThemeDraft());

  const focusLater = (selector: string) => {
    queueMicrotask(() => root?.querySelector<HTMLElement>(selector)?.focus());
  };

  const isCustom = (theme: ThemeDefinition) =>
    customThemes().some((entry) => entry.id === theme.id);

  const card = (theme: ThemeDefinition) => (
    <div class="flex min-w-0 flex-col gap-1.5" data-theme-card={theme.id}>
      <button
        type="button"
        role="radio"
        aria-checked={activeTheme().id === theme.id ? "true" : "false"}
        aria-label={theme.name}
        class="rounded-[11px] p-1 ring-accent transition-shadow duration-150 hover:ring-1 hover:ring-border-strong aria-checked:ring-2 aria-checked:hover:ring-accent"
        onClick={() => selectTheme(theme.id)}
      >
        <ThemeSwatch theme={theme} />
      </button>
      <Show
        when={confirming() === theme.id}
        fallback={
          <div class="flex min-h-7 items-center gap-0.5 pl-1.5">
            <span class="min-w-0 flex-1 truncate text-text">{theme.name}</span>
            <button
              type="button"
              class="icon-button"
              aria-label={`Duplicate ${theme.name}`}
              title="Duplicate"
              onClick={() => beginThemeDraft({ source: theme, name: `${theme.name} copy` })}
            >
              <Icon name="copy" size={14} />
            </button>
            <Show when={isCustom(theme)}>
              <button
                type="button"
                class="icon-button"
                aria-label={`Edit ${theme.name}`}
                title="Edit"
                onClick={() => beginThemeDraft({ source: theme, editing: true })}
              >
                <Icon name="pencil" size={14} />
              </button>
              <button
                type="button"
                class="icon-button"
                data-delete-theme
                aria-label={`Delete ${theme.name}`}
                title="Delete"
                onClick={() => {
                  setConfirming(theme.id);
                  focusLater(`[data-theme-card="${theme.id}"] [data-confirm-delete]`);
                }}
              >
                <Icon name="trash" size={14} />
              </button>
            </Show>
          </div>
        }
      >
        <div
          role="group"
          aria-label={`Delete ${theme.name}?`}
          class="flex min-h-7 items-center gap-1 rounded-md bg-danger-soft pl-1.5 text-[12px]"
        >
          <span class="min-w-0 flex-1 truncate text-text">Delete?</span>
          <button
            type="button"
            data-confirm-delete
            class="h-7 rounded-md px-2 font-bold text-danger hover:bg-hover"
            onClick={() => {
              setConfirming(null);
              removeCustomTheme(theme.id);
            }}
          >
            Delete
          </button>
          <button
            type="button"
            class="h-7 rounded-md px-2 text-text-muted hover:bg-hover hover:text-text"
            onClick={() => {
              setConfirming(null);
              focusLater(`[data-theme-card="${theme.id}"] [data-delete-theme]`);
            }}
          >
            Keep
          </button>
        </div>
      </Show>
    </div>
  );

  return (
    <div
      ref={(el) => (root = el)}
      class="flex flex-col gap-3 py-3"
      data-preference="palette"
      data-testid="theme-library"
    >
      <div class="flex min-h-8 items-center justify-between gap-4">
        <span id={labelId} class="text-text">
          {props.label}
        </span>
        <Show when={!themeDraft()}>
          <button
            type="button"
            class="icon-button gap-1.5 px-2 text-[12px]"
            data-create-theme
            onClick={() => beginThemeDraft({ source: activeTheme(), name: "" })}
          >
            <Icon name="plus" size={14} />
            <span>Create theme</span>
          </button>
        </Show>
      </div>
      <Show
        when={themeDraft()}
        fallback={
          <div
            role="radiogroup"
            aria-labelledby={labelId}
            class="grid grid-cols-2 gap-3 sm:grid-cols-3"
          >
            <For each={[...BUILT_IN_THEMES, ...customThemes()]}>{(theme) => card(theme)}</For>
          </div>
        }
      >
        {(draft) => (
          <ThemeEditor
            draft={draft}
            onSave={() => {
              const saved = commitThemeDraft();
              if (saved) focusLater(`[data-theme-card="${saved.id}"] [role="radio"]`);
            }}
            onCancel={() => {
              discardThemeDraft();
              focusLater("[data-create-theme]");
            }}
          />
        )}
      </Show>
    </div>
  );
}
