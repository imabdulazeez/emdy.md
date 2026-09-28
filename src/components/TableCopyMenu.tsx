import { Portal } from "@solidjs/web";
import { createSignal, createUniqueId, For, onSettled, Show, untrack } from "solid-js";
import { COPY_FEEDBACK_MS, copyText } from "~/lib/clipboard";
import {
  serializeTable,
  TABLE_COPY_FORMATS,
  TABLE_COPY_LABEL,
  type TableCopyFormat,
  type TableCopyFormatOption,
  type TableCopyRequest,
} from "~/lib/table-clipboard";
import { Icon, type IconName } from "./icons";
import { MENU_MARGIN } from "./ui/context-menu";
import "./table-copy.css";

export const FORMAT_ICONS: Record<TableCopyFormat, IconName> = {
  markdown: "file",
  csv: "table",
};

export const COPY_FAILED_MESSAGE = "Couldn't copy the table. The browser blocked clipboard access.";

/** Gap between the anchor and the menu. */
const MENU_GAP = 4;

export interface AnchorRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Places the menu below its anchor, right edges aligned (the trigger sits at a
 * table's right edge), flipping above when there is no room below and keeping
 * a margin from every viewport edge.
 */
export function placeTableMenu(
  anchor: AnchorRect,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  align: "start" | "end" = "end",
): { x: number; y: number } {
  const preferredX = align === "end" ? anchor.right - size.width : anchor.left;
  const maxX = viewport.width - size.width - MENU_MARGIN;
  const x = Math.max(MENU_MARGIN, Math.min(preferredX, maxX));
  const below = anchor.bottom + MENU_GAP;
  const above = anchor.top - MENU_GAP - size.height;
  const y =
    below + size.height <= viewport.height - MENU_MARGIN
      ? below
      : above >= MENU_MARGIN
        ? above
        : Math.max(MENU_MARGIN, viewport.height - size.height - MENU_MARGIN);
  return { x, y };
}

function restoreFocus(request: TableCopyRequest): void {
  if (request.restoreFocus) request.restoreFocus();
  else if (request.anchor.isConnected) request.anchor.focus();
}

/**
 * Menu state for one surface. Asking again from the anchor that opened the
 * menu closes it, as a menu button does.
 */
export function createTableCopyMenu() {
  const [request, setRequest] = createSignal<TableCopyRequest | null>(null);
  const open = (next: TableCopyRequest) => {
    const current = untrack(request);
    if (current && current.anchor === next.anchor) {
      setRequest(null);
      restoreFocus(current);
      return;
    }
    setRequest(next);
  };
  const close = () => {
    setRequest(null);
  };
  return { request, open, close };
}

type CopyStatus = { format: TableCopyFormat; copied: boolean } | null;

interface PanelProps {
  request: TableCopyRequest;
  copy: (text: string) => Promise<boolean>;
  announce: (message: string) => void;
  onClose: () => void;
}

function MenuPanel(props: PanelProps) {
  const id = createUniqueId();
  const [status, setStatus] = createSignal<CopyStatus>(null);
  let panel: HTMLDivElement | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const items = () =>
    panel ? Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitem"]')) : [];

  const focusItem = (index: number) => {
    const all = items();
    if (all.length === 0) return;
    all[((index % all.length) + all.length) % all.length].focus();
  };

  const close = (returnFocus: boolean) => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    props.onClose();
    if (returnFocus) restoreFocus(props.request);
    else props.request.onDismiss?.();
  };

  const choose = async (format: TableCopyFormatOption) => {
    clearTimeout(timer);
    const copied = await props.copy(serializeTable(props.request.grid, format.id));
    if (closed) return;
    setStatus({ format: format.id, copied });
    props.announce(copied ? `Copied table as ${format.name}` : COPY_FAILED_MESSAGE);
    if (!copied) return;
    timer = setTimeout(() => {
      const focusInside = !!panel && panel.contains(document.activeElement);
      close(focusInside);
    }, COPY_FEEDBACK_MS);
  };

  const itemState = (format: TableCopyFormat) => {
    const current = status();
    if (!current || current.format !== format) return "idle";
    return current.copied ? "copied" : "failed";
  };

  onSettled(() => {
    if (!panel) return;
    const { anchor, point } = props.request;
    const rect = panel.getBoundingClientRect();
    const place = placeTableMenu(
      point
        ? { left: point.x, right: point.x, top: point.y, bottom: point.y }
        : anchor.getBoundingClientRect(),
      { width: rect.width, height: rect.height },
      { width: window.innerWidth, height: window.innerHeight },
      point ? "start" : "end",
    );
    panel.style.left = `${place.x}px`;
    panel.style.top = `${place.y}px`;
    panel.style.visibility = "visible";
    props.announce("");
    focusItem(0);

    const isMenuButton = anchor.hasAttribute("aria-haspopup");
    if (isMenuButton) {
      anchor.setAttribute("aria-expanded", "true");
      anchor.setAttribute("aria-controls", id);
    }

    // A menu opened at a point (the caret) has no button to toggle it, so a click
    // anywhere else, even inside the element it was opened from, dismisses it.
    const toggledByAnchor = !point;
    const outside = (target: EventTarget | null) =>
      !(target instanceof Node) ||
      !(panel?.contains(target) || (toggledByAnchor && anchor.contains(target)));
    const onPointerDown = (event: PointerEvent) => {
      if (outside(event.target)) close(false);
    };
    const onScroll = (event: Event) => {
      if (panel && !panel.contains(event.target as Node)) close(false);
    };
    const onBlur = () => close(false);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onBlur);
    window.addEventListener("blur", onBlur);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onBlur);
      window.removeEventListener("blur", onBlur);
      if (isMenuButton) {
        anchor.setAttribute("aria-expanded", "false");
        anchor.removeAttribute("aria-controls");
      }
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
      case "Tab":
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      default:
        break;
    }
  };

  return (
    <div
      ref={(el) => (panel = el)}
      id={id}
      role="menu"
      aria-label={TABLE_COPY_LABEL}
      data-table-copy-menu=""
      class="popover invisible fixed z-60 min-w-48 p-1 text-[13px] text-text outline-none"
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      <For each={TABLE_COPY_FORMATS}>
        {(format) => (
          <button
            type="button"
            role="menuitem"
            tabindex={-1}
            class="menu-item"
            data-status={itemState(format.id)}
            onClick={() => void choose(format)}
          >
            <span class="flex size-4 shrink-0 items-center justify-center text-text-faint">
              <Show
                when={itemState(format.id) === "copied"}
                fallback={<Icon name={FORMAT_ICONS[format.id]} size={14} />}
              >
                <Icon name="check" size={14} class="text-accent" />
              </Show>
            </span>
            <span class="flex-1">
              {itemState(format.id) === "copied"
                ? "Copied"
                : itemState(format.id) === "failed"
                  ? "Couldn't copy"
                  : format.label}
            </span>
          </button>
        )}
      </For>
      <Show when={status()?.copied === false}>
        <p class="max-w-56 px-2 pt-1 pb-1.5 text-[12px] text-text-muted">
          The browser blocked clipboard access.
        </p>
      </Show>
    </div>
  );
}

export interface TableCopyMenuProps {
  request: TableCopyRequest | null;
  onClose: () => void;
  /** Clipboard writer; resolves false when the write fails. */
  copy?: (text: string) => Promise<boolean>;
}

/**
 * "Copy as Markdown / Copy as CSV" menu for a table. The item that was chosen
 * reads "Copied" for a moment before the menu closes; a failed write keeps the
 * menu open and says why. A polite live region repeats either outcome for
 * screen readers, since the menu may already be gone when it is read.
 */
export default function TableCopyMenu(props: TableCopyMenuProps) {
  const [message, setMessage] = createSignal("");
  return (
    <>
      <div role="status" aria-live="polite" class="sr-only" data-testid="table-copy-status">
        {message()}
      </div>
      <Show when={props.request} keyed>
        {(request) => (
          <Portal>
            <MenuPanel
              request={request}
              copy={props.copy ?? copyText}
              announce={setMessage}
              onClose={props.onClose}
            />
          </Portal>
        )}
      </Show>
    </>
  );
}
