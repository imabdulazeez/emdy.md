import type { LayoutMode } from "~/state/layout";

export type ShortcutGroup = "Layout" | "View" | "Formatting" | "Blocks" | "Editing" | "Help";

export interface Shortcut {
  id: string;
  keys: string;
  label: string;
  group: ShortcutGroup;
}

export const LAYOUT_SHORTCUTS: Record<LayoutMode, string> = {
  editor: "Mod-1",
  preview: "Mod-2",
  reader: "Mod-3",
};

/**
 * The single registry of app-level keyboard shortcuts. Key bindings (the CodeMirror
 * keymap, the global handler, the context-menu key), tooltips, `aria-keyshortcuts`,
 * and the shortcuts panel all read their keys from here via `shortcutKeys`.
 */
export const SHORTCUTS = [
  { id: "layout-editor", keys: LAYOUT_SHORTCUTS.editor, label: "Raw Markdown", group: "Layout" },
  {
    id: "layout-preview",
    keys: LAYOUT_SHORTCUTS.preview,
    label: "Editable preview",
    group: "Layout",
  },
  {
    id: "layout-reader",
    keys: LAYOUT_SHORTCUTS.reader,
    label: "Read-only preview",
    group: "Layout",
  },
  { id: "toggle-sidebar", keys: "Mod-\\", label: "Toggle sidebar", group: "View" },
  { id: "new-document", keys: "Mod-Alt-n", label: "New document", group: "View" },
  { id: "search", keys: "Mod-p", label: "Search documents", group: "View" },
  { id: "toggle-focus", keys: "Mod-Shift-f", label: "Toggle focus mode", group: "View" },
  { id: "exit-focus", keys: "Escape", label: "Exit focus mode", group: "View" },
  { id: "close-settings", keys: "Escape", label: "Close settings", group: "View" },
  { id: "context-menu", keys: "Shift-F10", label: "Open context menu", group: "View" },
  { id: "bold", keys: "Mod-b", label: "Bold", group: "Formatting" },
  { id: "italic", keys: "Mod-i", label: "Italic", group: "Formatting" },
  { id: "strikethrough", keys: "Mod-Shift-x", label: "Strikethrough", group: "Formatting" },
  { id: "inline-code", keys: "Mod-Shift-c", label: "Inline code", group: "Formatting" },
  { id: "link", keys: "Mod-k", label: "Insert link", group: "Formatting" },
  { id: "image", keys: "Mod-Shift-i", label: "Insert image", group: "Formatting" },
  { id: "paragraph", keys: "Mod-Alt-0", label: "Paragraph", group: "Blocks" },
  { id: "heading-1", keys: "Mod-Alt-1", label: "Heading 1", group: "Blocks" },
  { id: "heading-2", keys: "Mod-Alt-2", label: "Heading 2", group: "Blocks" },
  { id: "heading-3", keys: "Mod-Alt-3", label: "Heading 3", group: "Blocks" },
  { id: "heading-4", keys: "Mod-Alt-4", label: "Heading 4", group: "Blocks" },
  { id: "heading-5", keys: "Mod-Alt-5", label: "Heading 5", group: "Blocks" },
  { id: "heading-6", keys: "Mod-Alt-6", label: "Heading 6", group: "Blocks" },
  { id: "blockquote", keys: "Mod-Shift-9", label: "Blockquote", group: "Blocks" },
  { id: "bullet-list", keys: "Mod-Shift-8", label: "Bullet list", group: "Blocks" },
  { id: "ordered-list", keys: "Mod-Shift-7", label: "Numbered list", group: "Blocks" },
  { id: "task-list", keys: "Mod-Shift-l", label: "Task list", group: "Blocks" },
  { id: "code-block", keys: "Mod-Alt-c", label: "Code block", group: "Blocks" },
  { id: "table", keys: "Mod-Alt-t", label: "Insert table", group: "Blocks" },
  { id: "horizontal-rule", keys: "Mod-Alt-h", label: "Horizontal rule", group: "Blocks" },
  { id: "footnote", keys: "Mod-Alt-f", label: "Insert footnote", group: "Blocks" },
  { id: "indent", keys: "Tab", label: "Indent list item", group: "Editing" },
  { id: "dedent", keys: "Shift-Tab", label: "Outdent list item", group: "Editing" },
  { id: "continue-list", keys: "Enter", label: "Continue list or checkbox", group: "Editing" },
  { id: "find", keys: "Mod-f", label: "Find in document", group: "Editing" },
  {
    id: "copy-table",
    keys: "Mod-Alt-Shift-c",
    label: "Copy table as Markdown or CSV",
    group: "Editing",
  },
  { id: "undo", keys: "Mod-z", label: "Undo", group: "Editing" },
  { id: "redo", keys: "Mod-Shift-z", label: "Redo", group: "Editing" },
  { id: "shortcuts", keys: "Mod-/", label: "Keyboard shortcuts", group: "Help" },
  { id: "settings", keys: "Mod-,", label: "Settings", group: "Help" },
] as const satisfies readonly Shortcut[];

export type ShortcutId = (typeof SHORTCUTS)[number]["id"];

/** The keys registered for a shortcut, in CodeMirror `Mod-` notation. */
export function shortcutKeys(id: ShortcutId): string {
  const shortcut = SHORTCUTS.find((entry) => entry.id === id);
  if (!shortcut) throw new Error(`Unknown shortcut: ${id}`);
  return shortcut.keys;
}

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  "Layout",
  "View",
  "Formatting",
  "Blocks",
  "Editing",
  "Help",
];

export function isMacPlatform(
  nav: Pick<Navigator, "platform" | "userAgent"> | undefined = globalThis.navigator,
): boolean {
  if (!nav) return false;
  return /Mac|iPhone|iPad|iPod/.test(nav.platform || "") || /Mac OS X/.test(nav.userAgent || "");
}

interface ParsedShortcut {
  mod: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

const KEY_NAMES: Record<string, string> = {
  "\\": "\\",
  "/": "/",
  escape: "Esc",
  enter: "Enter",
  tab: "Tab",
};

export function parseShortcut(keys: string): ParsedShortcut {
  const parts = keys.split("-");
  const key = parts.pop() ?? "";
  const modifiers = new Set(parts.map((part) => part.toLowerCase()));
  return {
    mod: modifiers.has("mod"),
    shift: modifiers.has("shift"),
    alt: modifiers.has("alt"),
    key: key.length === 1 ? key.toLowerCase() : key,
  };
}

export function formatShortcut(keys: string, mac: boolean): string {
  const parsed = parseShortcut(keys);
  const lower = parsed.key.toLowerCase();
  const keyLabel =
    KEY_NAMES[lower] ?? (parsed.key.length === 1 ? parsed.key.toUpperCase() : parsed.key);
  if (mac) {
    return `${parsed.mod ? "⌘" : ""}${parsed.alt ? "⌥" : ""}${parsed.shift ? "⇧" : ""}${keyLabel}`;
  }
  const parts: string[] = [];
  if (parsed.mod) parts.push("Ctrl");
  if (parsed.alt) parts.push("Alt");
  if (parsed.shift) parts.push("Shift");
  parts.push(keyLabel);
  return parts.join("+");
}

/** A tooltip that names the action and its shortcut, e.g. "Bold (⌘B)". */
export function shortcutTitle(label: string, keys: string, mac: boolean): string {
  return `${label} (${formatShortcut(keys, mac)})`;
}

export function ariaKeyShortcuts(keys: string, mac: boolean): string {
  const parsed = parseShortcut(keys);
  const parts: string[] = [];
  if (parsed.mod) parts.push(mac ? "Meta" : "Control");
  if (parsed.alt) parts.push("Alt");
  if (parsed.shift) parts.push("Shift");
  parts.push(parsed.key.length === 1 ? parsed.key.toUpperCase() : parsed.key);
  return parts.join("+");
}

export interface KeyEventLike {
  key: string;
  /** Physical key, used when Option/Alt turns a letter into another character (⌥C is "ç" on a Mac). */
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export function matchesShortcut(event: KeyEventLike, keys: string, mac: boolean): boolean {
  const parsed = parseShortcut(keys);
  const modPressed = mac ? event.metaKey : event.ctrlKey;
  const otherMod = mac ? event.ctrlKey : event.metaKey;
  if (parsed.mod !== modPressed || otherMod) return false;
  if (parsed.shift !== event.shiftKey) return false;
  if (parsed.alt !== event.altKey) return false;
  const eventKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (eventKey === parsed.key) return true;
  if (!parsed.alt || event.code === undefined) return false;
  if (!mac && event.ctrlKey && event.altKey && event.key.length === 1) return false;
  return event.code === physicalCode(parsed.key);
}

function physicalCode(key: string): string | null {
  if (/^[a-z]$/.test(key)) return `Key${key.toUpperCase()}`;
  if (/^\d$/.test(key)) return `Digit${key}`;
  return null;
}

export interface GlobalShortcutHandlers {
  setLayout(mode: LayoutMode): void;
  toggleSidebar(): void;
  toggleFocusMode(): void;
  toggleShortcuts(): void;
  toggleSettings(): void;
  focusSearch(): void;
  createDocument(): void;
}

/** Shortcuts handled by the window-level capture listener in `AppShell`. */
export const GLOBAL_SHORTCUTS: readonly (readonly [
  ShortcutId,
  (handlers: GlobalShortcutHandlers) => void,
])[] = [
  ["layout-editor", (handlers) => handlers.setLayout("editor")],
  ["layout-preview", (handlers) => handlers.setLayout("preview")],
  ["layout-reader", (handlers) => handlers.setLayout("reader")],
  ["toggle-sidebar", (handlers) => handlers.toggleSidebar()],
  ["new-document", (handlers) => handlers.createDocument()],
  ["search", (handlers) => handlers.focusSearch()],
  ["toggle-focus", (handlers) => handlers.toggleFocusMode()],
  ["shortcuts", (handlers) => handlers.toggleShortcuts()],
  ["settings", (handlers) => handlers.toggleSettings()],
];

export function handleGlobalShortcut(
  event: KeyEventLike,
  handlers: GlobalShortcutHandlers,
  mac: boolean,
): boolean {
  for (const [id, run] of GLOBAL_SHORTCUTS) {
    if (matchesShortcut(event, shortcutKeys(id), mac)) {
      run(handlers);
      return true;
    }
  }
  return false;
}
