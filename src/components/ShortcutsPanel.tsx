import { createEffect, For, onCleanup, Show } from "solid-js";
import { trapTabKey } from "~/lib/focus-trap";
import {
  formatShortcut,
  isMacPlatform,
  keysFor,
  SHORTCUT_GROUPS,
  SHORTCUTS,
} from "~/lib/shortcuts";
import { setShortcutsOpen, shortcutsOpen } from "~/state/ui";
import { Icon } from "./icons";

export default function ShortcutsPanel() {
  let dialog: HTMLDivElement | undefined;
  let closeButton: HTMLButtonElement | undefined;
  let previouslyFocused: HTMLElement | null = null;
  const mac = () => isMacPlatform();

  const close = () => setShortcutsOpen(false);

  createEffect(shortcutsOpen, (open) => {
    if (open) {
      previouslyFocused =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      queueMicrotask(() => closeButton?.focus());
    } else if (previouslyFocused) {
      const target = previouslyFocused;
      previouslyFocused = null;
      queueMicrotask(() => {
        const active = document.activeElement;
        if (!active || active === document.body || dialog?.contains(active)) target.focus();
      });
    }
  });

  onCleanup(() => {
    previouslyFocused = null;
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

  return (
    <Show when={shortcutsOpen()}>
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
          aria-labelledby="shortcuts-title"
          class="popover scrollbar-quiet max-h-full w-full max-w-4xl overflow-y-auto rounded-[14px] text-[13px] text-text"
          onKeyDown={onKeyDown}
        >
          <div class="flex items-center justify-between px-5 pt-4 pb-2">
            <h2 id="shortcuts-title" class="text-[14px] font-bold">
              Keyboard shortcuts
            </h2>
            <button
              ref={(el) => (closeButton = el)}
              type="button"
              class="icon-button"
              aria-label="Close shortcuts"
              onClick={close}
            >
              <Icon name="close" size={15} />
            </button>
          </div>
          <div class="grid gap-x-8 gap-y-5 px-5 pt-2 pb-5 sm:grid-cols-2 lg:grid-cols-3">
            <For each={SHORTCUT_GROUPS}>
              {(group) => (
                <section aria-labelledby={`shortcuts-group-${group}`}>
                  <h3 id={`shortcuts-group-${group}`} class="mb-2 text-[12px] text-text-faint">
                    {group}
                  </h3>
                  <dl class="flex flex-col gap-1.5">
                    <For each={SHORTCUTS.filter((shortcut) => shortcut.group === group)}>
                      {(shortcut) => (
                        <div class="flex items-center justify-between gap-3">
                          <dt class="text-text-muted">{shortcut.label}</dt>
                          <dd>
                            <kbd>{formatShortcut(keysFor(shortcut), mac())}</kbd>
                          </dd>
                        </div>
                      )}
                    </For>
                  </dl>
                </section>
              )}
            </For>
          </div>
        </div>
      </div>
    </Show>
  );
}
