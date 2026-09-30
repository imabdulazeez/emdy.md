import type { KeyBinding } from "@codemirror/view";
import { describe, expect, it, vi } from "vite-plus/test";
import { isContextMenuKey } from "~/components/ui/context-menu";
import { editorKeymap, formattingKeymap } from "~/lib/editor/extensions";
import {
  GLOBAL_SHORTCUTS,
  SHORTCUT_GROUPS,
  SHORTCUTS,
  ariaKeyShortcuts,
  formatShortcut,
  handleGlobalShortcut,
  isGlobalShortcutId,
  isMacPlatform,
  keysFor,
  matchesShortcut,
  parseShortcut,
  runGlobalShortcut,
  shortcutKeys,
  shortcutTitle,
  type KeyEventLike,
  type ShortcutId,
} from "./shortcuts";

function key(overrides: Partial<Parameters<typeof matchesShortcut>[0]> & { key: string }) {
  return { metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...overrides };
}

describe("parseShortcut", () => {
  it("parses modifiers and keys", () => {
    expect(parseShortcut("Mod-Shift-f")).toEqual({ mod: true, shift: true, alt: false, key: "f" });
    expect(parseShortcut("Escape")).toEqual({
      mod: false,
      shift: false,
      alt: false,
      key: "Escape",
    });
    expect(parseShortcut("Mod-\\")).toEqual({ mod: true, shift: false, alt: false, key: "\\" });
  });
});

describe("formatShortcut", () => {
  it("formats for mac", () => {
    expect(formatShortcut("Mod-Shift-f", true)).toBe("⌘⇧F");
    expect(formatShortcut("Mod-/", true)).toBe("⌘/");
    expect(formatShortcut("Escape", true)).toBe("Esc");
  });

  it("formats for other platforms", () => {
    expect(formatShortcut("Mod-Shift-f", false)).toBe("Ctrl+Shift+F");
    expect(formatShortcut("Mod-1", false)).toBe("Ctrl+1");
    expect(formatShortcut("Shift-Tab", false)).toBe("Shift+Tab");
  });
});

describe("ariaKeyShortcuts", () => {
  it("produces aria-keyshortcuts values for each platform", () => {
    expect(ariaKeyShortcuts("Mod-Shift-x", true)).toBe("Meta+Shift+X");
    expect(ariaKeyShortcuts("Mod-Alt-1", false)).toBe("Control+Alt+1");
    expect(ariaKeyShortcuts("Escape", false)).toBe("Escape");
  });
});

describe("matchesShortcut", () => {
  it("uses meta on mac and ctrl elsewhere", () => {
    expect(matchesShortcut(key({ key: "1", metaKey: true }), "Mod-1", true)).toBe(true);
    expect(matchesShortcut(key({ key: "1", ctrlKey: true }), "Mod-1", true)).toBe(false);
    expect(matchesShortcut(key({ key: "1", ctrlKey: true }), "Mod-1", false)).toBe(true);
    expect(matchesShortcut(key({ key: "1", metaKey: true }), "Mod-1", false)).toBe(false);
  });

  it("requires exact modifier state", () => {
    expect(
      matchesShortcut(key({ key: "F", metaKey: true, shiftKey: true }), "Mod-Shift-f", true),
    ).toBe(true);
    expect(matchesShortcut(key({ key: "f", metaKey: true }), "Mod-Shift-f", true)).toBe(false);
    expect(matchesShortcut(key({ key: "f", metaKey: true, altKey: true }), "Mod-f", true)).toBe(
      false,
    );
  });

  it("falls back to the physical key when Alt changes the character", () => {
    const mac = key({ key: "Ç", code: "KeyC", metaKey: true, altKey: true, shiftKey: true });
    expect(matchesShortcut(mac, "Mod-Alt-Shift-c", true)).toBe(true);
    expect(matchesShortcut(mac, "Mod-Alt-Shift-x", true)).toBe(false);
    expect(
      matchesShortcut(
        key({ key: "¡", code: "Digit1", ctrlKey: true, altKey: true }),
        "Mod-Alt-1",
        false,
      ),
    ).toBe(false);
    expect(
      matchesShortcut(
        key({ key: "Ć", code: "KeyC", ctrlKey: true, altKey: true, shiftKey: true }),
        "Mod-Alt-Shift-c",
        false,
      ),
    ).toBe(false);
    expect(matchesShortcut(key({ key: "ç", code: "KeyC", metaKey: true }), "Mod-c", true)).toBe(
      false,
    );
  });

  it("matches non-character keys by name", () => {
    expect(matchesShortcut(key({ key: "Escape" }), "Escape", true)).toBe(true);
  });
});

const globalHandlers = () => ({
  setLayout: vi.fn(),
  toggleSidebar: vi.fn(),
  toggleFocusMode: vi.fn(),
  toggleShortcuts: vi.fn(),
  toggleSettings: vi.fn(),
  focusSearch: vi.fn(),
  createDocument: vi.fn(),
  save: vi.fn(),
});

describe("handleGlobalShortcut", () => {
  const handlers = globalHandlers;

  it("switches layouts with Mod-1/2/3", () => {
    const h = handlers();
    expect(handleGlobalShortcut(key({ key: "1", ctrlKey: true }), h, false)).toBe(true);
    expect(handleGlobalShortcut(key({ key: "2", ctrlKey: true }), h, false)).toBe(true);
    expect(handleGlobalShortcut(key({ key: "3", ctrlKey: true }), h, false)).toBe(true);
    expect(handleGlobalShortcut(key({ key: "4", ctrlKey: true }), h, false)).toBe(false);
    expect(h.setLayout.mock.calls).toEqual([["editor"], ["preview"], ["reader"]]);
  });

  it("toggles sidebar, focus mode, and shortcuts", () => {
    const h = handlers();
    expect(handleGlobalShortcut(key({ key: "\\", metaKey: true }), h, true)).toBe(true);
    expect(handleGlobalShortcut(key({ key: "F", metaKey: true, shiftKey: true }), h, true)).toBe(
      true,
    );
    expect(handleGlobalShortcut(key({ key: "/", metaKey: true }), h, true)).toBe(true);
    expect(h.toggleSidebar).toHaveBeenCalledTimes(1);
    expect(h.toggleFocusMode).toHaveBeenCalledTimes(1);
    expect(h.toggleShortcuts).toHaveBeenCalledTimes(1);
  });

  it("opens settings with Mod-,", () => {
    const h = handlers();
    expect(handleGlobalShortcut(key({ key: ",", metaKey: true }), h, true)).toBe(true);
    expect(handleGlobalShortcut(key({ key: ",", ctrlKey: true }), h, false)).toBe(true);
    expect(h.toggleSettings).toHaveBeenCalledTimes(2);
  });

  it("focuses document search with Mod-p", () => {
    const h = handlers();
    expect(handleGlobalShortcut(key({ key: "p", metaKey: true }), h, true)).toBe(true);
    expect(handleGlobalShortcut(key({ key: "P", ctrlKey: true }), h, false)).toBe(true);
    expect(handleGlobalShortcut(key({ key: "p", ctrlKey: true }), h, true)).toBe(false);
    expect(handleGlobalShortcut(key({ key: "P", metaKey: true, shiftKey: true }), h, true)).toBe(
      false,
    );
    expect(h.focusSearch).toHaveBeenCalledTimes(2);
  });

  it("creates a document with Mod-Alt-N in the browser", () => {
    const h = handlers();
    expect(
      handleGlobalShortcut(key({ key: "n", metaKey: true, altKey: true }), h, true, false),
    ).toBe(true);
    expect(
      handleGlobalShortcut(
        key({ key: "Dead", code: "KeyN", metaKey: true, altKey: true }),
        h,
        true,
        false,
      ),
    ).toBe(true);
    expect(
      handleGlobalShortcut(key({ key: "n", ctrlKey: true, altKey: true }), h, false, false),
    ).toBe(true);
    expect(handleGlobalShortcut(key({ key: "n", metaKey: true }), h, true, false)).toBe(false);
    expect(handleGlobalShortcut(key({ key: "n", ctrlKey: true }), h, false, false)).toBe(false);
    expect(h.createDocument).toHaveBeenCalledTimes(3);
  });

  it("creates a document with Mod-N in the desktop app", () => {
    const h = handlers();
    expect(handleGlobalShortcut(key({ key: "n", metaKey: true }), h, true, true)).toBe(true);
    expect(handleGlobalShortcut(key({ key: "N", ctrlKey: true }), h, false, true)).toBe(true);
    expect(handleGlobalShortcut(key({ key: "n", ctrlKey: true }), h, true, true)).toBe(false);
    expect(
      handleGlobalShortcut(key({ key: "n", metaKey: true, altKey: true }), h, true, true),
    ).toBe(false);
    expect(
      handleGlobalShortcut(key({ key: "N", metaKey: true, shiftKey: true }), h, true, true),
    ).toBe(false);
    expect(h.createDocument).toHaveBeenCalledTimes(2);
  });

  it("saves with Mod-S in the browser and the desktop app", () => {
    const h = handlers();
    expect(handleGlobalShortcut(key({ key: "s", metaKey: true }), h, true, false)).toBe(true);
    expect(handleGlobalShortcut(key({ key: "s", ctrlKey: true }), h, false, true)).toBe(true);
    expect(handleGlobalShortcut(key({ key: "S", metaKey: true, shiftKey: true }), h, true)).toBe(
      false,
    );
    expect(h.save).toHaveBeenCalledTimes(2);
  });

  it("ignores unrelated keys", () => {
    const h = handlers();
    expect(handleGlobalShortcut(key({ key: "a" }), h, true)).toBe(false);
    expect(handleGlobalShortcut(key({ key: "b", metaKey: true }), h, true)).toBe(false);
  });
});

describe("runGlobalShortcut", () => {
  it("runs a global command by id, as the desktop menu does", () => {
    const h = globalHandlers();
    expect(runGlobalShortcut("new-document", h)).toBe(true);
    expect(runGlobalShortcut("layout-reader", h)).toBe(true);
    expect(runGlobalShortcut("save", h)).toBe(true);
    expect(h.createDocument).toHaveBeenCalledTimes(1);
    expect(h.setLayout).toHaveBeenCalledWith("reader");
    expect(h.save).toHaveBeenCalledTimes(1);
  });

  it("refuses ids that are not global commands", () => {
    const h = globalHandlers();
    expect(runGlobalShortcut("bold", h)).toBe(false);
    expect(Object.values(h).every((spy) => spy.mock.calls.length === 0)).toBe(true);
    expect(isGlobalShortcutId("settings")).toBe(true);
    expect(isGlobalShortcutId("bold")).toBe(false);
    expect(isGlobalShortcutId("nope")).toBe(false);
    expect(isGlobalShortcutId(3)).toBe(false);
  });
});

describe("isMacPlatform", () => {
  it("detects mac from platform or user agent", () => {
    expect(isMacPlatform({ platform: "MacIntel", userAgent: "" })).toBe(true);
    expect(
      isMacPlatform({ platform: "", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)" }),
    ).toBe(true);
    expect(isMacPlatform({ platform: "Win32", userAgent: "Windows" })).toBe(false);
    expect(isMacPlatform(undefined)).toBe(false);
  });
});

describe("SHORTCUTS", () => {
  it("has unique ids and known groups", () => {
    const ids = new Set(SHORTCUTS.map((shortcut) => shortcut.id));
    expect(ids.size).toBe(SHORTCUTS.length);
    for (const shortcut of SHORTCUTS) expect(SHORTCUT_GROUPS).toContain(shortcut.group);
  });

  it.each([false, true])(
    "gives each action its own keys, except the Escape chain in AppShell (desktop: %s)",
    (desktop) => {
      const byKeys = new Map<string, string[]>();
      for (const shortcut of SHORTCUTS) {
        const keys = keysFor(shortcut, desktop);
        byKeys.set(keys, [...(byKeys.get(keys) ?? []), shortcut.id]);
      }
      const shared = [...byKeys.values()].filter((ids) => ids.length > 1);
      expect(shared).toEqual([["exit-focus", "close-settings"]]);
    },
  );

  it("overrides keys only for browser-reserved combinations the desktop app can claim", () => {
    const reserved = new Set(["Mod-n", "Mod-t", "Mod-w", "Mod-q", "Mod-Tab", "F5", "F12"]);
    for (const shortcut of SHORTCUTS) {
      expect(reserved.has(shortcut.keys), shortcut.id).toBe(false);
      if ("desktopKeys" in shortcut) {
        expect(shortcut.desktopKeys, shortcut.id).not.toBe(shortcut.keys);
        expect(reserved.has(shortcut.desktopKeys), shortcut.id).toBe(true);
      }
    }
  });
});

describe("shortcutKeys and shortcutTitle", () => {
  it("looks up registered keys by id", () => {
    expect(shortcutKeys("bold")).toBe("Mod-b");
    expect(shortcutKeys("layout-reader")).toBe("Mod-3");
    expect(shortcutKeys("context-menu")).toBe("Shift-F10");
  });

  it("uses the desktop keys only in the desktop app", () => {
    expect(shortcutKeys("new-document")).toBe("Mod-Alt-n");
    expect(shortcutKeys("new-document", false)).toBe("Mod-Alt-n");
    expect(shortcutKeys("new-document", true)).toBe("Mod-n");
    expect(shortcutKeys("bold", true)).toBe("Mod-b");
  });

  it("lists the table copy shortcut under Editing", () => {
    expect(SHORTCUTS.find((shortcut) => shortcut.id === "copy-table")?.group).toBe("Editing");
    expect(formatShortcut(shortcutKeys("copy-table"), false)).toBe("Ctrl+Alt+Shift+C");
    expect(formatShortcut(shortcutKeys("copy-table"), true)).toBe("⌘⌥⇧C");
  });

  it("names the action and its shortcut", () => {
    expect(shortcutTitle("Bold", "Mod-b", true)).toBe("Bold (⌘B)");
    expect(shortcutTitle("Focus mode", "Mod-Shift-f", false)).toBe("Focus mode (Ctrl+Shift+F)");
    expect(shortcutTitle("Exit focus mode", "Escape", false)).toBe("Exit focus mode (Esc)");
  });
});

// The registry is only honest if every entry is actually bound. These tests fail when a
// binding is added, removed, or rekeyed without the registry (and so the panel and tooltips).
describe("SHORTCUTS bindings", () => {
  type Platform = "mac" | "win" | "linux";
  const PLATFORMS: readonly Platform[] = ["mac", "win", "linux"];
  const MODIFIERS: Record<string, string> = {
    mod: "mod",
    cmd: "meta",
    meta: "meta",
    m: "meta",
    ctrl: "ctrl",
    control: "ctrl",
    c: "ctrl",
    alt: "alt",
    a: "alt",
    shift: "shift",
    s: "shift",
  };

  /** Canonical form of a CodeMirror key name on one platform, e.g. "ctrl-shift-z". */
  function normalize(keys: string, platform: Platform): string {
    const parts = keys.split("-");
    const key = parts.pop() ?? "";
    const modifiers = parts.map((part) => {
      const name = MODIFIERS[part.toLowerCase()];
      if (name === "mod") return platform === "mac" ? "meta" : "ctrl";
      return name;
    });
    return [...new Set(modifiers)]
      .sort()
      .concat(key.length === 1 ? key.toLowerCase() : key)
      .join("-");
  }

  function bound(keymap: readonly KeyBinding[], platform: Platform): Set<string> {
    const keys = new Set<string>();
    for (const binding of keymap) {
      const key = binding[platform] ?? binding.key;
      if (!key) continue;
      keys.add(normalize(key, platform));
      if (binding.shift) keys.add(normalize(`Shift-${key}`, platform));
    }
    return keys;
  }

  function eventFor(keys: string, mac: boolean): KeyEventLike {
    const parsed = parseShortcut(keys);
    return {
      key: parsed.shift && parsed.key.length === 1 ? parsed.key.toUpperCase() : parsed.key,
      metaKey: mac && parsed.mod,
      ctrlKey: !mac && parsed.mod,
      shiftKey: parsed.shift,
      altKey: parsed.alt,
    };
  }

  const handlers = () => ({
    setLayout: vi.fn(),
    toggleSidebar: vi.fn(),
    toggleFocusMode: vi.fn(),
    toggleShortcuts: vi.fn(),
    toggleSettings: vi.fn(),
    focusSearch: vi.fn(),
    createDocument: vi.fn(),
    save: vi.fn(),
  });

  const globalIds = new Set<ShortcutId>(GLOBAL_SHORTCUTS.map(([id]) => id));

  /** Entries bound by a component rather than the editor keymap or the global handler. */
  const COMPONENT_BINDINGS: Partial<Record<ShortcutId, (keys: string, mac: boolean) => boolean>> = {
    // AppShell's window listener closes the shortcuts panel, then settings, then focus mode;
    // AppShell.test.tsx drives each case with the real key.
    "exit-focus": (keys) => keys === "Escape",
    "close-settings": (keys) => keys === "Escape",
    "context-menu": (keys, mac) =>
      isContextMenuKey(new KeyboardEvent("keydown", eventFor(keys, mac)), mac),
    // The table editor listens on the editor DOM, since grid inputs never reach CodeMirror.
    "copy-table": (keys, mac) =>
      matchesShortcut(new KeyboardEvent("keydown", eventFor(keys, mac)), keys, mac),
  };

  const bindings = [false, true].flatMap((desktop) =>
    SHORTCUTS.filter((shortcut) => !desktop || "desktopKeys" in shortcut).map(
      (shortcut) => [shortcut.id, keysFor(shortcut, desktop), desktop] as const,
    ),
  );

  it.each(bindings)("binds %s (%s, desktop: %s)", (id, keys, desktop) => {
    if (globalIds.has(id)) {
      for (const mac of [true, false]) {
        const h = handlers();
        expect(handleGlobalShortcut(eventFor(keys, mac), h, mac, desktop)).toBe(true);
        const calls = Object.values(h).reduce((sum, spy) => sum + spy.mock.calls.length, 0);
        expect(calls).toBe(1);
      }
      return;
    }
    const component = COMPONENT_BINDINGS[id];
    if (component) {
      expect(component(keys, true)).toBe(true);
      expect(component(keys, false)).toBe(true);
      return;
    }
    for (const platform of PLATFORMS) {
      expect(bound(editorKeymap, platform), `${id} on ${platform}`).toContain(
        normalize(keys, platform),
      );
    }
  });

  it("lists every key the app binds in the editor", () => {
    const registered = new Set<string>(SHORTCUTS.map((shortcut) => shortcut.keys));
    const unlisted = formattingKeymap
      .map((binding) => binding.key ?? "")
      .filter((key) => key !== "Backspace" && !registered.has(key));
    expect(unlisted).toEqual([]);
  });

  it.each([false, true])(
    "never shadows an editor binding with a global shortcut (desktop: %s)",
    (desktop) => {
      for (const [id] of GLOBAL_SHORTCUTS) {
        for (const platform of PLATFORMS) {
          expect(bound(editorKeymap, platform), `${id} on ${platform}`).not.toContain(
            normalize(shortcutKeys(id, desktop), platform),
          );
        }
      }
    },
  );
});
