import { Portal } from "@solidjs/web";
import { createEffect, createMemo, createSignal, flush, For, onCleanup, Show } from "solid-js";
import { getFocusable } from "~/lib/focus-trap";
import { collapseElement } from "~/lib/motion";
import { groupByRecency, sameSections } from "~/lib/recency";
import { normalizeQuery, searchDocuments, type SearchExcerpt } from "~/lib/search";
import { ariaKeyShortcuts, isMacPlatform, shortcutKeys, shortcutTitle } from "~/lib/shortcuts";
import {
  activeDocumentId,
  createDocument,
  deleteDocument,
  documents,
  openDocument,
  sameListing,
  setDocumentIcon,
  toListing,
  type DocumentListing,
} from "~/state/document";
import { editorApi } from "~/state/editor-api";
import { closeSettings, openSettings, view } from "~/state/navigation";
import { isPinned, pinDocument, pinnedDocumentIds, unpinDocument } from "~/state/workspace";
import {
  requestEditorFocus,
  searchRequested,
  takeSearchRequest,
  toggleShortcuts,
} from "~/state/ui";
import { cn } from "~/lib/utils";
import DocumentIcon from "./DocumentIcon";
import DocumentIconPicker from "./DocumentIconPicker";
import Logo from "./Logo";
import { Icon } from "./icons";
import ThemeToggle from "./ThemeToggle";
import {
  ContextMenu,
  isContextMenuKey,
  menuPoint,
  type ContextMenuItem,
  type ContextMenuState,
} from "./ui/context-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "./ui/sidebar";

interface DocumentItemProps {
  doc: DocumentListing;
  excerpt?: SearchExcerpt;
  confirming: boolean;
  pinned: boolean;
  /** Deletion is confirmed and the row is collapsing out of the list. */
  removing: boolean;
  onOpen(id: string): void;
  onRequestDelete(id: string): void;
  onTogglePin(id: string, pin: boolean): void;
  onConfirmDelete(id: string, row: HTMLElement | undefined): void;
  onCancelDelete(): void;
  onContextMenu(event: MouseEvent | KeyboardEvent, doc: DocumentListing): void;
}

function DocumentItem(props: DocumentItemProps) {
  let confirmButton: HTMLButtonElement | undefined;
  let row: HTMLLIElement | undefined;
  const active = () => view() === "document" && activeDocumentId() === props.doc.id;

  createEffect(
    () => props.confirming,
    (confirming) => {
      if (confirming) queueMicrotask(() => confirmButton?.focus());
    },
  );

  return (
    <SidebarMenuItem
      ref={(el) => (row = el)}
      data-document-row=""
      data-document-id={props.doc.id}
      data-removing={props.removing ? "" : undefined}
      inert={props.removing}
    >
      <Show
        when={props.confirming || props.removing}
        fallback={
          <>
            <SidebarMenuButton
              isActive={active()}
              aria-current={active() ? "page" : undefined}
              aria-label={props.doc.title}
              class={cn(
                "h-9 rounded-[10px] px-3 data-[active=true]:shadow-none group-has-[[data-sidebar=menu-action]]/menu-item:pr-14",
                props.excerpt && "h-auto min-h-9 py-1.5",
              )}
              onClick={() => props.onOpen(props.doc.id)}
              onContextMenu={(event) => props.onContextMenu(event, props.doc)}
              onKeyDown={(event) => {
                if (isContextMenuKey(event)) props.onContextMenu(event, props.doc);
              }}
            >
              <DocumentIcon icon={props.doc.icon} title={props.doc.title} />
              <Show
                when={props.excerpt}
                fallback={<span class="min-w-0 flex-1">{props.doc.title}</span>}
              >
                {(excerpt) => (
                  <span class="flex min-w-0 flex-1 flex-col">
                    <span class="truncate">{props.doc.title}</span>
                    <span data-excerpt class="truncate text-[11.5px] text-text-faint">
                      {excerpt().before}
                      <mark class="rounded-[3px] bg-selection text-text">{excerpt().match}</mark>
                      {excerpt().after}
                    </span>
                  </span>
                )}
              </Show>
            </SidebarMenuButton>
            <SidebarMenuAction
              data-pin-action=""
              aria-label={`${props.pinned ? "Unpin" : "Pin"} ${props.doc.title}`}
              title={props.pinned ? "Unpin" : "Pin"}
              class="right-7.5"
              onClick={() => props.onTogglePin(props.doc.id, !props.pinned)}
            >
              <Icon name={props.pinned ? "pin-off" : "pin"} />
            </SidebarMenuAction>
            <SidebarMenuAction
              aria-label={`Delete ${props.doc.title}`}
              title="Delete"
              onClick={() => props.onRequestDelete(props.doc.id)}
            >
              <Icon name="trash" />
            </SidebarMenuAction>
          </>
        }
      >
        <div
          role="group"
          aria-label={`Delete ${props.doc.title}?`}
          class="flex min-h-9 items-center gap-1 rounded-[10px] bg-danger-soft py-1 pr-1 pl-3 text-[12px] text-text"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              props.onCancelDelete();
            }
          }}
        >
          <span class="min-w-0 flex-1 truncate">Delete “{props.doc.title}”?</span>
          <button
            ref={(el) => (confirmButton = el)}
            type="button"
            class="shrink-0 rounded-md px-1.5 py-0.5 font-bold text-danger hover:bg-surface"
            onClick={() => props.onConfirmDelete(props.doc.id, row)}
          >
            Delete
          </button>
          <button
            type="button"
            class="flex size-6 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface hover:text-text"
            aria-label="Cancel"
            onClick={() => props.onCancelDelete()}
          >
            <Icon name="close" size={13} />
          </button>
        </div>
      </Show>
    </SidebarMenuItem>
  );
}

export default function AppSidebar() {
  const sidebar = useSidebar();
  const mac = isMacPlatform();
  const [pendingDelete, setPendingDelete] = createSignal<string | null>(null);
  const [query, setQuery] = createSignal("");
  const [menu, setMenu] = createSignal<ContextMenuState | null>(null);
  const [iconTarget, setIconTarget] = createSignal<{
    id: string;
    anchor: HTMLElement | null;
  } | null>(null);
  let newDocumentButton: HTMLButtonElement | undefined;
  let searchInput: HTMLInputElement | undefined;
  let nav: HTMLElement | undefined;
  const pinned = createMemo(
    () => {
      const byId = new Map(documents().map((doc) => [doc.id, doc]));
      return pinnedDocumentIds().flatMap((id) => {
        const doc = byId.get(id);
        return doc ? [toListing(doc)] : [];
      });
    },
    {
      equals: (a, b) =>
        a.length === b.length && a.every((doc, index) => sameListing(doc, b[index])),
    },
  );
  const sections = createMemo(
    () => {
      const pins = new Set(pinnedDocumentIds());
      const unpinned = documents().filter((doc) => !pins.has(doc.id));
      return groupByRecency(unpinned, (doc) => doc.modified, Date.now()).map((section) => ({
        ...section,
        items: section.items.map(toListing),
      }));
    },
    { equals: (a, b) => sameSections(a, b, sameListing) },
  );
  const searching = () => normalizeQuery(query()) !== "";
  const results = createMemo(() => searchDocuments(documents(), query()));
  const hasResults = () => results().titles.length > 0 || results().contents.length > 0;

  createEffect(
    () => searchRequested() && (!sidebar.isMobile() || sidebar.open()),
    (ready) => {
      if (!ready || !takeSearchRequest()) return;
      setMenu(null);
      setIconTarget(null);
      queueMicrotask(() => {
        searchInput?.focus();
        searchInput?.select();
      });
    },
  );

  const closeOnMobile = () => {
    if (sidebar.isMobile()) sidebar.setOpen(false);
  };

  const open = (id: string) => {
    setPendingDelete(null);
    closeSettings();
    if (openDocument(id)) editorApi()?.focus();
    closeOnMobile();
  };

  const create = () => {
    setPendingDelete(null);
    setQuery("");
    closeSettings();
    createDocument();
    requestEditorFocus();
    closeOnMobile();
  };

  // Confirmed deletions whose rows are still collapsing. The plain set guards
  // against a second confirmation synchronously; the signal drives the rows.
  const deleting = new Set<string>();
  const [removing, setRemoving] = createSignal<ReadonlySet<string>>(new Set());

  // Flushed so the row is gone from the DOM before the caller checks whether its
  // section survived.
  const commitDelete = (id: string) => {
    if (!deleting.delete(id)) return;
    flush(() => {
      setRemoving((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      deleteDocument(id);
    });
  };

  // A confirmed deletion is never dropped, even if the sidebar goes away
  // mid-collapse. Disposal can run inside a flush, so commit just after it.
  onCleanup(() => {
    const ids = [...deleting];
    deleting.clear();
    if (ids.length > 0)
      queueMicrotask(() => {
        for (const id of ids) flush(() => deleteDocument(id));
      });
  });

  /** Moves focus out of a row that is going away: to the next row, else the previous one. */
  const focusNeighbour = (row: HTMLElement) => {
    const rows = Array.from(
      row.closest("nav")?.querySelectorAll<HTMLElement>("[data-document-row]") ?? [],
    ).filter((candidate) => candidate === row || !candidate.hasAttribute("data-removing"));
    const index = rows.indexOf(row);
    const order = [...rows.slice(index + 1), ...rows.slice(0, Math.max(index, 0)).reverse()];
    const target = order.map((candidate) => getFocusable(candidate)[0]).find(Boolean);
    (target ?? newDocumentButton)?.focus();
  };

  /** A row that is the last one left in its section takes the section heading with it. */
  const collapseTarget = (row: HTMLElement): HTMLElement => {
    const list = row.parentElement;
    const section = list?.parentElement;
    const siblings = Array.from(list?.children ?? []).filter(
      (item) => item !== row && !item.hasAttribute("data-removing"),
    );
    return siblings.length === 0 && section instanceof HTMLLIElement ? section : row;
  };

  const confirmDelete = (id: string, row: HTMLElement | undefined) => {
    if (deleting.has(id)) return;
    deleting.add(id);
    setPendingDelete(null);
    if (row?.contains(document.activeElement)) focusNeighbour(row);
    const target = row && collapseTarget(row);
    const collapse = target && collapseElement(target);
    if (!collapse) {
      commitDelete(id);
      return;
    }
    setRemoving((current) => new Set(current).add(id));
    void collapse.finished.then(() => {
      commitDelete(id);
      // A section that gained a document mid-collapse outlives the deletion.
      if (target.isConnected) collapse.revert();
    });
  };

  const setPinned = (id: string, pin: boolean, focus = "[data-sidebar=menu-button]") => {
    flush(() => (pin ? pinDocument(id) : unpinDocument(id)));
    Array.from(nav?.querySelectorAll<HTMLElement>("[data-document-row]") ?? [])
      .find((row) => row.dataset.documentId === id)
      ?.querySelector<HTMLElement>(focus)
      ?.focus();
  };

  const openFirstResult = () => {
    const first = results().titles[0] ?? results().contents[0]?.item;
    if (first) open(first.id);
  };

  const onSearchKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      openFirstResult();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (query()) setQuery("");
      else (event.currentTarget as HTMLInputElement).blur();
    }
  };

  const renderItem = (doc: () => DocumentListing, excerpt?: () => SearchExcerpt) => (
    <DocumentItem
      doc={doc()}
      excerpt={excerpt?.()}
      confirming={pendingDelete() === doc().id}
      pinned={pinnedDocumentIds().includes(doc().id)}
      removing={removing().has(doc().id)}
      onOpen={open}
      onRequestDelete={setPendingDelete}
      onTogglePin={(id, pin) => setPinned(id, pin, "[data-pin-action]")}
      onConfirmDelete={confirmDelete}
      onCancelDelete={() => setPendingDelete(null)}
      onContextMenu={documentMenu}
    />
  );

  const settings = () => {
    setPendingDelete(null);
    openSettings();
    closeOnMobile();
  };

  const showMenu = (
    event: MouseEvent | KeyboardEvent,
    label: string,
    items: readonly ContextMenuItem[],
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const anchor = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    setMenu({ ...menuPoint(event, anchor), label, items, anchor });
  };

  const documentMenu = (event: MouseEvent | KeyboardEvent, doc: DocumentListing) => {
    const anchor = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const items: ContextMenuItem[] = [
      {
        id: "icon",
        label: "Change icon…",
        icon: "image",
        onSelect: () => {
          setPendingDelete(null);
          setIconTarget({ id: doc.id, anchor });
        },
      },
    ];
    if (doc.icon)
      items.push({
        id: "reset-icon",
        label: "Use automatic icon",
        icon: "type",
        onSelect: () => setDocumentIcon(doc.id, null),
      });
    const pinnedNow = isPinned(doc.id);
    items.push({
      id: pinnedNow ? "unpin" : "pin",
      label: pinnedNow ? "Unpin" : "Pin",
      icon: pinnedNow ? "pin-off" : "pin",
      onSelect: () => setPinned(doc.id, !pinnedNow),
    });
    items.push({
      id: "delete",
      label: "Delete…",
      icon: "trash",
      danger: true,
      separated: true,
      onSelect: () => setPendingDelete(doc.id),
    });
    showMenu(event, doc.title, items);
  };

  const libraryMenu = (event: MouseEvent) =>
    showMenu(event, "Library", [
      { id: "new", label: "New document", icon: "plus", onSelect: create },
    ]);

  return (
    <Sidebar aria-label="Sidebar">
      <SidebarHeader
        class="relative h-[3.75rem] shrink-0 flex-row items-center gap-2 pr-3 pl-5 desktop-mac:pl-[var(--traffic-light-inset,6rem)]"
        data-window-drag
      >
        <Logo class="size-6" />
        <span class="min-w-0 flex-1 truncate text-[13px] font-bold tracking-tight text-text">
          emdy.md
        </span>
        <button
          type="button"
          class="icon-button size-7 min-w-7 text-text-faint"
          aria-label="Settings"
          title={shortcutTitle("Settings", shortcutKeys("settings"), mac)}
          aria-keyshortcuts={ariaKeyShortcuts(shortcutKeys("settings"), mac)}
          aria-current={view() === "settings" ? "page" : undefined}
          data-active={view() === "settings" ? "true" : undefined}
          onClick={settings}
        >
          <Icon name="settings" size={15} />
        </button>
        <button
          ref={(el) => (newDocumentButton = el)}
          type="button"
          class="icon-button size-7 min-w-7 text-text-faint"
          aria-label="New document"
          title={shortcutTitle("New document", shortcutKeys("new-document"), mac)}
          aria-keyshortcuts={ariaKeyShortcuts(shortcutKeys("new-document"), mac)}
          onClick={create}
        >
          <Icon name="plus" size={15} />
        </button>
      </SidebarHeader>
      <div role="search" class="shrink-0 px-3 pb-2">
        <div class="relative">
          <Icon
            name="search"
            size={14}
            class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-faint"
          />
          <input
            ref={(el) => (searchInput = el)}
            type="search"
            aria-label="Search documents"
            aria-keyshortcuts={ariaKeyShortcuts(shortcutKeys("search"), mac)}
            title={shortcutTitle("Search documents", shortcutKeys("search"), mac)}
            placeholder="Search"
            autocomplete="off"
            spellcheck={false}
            class="h-8 w-full rounded-[10px] bg-surface-raised pr-8 pl-8 text-[12.5px] text-text outline-none placeholder:text-text-faint focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-search-cancel-button]:appearance-none"
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={onSearchKeyDown}
          />
          <Show when={query()}>
            <button
              type="button"
              class="icon-button absolute top-1/2 right-1 size-6 min-w-6 -translate-y-1/2 text-text-faint"
              aria-label="Clear search"
              title="Clear search"
              onClick={() => setQuery("")}
            >
              <Icon name="close" size={13} />
            </button>
          </Show>
        </div>
      </div>
      <SidebarContent onContextMenu={libraryMenu}>
        <nav ref={(el) => (nav = el)} aria-label="Main" class="flex flex-col">
          <Show when={searching()}>
            <SidebarGroup class="px-2 py-0">
              <Show
                when={hasResults()}
                fallback={
                  <p role="status" class="px-3 py-2 text-[12px] text-text-faint">
                    No documents match “{normalizeQuery(query())}”.
                  </p>
                }
              >
                <SidebarMenu aria-label="Search results" class="gap-px">
                  <Show when={results().titles.length > 0}>
                    <li>
                      <SidebarGroupLabel id="search-titles">Titles</SidebarGroupLabel>
                      <SidebarMenu aria-labelledby="search-titles" class="gap-px">
                        <For each={results().titles} keyed={(doc) => doc.id}>
                          {(doc) => renderItem(doc)}
                        </For>
                      </SidebarMenu>
                    </li>
                  </Show>
                  <Show when={results().contents.length > 0}>
                    <li>
                      <SidebarGroupLabel id="search-contents">Contents</SidebarGroupLabel>
                      <SidebarMenu aria-labelledby="search-contents" class="gap-px">
                        <For each={results().contents} keyed={(match) => match.item.id}>
                          {(match) =>
                            renderItem(
                              () => match().item,
                              () => match().excerpt,
                            )
                          }
                        </For>
                      </SidebarMenu>
                    </li>
                  </Show>
                </SidebarMenu>
              </Show>
            </SidebarGroup>
          </Show>
          <Show when={!searching()}>
            <SidebarGroup class="px-2 py-0">
              <SidebarMenu aria-label="Documents" class="gap-px">
                <Show when={pinned().length > 0}>
                  <li>
                    <SidebarGroupLabel id="documents-pinned">Pinned</SidebarGroupLabel>
                    <SidebarMenu aria-labelledby="documents-pinned" class="gap-px">
                      <For each={pinned()} keyed={(doc) => doc.id}>
                        {(doc) => renderItem(doc)}
                      </For>
                    </SidebarMenu>
                  </li>
                </Show>
                <For each={sections()} keyed={(section) => section.group}>
                  {(section) => (
                    <li>
                      <SidebarGroupLabel id={`documents-${section().group}`}>
                        {section().label}
                      </SidebarGroupLabel>
                      <SidebarMenu aria-labelledby={`documents-${section().group}`} class="gap-px">
                        <For each={section().items} keyed={(doc) => doc.id}>
                          {(doc) => renderItem(doc)}
                        </For>
                      </SidebarMenu>
                    </li>
                  )}
                </For>
              </SidebarMenu>
            </SidebarGroup>
          </Show>
        </nav>
      </SidebarContent>
      <SidebarFooter class="px-3 py-2">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-0.5">
            <button
              type="button"
              class="icon-button gap-2 px-2 text-[12px]"
              aria-label="Keyboard shortcuts"
              title={shortcutTitle("Keyboard shortcuts", shortcutKeys("shortcuts"), mac)}
              aria-keyshortcuts={ariaKeyShortcuts(shortcutKeys("shortcuts"), mac)}
              onClick={toggleShortcuts}
            >
              <Icon name="keyboard" size={15} />
              <span>Shortcuts</span>
            </button>
          </div>
          <ThemeToggle />
        </div>
      </SidebarFooter>
      <ContextMenu state={menu()} onClose={() => setMenu(null)} />
      <Show when={iconTarget()} keyed>
        {(target) => (
          <Show when={documents().find((doc) => doc.id === target.id)}>
            {(doc) => (
              <Portal>
                <DocumentIconPicker
                  title={doc().title}
                  icon={doc().icon}
                  returnFocus={target.anchor}
                  onSave={(icon) => setDocumentIcon(target.id, icon)}
                  onClose={() => setIconTarget(null)}
                />
              </Portal>
            )}
          </Show>
        )}
      </Show>
    </Sidebar>
  );
}
