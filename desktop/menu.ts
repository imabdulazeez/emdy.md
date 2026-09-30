import type { MenuItemConstructorOptions } from "electron";

export interface MenuActions {
  revealLibrary: () => void;
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
      { label: reveal, click: () => actions.revealLibrary() },
      { type: "separator" },
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
      { role: "resetZoom", accelerator: "CmdOrCtrl+0" },
      { role: "zoomIn", accelerator: "CmdOrCtrl+=" },
      { role: "zoomOut", accelerator: "CmdOrCtrl+-" },
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

  return [...(mac ? [appMenu] : []), fileMenu, editMenu, viewMenu, windowMenu];
}

export function menuAccelerators(
  template: readonly MenuItemConstructorOptions[],
): { role?: string; accelerator: string }[] {
  const found: { role?: string; accelerator: string }[] = [];
  for (const item of template) {
    if (typeof item.accelerator === "string" && item.accelerator !== "")
      found.push({ role: item.role, accelerator: item.accelerator });
    if (Array.isArray(item.submenu)) found.push(...menuAccelerators(item.submenu));
  }
  return found;
}
