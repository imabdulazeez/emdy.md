import { createSignal, createUniqueId, For, onSettled, Show } from "solid-js";
import { ariaKeyShortcuts, formatShortcut, isMacPlatform } from "~/lib/shortcuts";
import { cn } from "~/lib/utils";
import { Icon, type IconName } from "./icons";

export interface ToolbarMenuItem {
  id: string;
  label: string;
  icon?: IconName;
  keys?: string;
  checked?: () => boolean;
  onSelect: () => void;
}

export interface ToolbarMenuProps {
  label: string;
  icon: IconName;
  text?: string;
  title?: string;
  active?: boolean;
  disabled?: boolean;
  radio?: boolean;
  variant?: "icon" | "label";
  triggerLabel?: string;
  align?: "start" | "end";
  class?: string;
  menuClass?: string;
  items: readonly ToolbarMenuItem[];
}

const ITEM_SELECTOR = '[role="menuitem"], [role="menuitemradio"]';

export default function ToolbarMenu(props: ToolbarMenuProps) {
  const [open, setOpen] = createSignal(false);
  const menuId = createUniqueId();
  const labelled = () => props.variant === "label";
  const mac = isMacPlatform();
  let root: HTMLDivElement | undefined;
  let trigger: HTMLButtonElement | undefined;
  let list: HTMLDivElement | undefined;

  const items = () => (list ? Array.from(list.querySelectorAll<HTMLElement>(ITEM_SELECTOR)) : []);

  const focusItem = (index: number) => {
    const all = items();
    if (all.length === 0) return;
    all[((index % all.length) + all.length) % all.length].focus();
  };

  const openMenu = (focusIndex: number) => {
    setOpen(true);
    onSettled(() => focusItem(focusIndex));
  };

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) trigger?.focus();
  };

  onSettled(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (open() && root && !root.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  });

  const onTriggerKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openMenu(0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(-1);
    } else if (event.key === "Escape" && open()) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent) => {
    const all = items();
    const current = all.indexOf(document.activeElement as HTMLElement);
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusItem(current + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusItem(current - 1);
        break;
      case "Home":
        event.preventDefault();
        focusItem(0);
        break;
      case "End":
        event.preventDefault();
        focusItem(-1);
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  };

  const onFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget;
    if (next instanceof Node && root && !root.contains(next)) setOpen(false);
  };

  return (
    <div ref={(el) => (root = el)} class={cn("relative", props.class)} onFocusOut={onFocusOut}>
      <button
        ref={(el) => (trigger = el)}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open() ? "true" : "false"}
        aria-controls={open() ? menuId : undefined}
        aria-label={props.triggerLabel ?? props.label}
        title={props.title ?? props.label}
        disabled={props.disabled}
        data-active={props.active ? "true" : "false"}
        class={cn(
          "icon-button",
          labelled()
            ? "gap-1.5 rounded-lg bg-surface-raised px-2 hover:bg-hover-strong sm:px-2.5"
            : "gap-0.5 px-1",
        )}
        onClick={() => (open() ? close() : openMenu(0))}
        onKeyDown={onTriggerKeyDown}
      >
        <Show
          when={labelled()}
          fallback={
            <Show when={props.text} fallback={<Icon name={props.icon} size={15} />}>
              <span class="min-w-4 text-[11.5px] font-bold tabular-nums">{props.text}</span>
            </Show>
          }
        >
          <Icon name={props.icon} size={14} />
          <span class="hidden text-[12px] sm:inline">{props.text}</span>
        </Show>
        <Icon name="chevron-down" size={10} class="text-text-faint" />
      </button>
      <Show when={open()}>
        <div
          ref={(el) => (list = el)}
          id={menuId}
          role="menu"
          aria-label={props.label}
          class={cn(
            "popover absolute top-full z-40 mt-1.5 min-w-52 p-1 text-[13px] text-text",
            props.align === "end" ? "right-0" : "left-0",
            props.menuClass,
          )}
          onKeyDown={onMenuKeyDown}
        >
          <For each={props.items}>
            {(item) => {
              const shortcut = item.keys ? formatShortcut(item.keys, mac) : null;
              return (
                <button
                  type="button"
                  role={props.radio ? "menuitemradio" : "menuitem"}
                  aria-checked={props.radio ? (item.checked?.() ? "true" : "false") : undefined}
                  aria-keyshortcuts={item.keys ? ariaKeyShortcuts(item.keys, mac) : undefined}
                  tabindex={-1}
                  class="menu-item"
                  onClick={() => {
                    item.onSelect();
                    close();
                  }}
                >
                  <span class="flex size-4 shrink-0 items-center justify-center text-text-faint">
                    <Show
                      when={props.radio}
                      fallback={
                        <Show when={item.icon}>{(icon) => <Icon name={icon()} size={14} />}</Show>
                      }
                    >
                      <Show when={item.checked?.()}>
                        <Icon name="check" size={14} class="text-accent" />
                      </Show>
                    </Show>
                  </span>
                  <span class="flex-1">{item.label}</span>
                  <Show when={shortcut}>
                    <kbd aria-hidden="true">{shortcut}</kbd>
                  </Show>
                </button>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}
