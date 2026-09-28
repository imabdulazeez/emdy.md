import type { JSX } from "@solidjs/web";
import {
  createContext,
  createEffect,
  createSignal,
  omit,
  onSettled,
  Show,
  untrack,
  useContext,
} from "solid-js";
import { getFocusable, trapTabKey } from "~/lib/focus-trap";
import { matchesMediaQuery, MOBILE_MEDIA_QUERY, watchMediaQuery } from "~/lib/media";
import { ariaKeyShortcuts, isMacPlatform, shortcutKeys, shortcutTitle } from "~/lib/shortcuts";
import { cn } from "~/lib/utils";
import { Icon } from "../icons";
import "./sidebar.css";

// Adapted from solidcn's sidebar for Solid 2: no splitProps/Sheet/lucide; the
// mobile presentation is a dependency-free overlay and icons come from ~/components/icons.

export interface SidebarContextValue {
  open: () => boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  isMobile: () => boolean;
  /** True when the sidebar content is laid out at full width (open, or shown as a mobile overlay). */
  expanded: () => boolean;
}

export const SidebarContext = createContext<SidebarContextValue>();

export const useSidebar = (): SidebarContextValue => useContext(SidebarContext);

export interface SidebarProviderProps extends JSX.HTMLAttributes<HTMLDivElement> {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SidebarProvider(props: SidebarProviderProps) {
  const rest = omit(props, "defaultOpen", "open", "onOpenChange", "class", "children");
  const [internalOpen, setInternalOpen] = createSignal(untrack(() => props.defaultOpen ?? true));
  // Read synchronously so a phone's first render never lays out the desktop rail.
  const [isMobile, setIsMobile] = createSignal(matchesMediaQuery(MOBILE_MEDIA_QUERY));

  const controlled = () => props.open !== undefined;
  const open = () => (controlled() ? (props.open as boolean) : internalOpen());
  const setOpen = (next: boolean) => {
    if (!controlled()) setInternalOpen(next);
    props.onOpenChange?.(next);
  };
  const toggle = () => setOpen(!open());
  const expanded = () => open() || isMobile();

  onSettled(() => watchMediaQuery(MOBILE_MEDIA_QUERY, setIsMobile));

  return (
    <SidebarContext value={{ open, setOpen, toggle, isMobile, expanded }}>
      <div
        data-sidebar="provider"
        class={cn("flex h-dvh w-full overflow-hidden", props.class)}
        {...rest}
      >
        {props.children}
      </div>
    </SidebarContext>
  );
}

export interface SidebarProps extends JSX.HTMLAttributes<HTMLElement> {
  side?: "left" | "right";
  collapsible?: "offcanvas" | "icon" | "none";
}

export function Sidebar(props: SidebarProps) {
  const sidebar = useSidebar();
  const rest = omit(props, "side", "collapsible", "class", "children", "ref");
  const side = () => props.side ?? "left";
  const collapsible = () => props.collapsible ?? "offcanvas";
  const mobileOpen = () => sidebar.isMobile() && sidebar.open();

  let panel: HTMLDivElement | undefined;
  let previouslyFocused: HTMLElement | null = null;

  createEffect(mobileOpen, (isOpen) => {
    if (isOpen) {
      previouslyFocused =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      queueMicrotask(() => {
        if (!panel || panel.contains(document.activeElement)) return;
        (getFocusable(panel)[0] ?? panel).focus();
      });
    } else if (previouslyFocused) {
      const target = previouslyFocused;
      previouslyFocused = null;
      queueMicrotask(() => {
        if (
          !mobileOpen() &&
          (document.activeElement === document.body || panel?.contains(document.activeElement))
        ) {
          target.focus();
        }
      });
    }
  });

  const onPanelKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      sidebar.setOpen(false);
      return;
    }
    if (panel) trapTabKey(event, panel);
  };

  return (
    <Show
      when={sidebar.isMobile()}
      fallback={
        <aside
          data-sidebar="sidebar"
          data-state={sidebar.open() ? "expanded" : "collapsed"}
          data-collapsible={sidebar.open() || collapsible() === "none" ? "" : collapsible()}
          data-side={side()}
          class={cn(
            "group sidebar-root relative flex h-full shrink-0 flex-col overflow-hidden bg-canvas text-text",
            side() === "left" ? "" : "order-last",
            props.class,
          )}
          {...rest}
        >
          <div class="flex h-full w-full flex-col">{props.children}</div>
        </aside>
      }
    >
      <Show when={sidebar.open()}>
        <div
          data-sidebar="backdrop"
          class="fixed inset-0 z-40 bg-text/20"
          onClick={() => sidebar.setOpen(false)}
        />
        <div
          ref={(el) => (panel = el)}
          role="dialog"
          aria-modal="true"
          tabindex={-1}
          data-sidebar="sidebar"
          data-mobile="true"
          data-state="expanded"
          data-side={side()}
          class={cn(
            "group sidebar-mobile fixed inset-y-0 z-50 flex flex-col bg-canvas text-text shadow-[var(--shadow-pop)]",
            side() === "left" ? "left-0" : "right-0",
            props.class,
          )}
          onKeyDown={onPanelKeyDown}
          {...rest}
        >
          {props.children}
        </div>
      </Show>
    </Show>
  );
}

export function SidebarTrigger(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>) {
  const sidebar = useSidebar();
  const rest = omit(props, "class", "onClick", "children");
  const mac = isMacPlatform();
  return (
    <button
      type="button"
      data-sidebar="trigger"
      class={cn("icon-button", props.class)}
      aria-label={sidebar.open() ? "Hide sidebar" : "Show sidebar"}
      aria-expanded={sidebar.open() ? "true" : "false"}
      title={shortcutTitle("Toggle sidebar", shortcutKeys("toggle-sidebar"), mac)}
      aria-keyshortcuts={ariaKeyShortcuts(shortcutKeys("toggle-sidebar"), mac)}
      onClick={(event) => {
        sidebar.toggle();
        if (typeof props.onClick === "function") props.onClick(event);
      }}
      {...rest}
    >
      <Icon name="panel-left" size={15} />
    </button>
  );
}

export function SidebarInset(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const rest = omit(props, "class");
  return (
    <div
      data-sidebar="inset"
      class={cn("flex min-h-0 min-w-0 flex-1 flex-col", props.class)}
      {...rest}
    />
  );
}

export function SidebarHeader(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const rest = omit(props, "class");
  return <div data-sidebar="header" class={cn("flex flex-col gap-2 p-2", props.class)} {...rest} />;
}

export function SidebarFooter(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const rest = omit(props, "class");
  return <div data-sidebar="footer" class={cn("flex flex-col gap-2 p-2", props.class)} {...rest} />;
}

export function SidebarContent(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const rest = omit(props, "class");
  return (
    <div
      data-sidebar="content"
      class={cn(
        "scrollbar-quiet flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden group-data-[collapsible=icon]:overflow-hidden",
        props.class,
      )}
      {...rest}
    />
  );
}

export function SidebarGroup(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const rest = omit(props, "class");
  return (
    <div
      data-sidebar="group"
      class={cn("relative flex w-full min-w-0 flex-col p-2", props.class)}
      {...rest}
    />
  );
}

export function SidebarGroupLabel(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const rest = omit(props, "class");
  return (
    <div
      data-sidebar="group-label"
      class={cn(
        "flex h-7 shrink-0 items-center px-2 text-[11.5px] text-text-faint transition-[margin,opacity] duration-200",
        "group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:-mt-7 group-data-[collapsible=icon]:opacity-0",
        props.class,
      )}
      {...rest}
    />
  );
}

export function SidebarMenu(props: JSX.HTMLAttributes<HTMLUListElement>) {
  const rest = omit(props, "class");
  return (
    <ul
      data-sidebar="menu"
      class={cn("flex w-full min-w-0 flex-col gap-0.5", props.class)}
      {...rest}
    />
  );
}

export function SidebarMenuItem(props: JSX.HTMLAttributes<HTMLLIElement>) {
  const rest = omit(props, "class");
  return (
    <li data-sidebar="menu-item" class={cn("group/menu-item relative", props.class)} {...rest} />
  );
}

export interface SidebarMenuButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  isActive?: boolean;
  /** Shown as a native tooltip while the sidebar is collapsed to icons. */
  tooltip?: string;
}

export function SidebarMenuButton(props: SidebarMenuButtonProps) {
  const sidebar = useSidebar();
  const rest = omit(props, "class", "isActive", "tooltip", "children");
  return (
    <button
      type="button"
      data-sidebar="menu-button"
      data-active={props.isActive ? "true" : undefined}
      title={sidebar.expanded() ? undefined : props.tooltip}
      class={cn(
        "peer/menu-button flex h-8 w-full items-center gap-2.5 overflow-hidden rounded-lg px-2 text-left text-[13px] text-text-muted transition-colors duration-100",
        "hover:bg-hover hover:text-text disabled:pointer-events-none disabled:opacity-50",
        "data-[active=true]:bg-surface data-[active=true]:text-text data-[active=true]:shadow-lift",
        "[&>svg]:size-4 [&>svg]:shrink-0 [&>span]:truncate",
        "group-has-[[data-sidebar=menu-action]]/menu-item:pr-8",
        "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:[&>:not(svg):not([data-document-icon])]:hidden",
        props.class,
      )}
      {...rest}
    >
      {props.children}
    </button>
  );
}

export function SidebarMenuAction(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>) {
  const rest = omit(props, "class");
  return (
    <button
      type="button"
      data-sidebar="menu-action"
      class={cn(
        "absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-text-faint transition-opacity duration-100",
        "hover:bg-hover-strong hover:text-text focus-visible:opacity-100 md:opacity-0",
        "group-hover/menu-item:opacity-100 group-focus-within/menu-item:opacity-100",
        "group-data-[collapsible=icon]:hidden [&>svg]:size-3.5 [&>svg]:shrink-0",
        props.class,
      )}
      {...rest}
    />
  );
}

export function SidebarSeparator(props: JSX.HTMLAttributes<HTMLHRElement>) {
  const rest = omit(props, "class");
  return (
    <hr data-sidebar="separator" class={cn("mx-2 w-auto border-border", props.class)} {...rest} />
  );
}
