import { createMemo, createSignal, For, Match, onSettled, Show, Switch, untrack } from "solid-js";
import {
  automaticDocumentIcon,
  DOCUMENT_EMOJIS,
  DOCUMENT_ICON_COLOR_CLASSES,
  DOCUMENT_ICON_COLOR_LABELS,
  DOCUMENT_ICON_COLORS,
  DOCUMENT_ICON_SWATCH_CLASSES,
  filterLucideNames,
  firstEmoji,
  isMonogramText,
  lucideLabel,
  normalizeMonogram,
  POPULAR_LUCIDE_ICONS,
  type DocumentIcon as DocumentIconData,
  type DocumentIconColor,
  type DocumentIconKind,
} from "~/lib/document-icon";
import { trapTabKey } from "~/lib/focus-trap";
import { cn } from "~/lib/utils";
import { loadLucideIcons, lucideFailed, lucideRegistry } from "~/state/lucide";
import DocumentIcon, { LucideGlyph } from "./DocumentIcon";
import { Icon } from "./icons";

export interface DocumentIconPickerProps {
  title: string;
  icon: DocumentIconData | null;
  returnFocus?: HTMLElement | null;
  onSave: (icon: DocumentIconData | null) => void;
  onClose: () => void;
}

const MODES: readonly { value: DocumentIconKind; label: string }[] = [
  { value: "lucide", label: "Icon" },
  { value: "emoji", label: "Emoji" },
  { value: "monogram", label: "Letters" },
];

const DEFAULT_LUCIDE = POPULAR_LUCIDE_ICONS[0];
const DEFAULT_EMOJI = DOCUMENT_EMOJIS[0].emoji;

const RADIO_STEPS: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

function moveRadio(event: KeyboardEvent & { currentTarget: HTMLElement }): void {
  const step = RADIO_STEPS[event.key];
  if (!step) return;
  const radios = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'));
  const index = radios.indexOf(document.activeElement as HTMLElement);
  const next = radios[(index + step + radios.length) % radios.length];
  event.preventDefault();
  next.focus();
  next.click();
}

const cell =
  "flex aspect-square items-center justify-center rounded-lg outline-none hover:bg-hover aria-pressed:bg-surface-raised aria-pressed:shadow-lift";

export default function DocumentIconPicker(props: DocumentIconPickerProps) {
  const initial = untrack(() => props.icon);
  const automatic = untrack(() => automaticDocumentIcon(props.title));
  const [mode, setMode] = createSignal<DocumentIconKind>(initial?.kind ?? "lucide");
  const [color, setColor] = createSignal<DocumentIconColor>(
    initial && initial.kind !== "emoji" ? initial.color : automatic.color,
  );
  const [iconName, setIconName] = createSignal<string>(
    initial?.kind === "lucide" ? initial.name : DEFAULT_LUCIDE,
  );
  const [emoji, setEmoji] = createSignal(initial?.kind === "emoji" ? initial.emoji : DEFAULT_EMOJI);
  const [letters, setLetters] = createSignal(
    initial?.kind === "monogram" ? initial.text : automatic.text,
  );
  const [query, setQuery] = createSignal("");
  const [pasted, setPasted] = createSignal("");

  let dialog: HTMLDivElement | undefined;
  let search: HTMLInputElement | undefined;
  const returnTo = untrack(
    () =>
      props.returnFocus ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null),
  );

  const monogram = createMemo(() => normalizeMonogram(letters()));
  const validMonogram = createMemo(() => isMonogramText(monogram()));
  const names = createMemo(() => filterLucideNames(lucideRegistry()?.names ?? [], query()));

  const draft = createMemo((): DocumentIconData => {
    switch (mode()) {
      case "lucide":
        return { kind: "lucide", name: iconName(), color: color() };
      case "emoji":
        return { kind: "emoji", emoji: emoji() };
      default:
        return {
          kind: "monogram",
          text: validMonogram() ? monogram() : automatic.text,
          color: color(),
        };
    }
  });

  const close = () => {
    props.onClose();
    if (returnTo?.isConnected) queueMicrotask(() => returnTo.focus());
  };

  const save = () => {
    if (mode() === "monogram" && !validMonogram()) return;
    props.onSave(draft());
    close();
  };

  const useAutomatic = () => {
    props.onSave(null);
    close();
  };

  const chooseMode = (next: DocumentIconKind) => {
    setMode(next);
    if (next === "lucide") void loadLucideIcons();
  };

  onSettled(() => {
    if (untrack(mode) === "lucide") void loadLucideIcons();
    const target =
      untrack(mode) === "lucide"
        ? search
        : dialog?.querySelector<HTMLElement>("[aria-checked=true]");
    target?.focus();
  });

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (dialog) trapTabKey(event, dialog);
  };

  const onInputKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      save();
    }
  };

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={(el) => (dialog = el)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-icon-title"
        class="popover flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-[14px] text-[13px] text-text"
        onKeyDown={onKeyDown}
      >
        <div class="flex items-center gap-3 px-5 pt-4 pb-3">
          <DocumentIcon icon={draft()} title={props.title} class="size-9" />
          <div class="min-w-0 flex-1">
            <h2 id="document-icon-title" class="text-[14px] font-bold">
              Document icon
            </h2>
            <p class="truncate text-[12px] text-text-faint">{props.title}</p>
          </div>
          <button type="button" class="icon-button" aria-label="Close" onClick={close}>
            <Icon name="close" size={15} />
          </button>
        </div>

        <div class="flex flex-col gap-3 px-5 pb-4">
          <div
            role="radiogroup"
            aria-label="Icon type"
            class="segment-track self-start"
            onKeyDown={moveRadio}
          >
            <For each={MODES}>
              {(option) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={mode() === option.value ? "true" : "false"}
                  tabindex={mode() === option.value ? 0 : -1}
                  class="segment px-3 text-[12px]"
                  onClick={() => chooseMode(option.value)}
                >
                  {option.label}
                </button>
              )}
            </For>
          </div>

          <Show when={mode() !== "emoji"}>
            <div
              role="radiogroup"
              aria-label="Colour"
              class="flex flex-wrap gap-1"
              onKeyDown={moveRadio}
            >
              <For each={DOCUMENT_ICON_COLORS}>
                {(value) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={color() === value ? "true" : "false"}
                    aria-label={DOCUMENT_ICON_COLOR_LABELS[value]}
                    tabindex={color() === value ? 0 : -1}
                    title={DOCUMENT_ICON_COLOR_LABELS[value]}
                    class="flex size-7 items-center justify-center rounded-full outline-none hover:bg-hover aria-checked:shadow-lift"
                    onClick={() => setColor(value)}
                  >
                    <span class={cn("size-4 rounded-full", DOCUMENT_ICON_SWATCH_CLASSES[value])} />
                  </button>
                )}
              </For>
            </div>
          </Show>

          <Switch>
            <Match when={mode() === "lucide"}>
              <input
                ref={(el) => (search = el)}
                type="search"
                aria-label="Search icons"
                placeholder="Search icons"
                value={query()}
                autocomplete="off"
                spellcheck={false}
                class="h-8 rounded-lg bg-surface-raised px-3 text-text outline-none placeholder:text-text-faint focus-visible:ring-2 focus-visible:ring-accent"
                onInput={(event) => setQuery(event.currentTarget.value)}
                onKeyDown={onInputKeyDown}
              />
              <div class="scrollbar-quiet h-56 overflow-y-auto">
                <Show
                  when={lucideRegistry()}
                  fallback={
                    <p class="py-10 text-center text-text-faint">
                      {lucideFailed() ? "Icons couldn’t be loaded." : "Loading icons…"}
                    </p>
                  }
                >
                  {(registry) => (
                    <Show
                      when={names().length > 0}
                      fallback={<p class="py-10 text-center text-text-faint">No icons match.</p>}
                    >
                      <div
                        role="group"
                        aria-label="Icons"
                        class={cn(
                          "grid grid-cols-8 gap-1 p-0.5",
                          DOCUMENT_ICON_COLOR_CLASSES[color()],
                        )}
                      >
                        <For each={names()}>
                          {(name) => (
                            <button
                              type="button"
                              aria-label={lucideLabel(name)}
                              title={lucideLabel(name)}
                              aria-pressed={iconName() === name ? "true" : "false"}
                              class={cn(cell, "p-2")}
                              onClick={() => setIconName(name)}
                              onDblClick={save}
                            >
                              <Show when={registry().icons.get(name)}>
                                {(node) => <LucideGlyph node={node()} />}
                              </Show>
                            </button>
                          )}
                        </For>
                      </div>
                    </Show>
                  )}
                </Show>
              </div>
            </Match>

            <Match when={mode() === "emoji"}>
              <div role="group" aria-label="Emoji" class="grid grid-cols-10 gap-1 p-0.5">
                <For each={DOCUMENT_EMOJIS}>
                  {(option) => (
                    <button
                      type="button"
                      aria-label={option.label}
                      title={option.label}
                      aria-pressed={emoji() === option.emoji ? "true" : "false"}
                      class={cn(cell, "text-[18px] leading-none")}
                      onClick={() => setEmoji(option.emoji)}
                      onDblClick={save}
                    >
                      {option.emoji}
                    </button>
                  )}
                </For>
              </div>
              <label class="flex flex-col gap-1.5">
                <span class="text-[12px] text-text-faint">Or paste any emoji</span>
                <input
                  value={pasted()}
                  aria-label="Custom emoji"
                  placeholder="Paste an emoji"
                  autocomplete="off"
                  class="h-8 rounded-lg bg-surface-raised px-3 text-text outline-none placeholder:text-text-faint focus-visible:ring-2 focus-visible:ring-accent"
                  onInput={(event) => {
                    const value = event.currentTarget.value;
                    setPasted(value);
                    const next = firstEmoji(value);
                    if (next) setEmoji(next);
                  }}
                  onKeyDown={onInputKeyDown}
                />
              </label>
            </Match>

            <Match when={mode() === "monogram"}>
              <div class="flex flex-col gap-1.5">
                <label for="document-icon-letters" class="text-[12px] text-text-faint">
                  Letters
                </label>
                <input
                  id="document-icon-letters"
                  value={letters()}
                  aria-describedby="document-icon-letters-hint"
                  aria-invalid={validMonogram() ? undefined : "true"}
                  autocomplete="off"
                  spellcheck={false}
                  class="h-8 rounded-lg bg-surface-raised px-3 font-mono text-text uppercase outline-none focus-visible:ring-2 focus-visible:ring-accent aria-invalid:ring-2 aria-invalid:ring-danger"
                  onInput={(event) => setLetters(event.currentTarget.value)}
                  onKeyDown={onInputKeyDown}
                />
                <span
                  id="document-icon-letters-hint"
                  class={cn("text-[12px]", validMonogram() ? "text-text-faint" : "text-danger")}
                >
                  One or two letters or numbers.
                </span>
              </div>
            </Match>
          </Switch>
        </div>

        <div class="flex items-center gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            class="button-quiet mr-auto bg-transparent px-2 text-text-muted hover:text-text"
            disabled={initial === null}
            onClick={useAutomatic}
          >
            Use automatic
          </button>
          <button type="button" class="button-quiet" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            class="button-primary"
            disabled={mode() === "monogram" && !validMonogram()}
            onClick={save}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
