import { createUniqueId, For, onSettled, Show, type Accessor } from "solid-js";
import {
  GUIDED_ROLES,
  ROLE_GROUPS,
  ROLE_LABELS,
  THEME_APPEARANCES,
  type ThemeRole,
} from "~/lib/themes/palettes";
import { THEME_NAME_MAX } from "~/state/custom-themes";
import {
  draftName,
  setDraftAdvanced,
  setDraftAppearance,
  setDraftColor,
  setDraftName,
  type ThemeDraft,
} from "~/state/theme-draft";
import { THEME_LABELS } from "~/state/theme";
import ColorField from "./ColorField";
import ThemeSwatch from "./ThemeSwatch";

export interface ThemeEditorProps {
  draft: Accessor<ThemeDraft>;
  onSave: () => void;
  onCancel: () => void;
}

export default function ThemeEditor(props: ThemeEditorProps) {
  const headingId = createUniqueId();
  const nameId = createUniqueId();
  const paletteId = createUniqueId();
  const advancedId = createUniqueId();
  let nameInput: HTMLInputElement | undefined;

  onSettled(() => {
    nameInput?.focus();
  });

  const colors = () => props.draft()[props.draft().appearance];
  const field = (role: ThemeRole) => (
    <ColorField
      label={ROLE_LABELS[role]}
      value={colors()[role]}
      onChange={(value) => setDraftColor(role, value)}
    />
  );

  return (
    <form
      class="flex flex-col gap-5 rounded-[12px] border border-border p-4"
      aria-labelledby={headingId}
      data-testid="theme-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (draftName(props.draft())) props.onSave();
      }}
    >
      <div class="flex items-center justify-between gap-4">
        <h3 id={headingId} class="font-bold text-text">
          {props.draft().editingId ? "Edit theme" : "New theme"}
        </h3>
        <div class="w-32">
          <ThemeSwatch theme={props.draft()} />
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <label for={nameId} class="text-[12px] text-text-faint">
          Name
        </label>
        <input
          ref={(el) => (nameInput = el)}
          id={nameId}
          type="text"
          autocomplete="off"
          maxlength={THEME_NAME_MAX}
          placeholder="My theme"
          class="h-8 rounded-md bg-surface-raised px-2.5 text-text placeholder:text-text-faint focus-visible:outline-2 focus-visible:outline-accent"
          value={props.draft().name}
          onInput={(event) => setDraftName(event.currentTarget.value)}
        />
      </div>

      <div class="flex items-center justify-between gap-4">
        <span id={paletteId} class="text-text">
          Palette
        </span>
        <div role="radiogroup" aria-labelledby={paletteId} class="segment-track">
          <For each={THEME_APPEARANCES}>
            {(appearance) => (
              <button
                type="button"
                role="radio"
                class="segment px-2.5 text-[12px]"
                aria-checked={props.draft().appearance === appearance ? "true" : "false"}
                onClick={() => setDraftAppearance(appearance)}
              >
                {THEME_LABELS[appearance]}
              </button>
            )}
          </For>
        </div>
      </div>

      <Show
        when={props.draft().advanced}
        fallback={
          <div class="flex flex-col gap-1" data-testid="theme-guided-colors">
            <For each={GUIDED_ROLES}>{(role) => field(role)}</For>
          </div>
        }
      >
        <div class="flex flex-col gap-4" data-testid="theme-all-colors">
          <For each={ROLE_GROUPS}>
            {(group) => (
              <fieldset class="flex flex-col gap-1">
                <legend class="mb-1 text-[12px] text-text-faint">{group.label}</legend>
                <For each={group.roles}>{(role) => field(role)}</For>
              </fieldset>
            )}
          </For>
        </div>
      </Show>

      <div class="flex items-center justify-between gap-4">
        <span id={advancedId} class="text-text">
          Fine-tune every colour
        </span>
        <button
          type="button"
          role="switch"
          aria-labelledby={advancedId}
          aria-checked={props.draft().advanced ? "true" : "false"}
          class="group relative h-5 w-9 shrink-0 rounded-full bg-hover-strong transition-colors duration-150 aria-checked:bg-accent"
          onClick={() => setDraftAdvanced(!props.draft().advanced)}
        >
          <span
            aria-hidden="true"
            class="absolute top-0.5 left-0.5 size-4 rounded-full bg-surface shadow-lift transition-transform duration-150 group-aria-checked:translate-x-4"
          />
        </button>
      </div>

      <div class="flex justify-end gap-2 border-t border-border pt-4">
        <button type="button" class="button-quiet" onClick={() => props.onCancel()}>
          Cancel
        </button>
        <button type="submit" class="button-primary" disabled={!draftName(props.draft())}>
          Save theme
        </button>
      </div>
    </form>
  );
}
