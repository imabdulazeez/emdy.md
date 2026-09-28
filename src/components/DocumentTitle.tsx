import { createSignal, createUniqueId, For, Show } from "solid-js";
import { dateSuggestions, type DateSuggestion } from "~/lib/dates";
import { mentionQuery } from "~/lib/mention-query";
import { cn } from "~/lib/utils";
import { setTitle, title, titleIsAutomatic } from "~/state/document";

interface DateMenu {
  from: number;
  to: number;
  options: DateSuggestion[];
}

const CARET_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);

export default function DocumentTitle() {
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal("");
  const [menu, setMenu] = createSignal<DateMenu | null>(null);
  const [active, setActive] = createSignal(0);
  const listId = createUniqueId();
  let input: HTMLInputElement | undefined;
  let cancelled = false;

  const closeMenu = () => setMenu(null);

  const refreshMenu = (field: HTMLInputElement) => {
    const caret = field.selectionStart ?? field.value.length;
    const found = field.selectionEnd === caret ? mentionQuery(field.value.slice(0, caret)) : null;
    const options = found ? dateSuggestions(found.query, new Date()) : [];
    setMenu(found && options.length > 0 ? { from: found.offset, to: caret, options } : null);
    setActive(0);
  };

  const choose = (index: number) => {
    const current = menu();
    const option = current?.options[index];
    if (!current || !option || !input) return;
    const value = input.value;
    const next = value.slice(0, current.from) + option.value + value.slice(current.to);
    const caret = current.from + option.value.length;
    input.value = next;
    input.setSelectionRange(caret, caret);
    setDraft(next);
    closeMenu();
  };

  const beginEdit = () => {
    setDraft(title());
    cancelled = false;
    closeMenu();
    setEditing(true);
    queueMicrotask(() => {
      input?.focus();
      input?.select();
    });
  };

  const commit = () => {
    closeMenu();
    if (!editing()) return;
    if (!cancelled) setTitle(draft());
    setEditing(false);
  };

  const cancel = () => {
    cancelled = true;
    closeMenu();
    setEditing(false);
  };

  const onMenuKey = (event: KeyboardEvent, current: DateMenu): boolean => {
    const count = current.options.length;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => (index + step + count) % count);
    } else if (event.key === "Enter" || event.key === "Tab") {
      choose(active());
    } else if (event.key === "Escape") {
      event.stopPropagation();
      closeMenu();
    } else {
      if (CARET_KEYS.has(event.key)) closeMenu();
      return false;
    }
    event.preventDefault();
    return true;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing) return;
    const current = menu();
    if (current && onMenuKey(event, current)) return;
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }
  };

  return (
    <div class="relative -ml-1.5 flex min-w-0 items-center">
      <Show
        when={editing()}
        fallback={
          <button
            type="button"
            class="h-7 max-w-full truncate rounded-md px-1.5 text-[13px] text-text transition-colors duration-100 hover:bg-hover"
            aria-label={`Document title: ${title()}. Click to rename`}
            title={
              titleIsAutomatic()
                ? "Title follows the first line. Click to rename"
                : "Rename document"
            }
            onClick={() => beginEdit()}
          >
            {title()}
          </button>
        }
      >
        <input
          ref={(el) => (input = el)}
          type="text"
          aria-label="Document title"
          aria-autocomplete="list"
          aria-controls={menu() ? listId : undefined}
          aria-activedescendant={menu() ? `${listId}-${active()}` : undefined}
          placeholder="Blank uses the first line"
          class="h-7 w-[28ch] max-w-full rounded-md bg-surface-raised px-1.5 text-[13px] text-text outline-none ring-2 ring-accent"
          value={draft()}
          onInput={(event) => {
            setDraft(event.currentTarget.value);
            refreshMenu(event.currentTarget);
          }}
          onKeyDown={onKeyDown}
          onBlur={commit}
        />
        <Show when={menu()}>
          {(current) => (
            <ul
              id={listId}
              role="listbox"
              aria-label="Dates"
              class="popover absolute top-full left-0 z-50 mt-1.5 min-w-56 p-1 text-[13px]"
            >
              <For each={current().options}>
                {(option, index) => (
                  <li
                    id={`${listId}-${index()}`}
                    role="option"
                    aria-selected={index() === active() ? "true" : "false"}
                    class={cn(
                      "menu-item cursor-default justify-between gap-6",
                      index() === active() && "bg-surface-raised text-text",
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(index())}
                  >
                    <span>{option.label}</span>
                    <span class="font-mono text-[12px] text-text-faint">{option.value}</span>
                  </li>
                )}
              </For>
            </ul>
          )}
        </Show>
      </Show>
    </div>
  );
}
