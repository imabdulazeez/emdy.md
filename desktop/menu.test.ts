import type { MenuItemConstructorOptions } from "electron";
import { describe, expect, it, vi } from "vite-plus/test";
import { keysFor, shortcutKeys, SHORTCUTS } from "../src/lib/shortcuts";
import {
  acceleratorChord,
  applicationMenu,
  MENU_COMMANDS,
  menuAccelerators,
  registryAccelerator,
  registryChord,
  sameChord,
  type MenuCommand,
} from "./menu";

const ACTIONS = {
  openFiles: () => {},
  revealLibrary: () => {},
  zoom: () => {},
  command: () => {},
};
const PLATFORMS = ["darwin", "win32", "linux"] as const;
const SAME_ACTION_ROLES = new Map([
  ["undo", "undo"],
  ["redo", "redo"],
]);

function items(template: readonly MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return template.flatMap((item) => [
    item,
    ...(Array.isArray(item.submenu) ? items(item.submenu) : []),
  ]);
}

describe("acceleratorChord", () => {
  it("reads CmdOrCtrl as the registry's Mod key", () => {
    expect(acceleratorChord("CmdOrCtrl+Shift+Z", true)).toEqual({
      mod: true,
      ctrl: false,
      shift: true,
      alt: false,
      key: "z",
    });
  });

  it("maps Command and Control per platform", () => {
    expect(acceleratorChord("Command+H", true)).toMatchObject({ mod: true, ctrl: false });
    expect(acceleratorChord("Control+Command+F", true)).toMatchObject({ mod: true, ctrl: true });
    expect(acceleratorChord("Ctrl+Q", false)).toMatchObject({ mod: true, ctrl: false });
    expect(acceleratorChord("Cmd+Q", false)).toMatchObject({ mod: false, ctrl: true });
    expect(acceleratorChord("Alt+CmdOrCtrl+H", false)).toMatchObject({ alt: true, key: "h" });
    expect(acceleratorChord("Option+Cmd+I", true)).toMatchObject({ alt: true, mod: true });
  });

  it("treats Plus and = as the same key", () => {
    expect(acceleratorChord("CmdOrCtrl+Plus", true).key).toBe("=");
    expect(acceleratorChord("CmdOrCtrl+=", true).key).toBe("=");
    expect(acceleratorChord("F12", true)).toMatchObject({ mod: false, key: "f12" });
    expect(acceleratorChord("Esc", true).key).toBe("escape");
  });
});

describe("registryChord", () => {
  it("parses CodeMirror notation", () => {
    expect(registryChord("Mod-Alt-h")).toEqual({
      mod: true,
      ctrl: false,
      shift: false,
      alt: true,
      key: "h",
    });
    expect(
      sameChord(registryChord("Mod-Shift-z"), acceleratorChord("Shift+CmdOrCtrl+Z", true)),
    ).toBe(true);
    expect(sameChord(registryChord("Mod-z"), acceleratorChord("CmdOrCtrl+Y", true))).toBe(false);
  });
});

describe("registryAccelerator", () => {
  it("writes registry keys as Electron accelerators", () => {
    expect(registryAccelerator("Mod-n")).toBe("CmdOrCtrl+N");
    expect(registryAccelerator("Mod-Shift-f")).toBe("CmdOrCtrl+Shift+F");
    expect(registryAccelerator("Mod-Alt-n")).toBe("CmdOrCtrl+Alt+N");
    expect(registryAccelerator("Mod-,")).toBe("CmdOrCtrl+,");
    expect(registryAccelerator("Mod-/")).toBe("CmdOrCtrl+/");
    expect(registryAccelerator("Mod-1")).toBe("CmdOrCtrl+1");
  });

  it.each(SHORTCUTS.map((shortcut) => [shortcut.id, keysFor(shortcut, true)] as const))(
    "round-trips %s (%s) to the same chord",
    (_id, keys) => {
      for (const mac of [true, false]) {
        expect(
          sameChord(acceleratorChord(registryAccelerator(keys), mac), registryChord(keys)),
        ).toBe(true);
      }
    },
  );
});

describe("menu commands", () => {
  const commands = Object.keys(MENU_COMMANDS) as MenuCommand[];

  it.each(PLATFORMS)("lists every command once with its desktop shortcut on %s", (platform) => {
    const all = items(applicationMenu(platform, false, ACTIONS));
    for (const id of commands) {
      const matches = all.filter((item) => item.id === id);
      expect(matches, id).toHaveLength(1);
      expect(matches[0]).toMatchObject({
        label: MENU_COMMANDS[id],
        accelerator: registryAccelerator(shortcutKeys(id, true)),
        registerAccelerator: false,
      });
    }
  });

  it("shows ⌘N for New Document rather than the browser's stand-in", () => {
    const create = items(applicationMenu("darwin", false, ACTIONS)).find(
      (item) => item.id === "new-document",
    );
    expect(create?.accelerator).toBe("CmdOrCtrl+N");
  });

  it.each(PLATFORMS)("sends a clicked command to the app on %s", (platform) => {
    const command = vi.fn();
    const all = items(applicationMenu(platform, false, { ...ACTIONS, command }));
    for (const id of commands) {
      const item = all.find((entry) => entry.id === id)!;
      (item.click as (...args: unknown[]) => void)(item, undefined, {
        triggeredByAccelerator: false,
      });
    }
    expect(command.mock.calls).toEqual(commands.map((id) => [id]));
  });

  it("leaves a command's keystroke to the page, which already handled it", () => {
    const command = vi.fn();
    const all = items(applicationMenu("darwin", false, { ...ACTIONS, command }));
    const save = all.find((item) => item.id === "save")!;
    (save.click as (...args: unknown[]) => void)(save, undefined, {
      triggeredByAccelerator: true,
    });
    expect(command).not.toHaveBeenCalled();
  });

  it("puts Settings in the app menu on macOS and the File menu elsewhere", () => {
    const menuOf = (platform: (typeof PLATFORMS)[number]) =>
      applicationMenu(platform, false, ACTIONS)
        .filter((menu) =>
          (menu.submenu as MenuItemConstructorOptions[]).some((item) => item.id === "settings"),
        )
        .map((menu) => menu.label);
    expect(menuOf("darwin")).toEqual(["emdy"]);
    expect(menuOf("win32")).toEqual(["File"]);
    expect(menuOf("linux")).toEqual(["File"]);
  });

  it.each(PLATFORMS)("ends with a Help menu on %s", (platform) => {
    const help = applicationMenu(platform, false, ACTIONS).at(-1)!;
    expect(help.label).toBe("Help");
    expect((help.submenu as MenuItemConstructorOptions[]).map((item) => item.id)).toEqual([
      "shortcuts",
    ]);
    expect(help.role).toBe(platform === "darwin" ? "help" : undefined);
  });
});

describe("applicationMenu", () => {
  it.each(PLATFORMS)("never shadows a registered shortcut on %s", (platform) => {
    const mac = platform === "darwin";
    for (const development of [false, true]) {
      const template = applicationMenu(platform, development, ACTIONS);
      for (const { id, role, accelerator } of menuAccelerators(template)) {
        const chord = acceleratorChord(accelerator, mac);
        for (const shortcut of SHORTCUTS) {
          if (!sameChord(chord, registryChord(keysFor(shortcut, true)))) continue;
          if (id === shortcut.id) continue;
          expect(
            SAME_ACTION_ROLES.get(role ?? ""),
            `${accelerator} (${role ?? id ?? "custom"}) shadows ${shortcut.id}`,
          ).toBe(shortcut.id);
        }
      }
    }
  });

  it.each(PLATFORMS)(
    "names every role's accelerator on %s so none falls back silently",
    (platform) => {
      const template = applicationMenu(platform, true, ACTIONS);
      const unkeyed = new Set(["about", "services", "unhide", "zoom", "front", "help"]);
      if (platform === "win32") unkeyed.add("quit");
      for (const item of items(template)) {
        if (!item.role) continue;
        if (unkeyed.has(item.role)) expect(item.accelerator, item.role).toBeUndefined();
        else expect(item.accelerator, item.role).toMatch(/.+/);
      }
    },
  );

  it("keeps developer tools out of the shipped app", () => {
    const shipped = items(applicationMenu("darwin", false, ACTIONS));
    expect(shipped.some((item) => item.role === "toggleDevTools")).toBe(false);
    expect(shipped.some((item) => item.role === "reload")).toBe(false);
    const dev = items(applicationMenu("darwin", true, ACTIONS));
    expect(dev.find((item) => item.role === "toggleDevTools")?.accelerator).toBe("F12");
  });

  it("offers the standard macOS app menu only on macOS", () => {
    expect(applicationMenu("darwin", false, ACTIONS)[0].label).toBe("emdy");
    expect(applicationMenu("win32", false, ACTIONS)[0].label).toBe("File");
  });

  it("reveals the library folder from the File menu with the platform's wording", () => {
    const revealLibrary = vi.fn();
    const labels = PLATFORMS.map((platform) => {
      const file = applicationMenu(platform, false, { ...ACTIONS, revealLibrary }).find(
        (item) => item.label === "File",
      )!;
      const reveal = (file.submenu as MenuItemConstructorOptions[]).find(
        (item) => item.id === "reveal-library",
      )!;
      (reveal.click as () => void)();
      return reveal.label;
    });
    expect(labels).toEqual([
      "Show Library in Finder",
      "Show Library in File Explorer",
      "Open Library Folder",
    ]);
    expect(revealLibrary).toHaveBeenCalledTimes(3);
  });

  it.each(PLATFORMS)("opens Markdown files from the File menu on %s", (platform) => {
    const openFiles = vi.fn();
    const file = applicationMenu(platform, false, { ...ACTIONS, openFiles }).find(
      (item) => item.label === "File",
    )!;
    const [create, open] = file.submenu as MenuItemConstructorOptions[];
    expect(create.id).toBe("new-document");
    expect(open).toMatchObject({ id: "open-files", label: "Open…", accelerator: "CmdOrCtrl+O" });
    (open.click as () => void)();
    expect(openFiles).toHaveBeenCalledTimes(1);
  });

  it.each(PLATFORMS)("zooms through the app so the window chrome can follow on %s", (platform) => {
    const zoom = vi.fn();
    const view = items(applicationMenu(platform, false, { ...ACTIONS, zoom })).find(
      (item) => item.label === "View",
    )!;
    const entries = (view.submenu as MenuItemConstructorOptions[]).filter((item) =>
      ["CmdOrCtrl+0", "CmdOrCtrl+=", "CmdOrCtrl+-"].includes(String(item.accelerator)),
    );
    expect(entries.map((item) => [item.id, item.role])).toEqual([
      ["zoom-reset", undefined],
      ["zoom-in", undefined],
      ["zoom-out", undefined],
    ]);
    for (const item of entries) (item.click as () => void)();
    expect(zoom.mock.calls).toEqual([["reset"], ["in"], ["out"]]);
  });
});
