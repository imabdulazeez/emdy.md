import type { KeyboardEvent, MenuItemConstructorOptions } from "electron";
import { shortcutKeys, type ShortcutId } from "../src/lib/shortcuts";
import type { ZoomDirection } from "./window-chrome";

export interface MenuActions {
  openFiles: () => void;
  revealLibrary: () => void;
  zoom: (direction: ZoomDirection) => void;
  command: (id: ShortcutId) => void;
}

export const MENU_COMMANDS = {
  "new-document": "New Document",
  save: "Save",
  settings: "Settings…",
  "layout-editor": "Raw Markdown",
  "layout-preview": "Editable Preview",
  "layout-reader": "Read-only Preview",
  search: "Search Documents…",
  "toggle-focus": "Focus Mode",
  shortcuts: "Keyboard Shortcuts",
} as const satisfies Partial<Record<ShortcutId, string>>;

export type MenuCommand = keyof typeof MENU_COMMANDS;

const ACCELERATOR_MODIFIERS: Record<string, string> = {
  mod: "CmdOrCtrl",
  ctrl: "Ctrl",
  alt: "Alt",
  shift: "Shift",
};

export function registryAccelerator(keys: string): string {
  const parts = keys.split("-");
  const key = parts.pop() ?? "";
  const modifiers = parts.map((part) => ACCELERATOR_MODIFIERS[part.toLowerCase()] ?? part);
  return [...modifiers, key.length === 1 ? key.toUpperCase() : key].join("+");
}

export function commandItem(
  id: MenuCommand,
  actions: Pick<MenuActions, "command">,
): MenuItemConstructorOptions {
  return {
    id,
    label: MENU_COMMANDS[id],
    accelerator: registryAccelerator(shortcutKeys(id, true)),
    registerAccelerator: false,
    click: (_item, _window, event: KeyboardEvent) => {
      if (event?.triggeredByAccelerator) return;
      actions.command(id);
    },
  };
}

export interface ShortcutChord {
  mod: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

const KEY_ALIASES: Record<string, string> = {
  plus: "=",
  "+": "=",
  esc: "escape",
};

export function acceleratorChord(accelerator: string, mac: boolean): ShortcutChord {
  const parts = accelerator.split("+").map((part) => part.trim());
  const key = parts.pop()?.toLowerCase() ?? "";
  const chord: ShortcutChord = { mod: false, ctrl: false, shift: false, alt: false, key };
  chord.key = KEY_ALIASES[key] ?? (key === "" ? "=" : key);
  for (const part of parts.map((value) => value.toLowerCase())) {
    if (part === "cmdorctrl" || part === "commandorcontrol") chord.mod = true;
    else if (part === "cmd" || part === "command") {
      if (mac) chord.mod = true;
      else chord.ctrl = true;
    } else if (part === "ctrl" || part === "control") {
      if (mac) chord.ctrl = true;
      else chord.mod = true;
    } else if (part === "shift") chord.shift = true;
    else if (part === "alt" || part === "option" || part === "altgr") chord.alt = true;
  }
  return chord;
}

export function registryChord(keys: string): ShortcutChord {
  const parts = keys.split("-");
  const key = (parts.pop() ?? "").toLowerCase();
  const modifiers = new Set(parts.map((part) => part.toLowerCase()));
  return {
    mod: modifiers.has("mod"),
    ctrl: modifiers.has("ctrl"),
    shift: modifiers.has("shift"),
    alt: modifiers.has("alt"),
    key,
  };
}

export function sameChord(a: ShortcutChord, b: ShortcutChord): boolean {
  return (
    a.mod === b.mod &&
    a.ctrl === b.ctrl &&
    a.shift === b.shift &&
    a.alt === b.alt &&
    a.key === b.key
  );
}

export function applicationMenu(
  platform: NodeJS.Platform,
  development: boolean,
  actions: MenuActions,
): MenuItemConstructorOptions[] {
  const mac = platform === "darwin";
  const reveal = mac
    ? "Show Library in Finder"
    : platform === "win32"
      ? "Show Library in File Explorer"
      : "Open Library Folder";

  const appMenu: MenuItemConstructorOptions = {
    label: "emdy",
    submenu: [
      { role: "about" },
      { type: "separator" },
      commandItem("settings", actions),
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide", accelerator: "Command+H" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit", accelerator: "Command+Q" },
    ],
  };

  const fileMenu: MenuItemConstructorOptions = {
    label: "File",
    submenu: [
      commandItem("new-document", actions),
      {
        id: "open-files",
        label: "Open…",
        accelerator: "CmdOrCtrl+O",
        click: () => actions.openFiles(),
      },
      { type: "separator" },
      commandItem("save", actions),
      { type: "separator" },
      { id: "reveal-library", label: reveal, click: () => actions.revealLibrary() },
      { type: "separator" },
      ...(mac ? [] : ([commandItem("settings", actions), { type: "separator" }] as const)),
      mac
        ? { role: "close", accelerator: "Command+W" }
        : platform === "win32"
          ? { role: "quit" }
          : { role: "quit", accelerator: "Ctrl+Q" },
    ],
  };

  const editMenu: MenuItemConstructorOptions = {
    label: "Edit",
    submenu: [
      { role: "undo", accelerator: "CmdOrCtrl+Z" },
      { role: "redo", accelerator: "Shift+CmdOrCtrl+Z" },
      { type: "separator" },
      { role: "cut", accelerator: "CmdOrCtrl+X" },
      { role: "copy", accelerator: "CmdOrCtrl+C" },
      { role: "paste", accelerator: "CmdOrCtrl+V" },
      { role: "selectAll", accelerator: "CmdOrCtrl+A" },
    ],
  };

  const viewMenu: MenuItemConstructorOptions = {
    label: "View",
    submenu: [
      ...(development
        ? ([
            { role: "reload", accelerator: "CmdOrCtrl+R" },
            { role: "toggleDevTools", accelerator: "F12" },
            { type: "separator" },
          ] satisfies MenuItemConstructorOptions[])
        : []),
      commandItem("layout-editor", actions),
      commandItem("layout-preview", actions),
      commandItem("layout-reader", actions),
      { type: "separator" },
      commandItem("search", actions),
      commandItem("toggle-focus", actions),
      { type: "separator" },
      {
        id: "zoom-reset",
        label: "Actual Size",
        accelerator: "CmdOrCtrl+0",
        click: () => actions.zoom("reset"),
      },
      {
        id: "zoom-in",
        label: "Zoom In",
        accelerator: "CmdOrCtrl+=",
        click: () => actions.zoom("in"),
      },
      {
        id: "zoom-out",
        label: "Zoom Out",
        accelerator: "CmdOrCtrl+-",
        click: () => actions.zoom("out"),
      },
      { type: "separator" },
      { role: "togglefullscreen", accelerator: mac ? "Control+Command+F" : "F11" },
    ],
  };

  const windowMenu: MenuItemConstructorOptions = {
    label: "Window",
    submenu: mac
      ? [
          { role: "minimize", accelerator: "Command+M" },
          { role: "zoom" },
          { type: "separator" },
          { role: "front" },
        ]
      : [{ role: "minimize", accelerator: "CmdOrCtrl+M" }],
  };

  const helpMenu: MenuItemConstructorOptions = {
    label: "Help",
    ...(mac ? { role: "help" as const } : {}),
    submenu: [commandItem("shortcuts", actions)],
  };

  return [...(mac ? [appMenu] : []), fileMenu, editMenu, viewMenu, windowMenu, helpMenu];
}

export function menuAccelerators(
  template: readonly MenuItemConstructorOptions[],
): { id?: string; role?: string; accelerator: string }[] {
  const found: { id?: string; role?: string; accelerator: string }[] = [];
  for (const item of template) {
    if (typeof item.accelerator === "string" && item.accelerator !== "")
      found.push({ id: item.id, role: item.role, accelerator: item.accelerator });
    if (Array.isArray(item.submenu)) found.push(...menuAccelerators(item.submenu));
  }
  return found;
}
