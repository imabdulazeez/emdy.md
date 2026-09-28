import { Portal } from "@solidjs/web";
import { For, onSettled, Show } from "solid-js";
import { isMacPlatform, matchesShortcut, shortcutKeys } from "~/lib/shortcuts";
import { cn } from "~/lib/utils";
import { Icon, type IconName } from "../icons";

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: IconName;
  danger?: boolean;
  separated?: boolean;
  onSelect: () => void;
}

export interface ContextMenuPoint {
  x: number;
  y: number;
}

export interface ContextMenuState extends ContextMenuPoint {
  label: string;
  items: readonly ContextMenuItem[];
  anchor: HTMLElement | null;
}

export interface ContextMenuProps {
  state: ContextMenuState | null;
  onClose: () => void;
  class?: string;
}

export const MENU_MARGIN = 8;

export function anchorPoint(anchor: Element): ContextMenuPoint {
  const rect = anchor.getBoundingClientRect();
  return { x: rect.left + MENU_MARGIN, y: rect.bottom };
}

export function menuPoint(
  event: MouseEvent | KeyboardEvent,
  anchor: Element | null,
): ContextMenuPoint {
  const fromKeyboard =
    !(event instanceof MouseEvent) || (event.clientX === 0 && event.clientY === 0);
  if (fromKeyboard && anchor) return anchorPoint(anchor);
  return event instanceof MouseEvent ? { x: event.clientX, y: event.clientY } : { x: 0, y: 0 };
}

/** The Menu key, or the registered context-menu shortcut (Shift+F10). */
export function isContextMenuKey(event: KeyboardEvent, mac = isMacPlatform()): boolean {
  return event.key === "ContextMenu" || matchesShortcut(event, shortcutKeys("context-menu"), mac);
}

export function placeMenu(
  point: ContextMenuPoint,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): ContextMenuPoint {
  const maxX = viewport.width - size.width - MENU_MARGIN;
  const maxY = viewport.height - size.height - MENU_MARGIN;
  const x = point.x > maxX ? Math.max(MENU_MARGIN, maxX) : point.x;
  const flipped = point.y - size.height;
  const y =
    point.y <= maxY ? point.y : flipped >= MENU_MARGIN ? flipped : Math.max(MENU_MARGIN, maxY);
  return { x, y };
}

function MenuPanel(props: { state: ContextMenuState; onClose: () => void; class?: string }) {
  let panel: HTMLDivElement | undefined;

  const items = () =>
    panel ? Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitem"]')) : [];

  const focusItem = (index: number) => {
    const all = items();
    if (all.length === 0) return;
    all[((index % all.length) + all.length) % all.length].focus();
  };

  const dismiss = (restoreFocus: boolean) => {
    const anchor = props.state.anchor;
    props.onClose();
    if (restoreFocus && anchor?.isConnected) anchor.focus();
  };

  onSettled(() => {
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const place = placeMenu(
      props.state,
      { width: rect.width, height: rect.height },
      { width: window.innerWidth, height: window.innerHeight },
    );
    panel.style.left = `${place.x}px`;
    panel.style.top = `${place.y}px`;
    panel.style.visibility = "visible";
    focusItem(0);

    const onPointerDown = (event: PointerEvent) => {
      if (panel && !panel.contains(event.target as Node)) props.onClose();
    };
    const onScroll = (event: Event) => {
      if (panel && !panel.contains(event.target as Node)) props.onClose();
    };
    const onBlur = () => props.onClose();
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onBlur);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onBlur);
      window.removeEventListener("blur", onBlur);
    };
  });

  const onKeyDown = (event: KeyboardEvent) => {
    const current = items().indexOf(document.activeElement as HTMLElement);
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
        dismiss(true);
        break;
      case "Tab":
        event.preventDefault();
        dismiss(true);
        break;
      default:
        break;
    }
  };

  return (
    <div
      ref={(el) => (panel = el)}
      role="menu"
      aria-label={props.state.label}
      data-context-menu=""
      class={cn(
        "popover invisible fixed z-60 min-w-48 p-1 text-[13px] text-text outline-none",
        props.class,
      )}
      style={{ left: `${props.state.x}px`, top: `${props.state.y}px` }}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      <For each={props.state.items}>
        {(item) => (
          <>
            <Show when={item.separated}>
              <div role="separator" class="mx-1 my-1 h-px bg-border" />
            </Show>
            <button
              type="button"
              role="menuitem"
              tabindex={-1}
              data-danger={item.danger ? "true" : undefined}
              class="menu-item"
              onClick={() => {
                dismiss(true);
                item.onSelect();
              }}
            >
              <span class="flex size-4 shrink-0 items-center justify-center text-text-faint in-data-[danger=true]:text-danger">
                <Show when={item.icon}>{(icon) => <Icon name={icon()} size={14} />}</Show>
              </span>
              <span class="flex-1">{item.label}</span>
            </button>
          </>
        )}
      </For>
    </div>
  );
}

export function ContextMenu(props: ContextMenuProps) {
  return (
    <Show when={props.state} keyed>
      {(state) => (
        <Portal>
          <MenuPanel state={state} onClose={props.onClose} class={props.class} />
        </Portal>
      )}
    </Show>
  );
}
