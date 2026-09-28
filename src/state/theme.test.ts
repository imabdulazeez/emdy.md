import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { flush } from "solid-js";
import { NO_TRANSITIONS_ATTRIBUTE } from "~/lib/transitions";
import { BUILT_IN_THEMES, DEFAULT_THEME, THEME_ROLES } from "~/lib/themes/palettes";
import { customThemes, saveCustomTheme } from "./custom-themes";
import {
  activeTheme,
  applyTheme,
  applyThemeAttribute,
  applyThemeColors,
  findTheme,
  isThemeId,
  palette,
  removeCustomTheme,
  selectTheme,
  isThemePreference,
  nextThemePreference,
  prefersDarkScheme,
  resetThemeState,
  resolveTheme,
  resolvedTheme,
  setSystemPrefersDark,
  setThemePreference,
  themePreference,
  watchSystemTheme,
} from "./theme";

function stubViewTransition(start: (update: () => void) => unknown) {
  Object.defineProperty(document, "startViewTransition", { value: start, configurable: true });
}

afterEach(() => {
  resetThemeState();
  delete document.documentElement.dataset.theme;
  document.documentElement.removeAttribute("style");
  document.documentElement.removeAttribute(NO_TRANSITIONS_ATTRIBUTE);
  Reflect.deleteProperty(document, "startViewTransition");
  vi.restoreAllMocks();
});

function mediaList(matching: string[]) {
  return vi.fn(
    (query: string) =>
      ({
        matches: matching.includes(query),
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

function queueFrames() {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  return () => frames.splice(0).forEach((callback) => callback(0));
}

const night = {
  id: "custom-night",
  name: "Night",
  light: { ...DEFAULT_THEME.light, accent: "#cc3366" },
  dark: DEFAULT_THEME.dark,
};

describe("colour themes", () => {
  it("defaults to the Paper theme", () => {
    expect(palette.value()).toBe("paper");
    expect(activeTheme()).toBe(DEFAULT_THEME);
  });

  it("selects built-in and custom themes and persists the choice", () => {
    flush(() => selectTheme("iris"));
    expect(activeTheme()).toBe(BUILT_IN_THEMES.find((theme) => theme.id === "iris"));
    expect(window.localStorage.getItem("emdy:pref:palette")).toBe('"iris"');
    flush(() => {
      saveCustomTheme(night);
      selectTheme(night.id);
    });
    expect(activeTheme()).toEqual(night);
  });

  it("falls back to Paper when the chosen theme is missing", () => {
    flush(() => selectTheme("custom-gone"));
    expect(activeTheme()).toBe(DEFAULT_THEME);
  });

  it("finds themes by id among built-ins and custom themes", () => {
    expect(findTheme("sepia")?.name).toBe("Sepia");
    expect(findTheme("custom-night", [night])).toBe(night);
    expect(findTheme("custom-night")).toBeUndefined();
  });

  it("validates stored theme ids", () => {
    expect(isThemeId("paper")).toBe(true);
    expect(isThemeId("custom-night-2")).toBe(true);
    expect(isThemeId("Paper")).toBe(false);
    expect(isThemeId("")).toBe(false);
    expect(isThemeId(3)).toBe(false);
  });

  it("returns to Paper when the active custom theme is deleted", () => {
    flush(() => {
      saveCustomTheme(night);
      selectTheme(night.id);
    });
    flush(() => removeCustomTheme(night.id));
    expect(customThemes()).toEqual([]);
    expect(palette.value()).toBe("paper");
  });

  it("keeps the selection when another custom theme is deleted", () => {
    flush(() => {
      saveCustomTheme(night);
      selectTheme("sage");
    });
    flush(() => removeCustomTheme(night.id));
    flush(() => removeCustomTheme("custom-unknown"));
    expect(palette.value()).toBe("sage");
  });

  it("writes every role as a custom property", () => {
    const root = document.createElement("div");
    applyThemeColors(night.light, root);
    for (const role of THEME_ROLES) {
      expect(root.style.getPropertyValue(`--color-${role}`)).toBe(night.light[role]);
    }
  });

  it("resets the choice and custom themes together", () => {
    flush(() => {
      saveCustomTheme(night);
      selectTheme(night.id);
    });
    flush(() => resetThemeState());
    expect(palette.value()).toBe("paper");
    expect(customThemes()).toEqual([]);
  });
});

describe("theme state", () => {
  it("defaults to system", () => {
    expect(themePreference()).toBe("system");
    expect(resolvedTheme()).toBe("light");
  });

  it("resolves explicit preferences regardless of the system", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("follows the system when preference is system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    flush(() => setSystemPrefersDark(true));
    expect(resolvedTheme()).toBe("dark");
    flush(() => setThemePreference("light"));
    expect(resolvedTheme()).toBe("light");
  });

  it("cycles preferences", () => {
    expect(nextThemePreference("light")).toBe("dark");
    expect(nextThemePreference("dark")).toBe("system");
    expect(nextThemePreference("system")).toBe("light");
  });

  it("persists the preference and restores it from storage", async () => {
    flush(() => setThemePreference("dark"));
    expect(window.localStorage.getItem("emdy:pref:theme")).toBe('"dark"');
    vi.resetModules();
    const fresh = await import("./theme");
    expect(fresh.themePreference()).toBe("dark");
    fresh.resetThemeState();
    expect(window.localStorage.getItem("emdy:pref:theme")).toBeNull();
  });

  it("ignores an invalid stored preference", async () => {
    window.localStorage.setItem("emdy:pref:theme", '"purple"');
    vi.resetModules();
    const fresh = await import("./theme");
    expect(fresh.themePreference()).toBe("system");
    window.localStorage.removeItem("emdy:pref:theme");
  });

  it("validates preferences", () => {
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("blue")).toBe(false);
  });

  it("applies the theme attribute to the root element", () => {
    const root = document.createElement("div");
    applyThemeAttribute("dark", root);
    expect(root.dataset.theme).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
    applyThemeAttribute("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("watches the system preference and cleans up", () => {
    let listener: ((event: MediaQueryListEvent) => void) | undefined;
    const remove = vi.fn();
    const matchMedia = vi.fn(() => ({
      matches: true,
      addEventListener: (_: string, cb: (event: MediaQueryListEvent) => void) => {
        listener = cb;
      },
      removeEventListener: remove,
    }));
    let stop = () => {};
    flush(() => {
      stop = watchSystemTheme({ matchMedia } as unknown as Window);
    });
    expect(matchMedia).toHaveBeenCalledWith("(prefers-color-scheme: dark)");
    expect(resolvedTheme()).toBe("dark");
    flush(() => listener?.({ matches: false } as MediaQueryListEvent));
    expect(resolvedTheme()).toBe("light");
    stop();
    expect(remove).toHaveBeenCalled();
  });

  it("is a no-op without matchMedia", () => {
    expect(() => watchSystemTheme({} as Window)()).not.toThrow();
  });

  it("reads the system colour scheme", () => {
    expect(prefersDarkScheme({ matchMedia: mediaList(["(prefers-color-scheme: dark)"]) })).toBe(
      true,
    );
    expect(prefersDarkScheme({ matchMedia: mediaList([]) })).toBe(false);
    expect(prefersDarkScheme({})).toBe(false);
  });

  it("starts from the system colour scheme before the watcher runs", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation(mediaList(["(prefers-color-scheme: dark)"]));
    vi.resetModules();
    const fresh = await import("./theme");
    expect(fresh.themePreference()).toBe("system");
    expect(fresh.resolvedTheme()).toBe("dark");
  });
});

describe("theme switching", () => {
  it("leaves the first-paint theme alone when it already matches", () => {
    const root = document.documentElement;
    root.dataset.theme = "dark";
    root.style.colorScheme = "dark";
    const set = vi.spyOn(root, "setAttribute");
    applyThemeAttribute("dark");
    expect(set).not.toHaveBeenCalled();
    expect(root.hasAttribute(NO_TRANSITIONS_ATTRIBUTE)).toBe(false);
  });

  it("suppresses transitions until the new theme has been painted", () => {
    const runFrames = queueFrames();
    const root = document.createElement("div");
    applyThemeAttribute("light", root);
    runFrames();
    runFrames();
    applyThemeAttribute("dark", root);
    expect(root.dataset.theme).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
    expect(root.hasAttribute(NO_TRANSITIONS_ATTRIBUTE)).toBe(true);
    runFrames();
    expect(root.hasAttribute(NO_TRANSITIONS_ATTRIBUTE)).toBe(true);
    runFrames();
    expect(root.hasAttribute(NO_TRANSITIONS_ATTRIBUTE)).toBe(false);
  });

  it("keeps transitions suppressed across overlapping switches", () => {
    const runFrames = queueFrames();
    const root = document.createElement("div");
    applyThemeAttribute("light", root);
    runFrames();
    applyThemeAttribute("dark", root);
    runFrames();
    expect(root.hasAttribute(NO_TRANSITIONS_ATTRIBUTE)).toBe(true);
    runFrames();
    expect(root.hasAttribute(NO_TRANSITIONS_ATTRIBUTE)).toBe(false);
  });

  it("does nothing when the requested theme is already applied", () => {
    const runFrames = queueFrames();
    const root = document.createElement("div");
    applyThemeAttribute("dark", root);
    runFrames();
    runFrames();
    applyThemeAttribute("dark", root);
    expect(root.hasAttribute(NO_TRANSITIONS_ATTRIBUTE)).toBe(false);
  });

  it("crossfades a change of theme when the browser supports view transitions", () => {
    queueFrames();
    const root = document.documentElement;
    vi.spyOn(window, "matchMedia").mockImplementation(mediaList([]));
    const updates: Array<() => void> = [];
    const start = vi.fn((update: () => void) => updates.push(update));
    applyThemeAttribute("light");
    stubViewTransition(start);
    applyThemeAttribute("dark");
    expect(start).toHaveBeenCalledTimes(1);
    expect(root.dataset.theme).toBe("light");
    updates[0]();
    expect(root.dataset.theme).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
  });

  it("applies the latest request when a crossfade is overtaken", () => {
    queueFrames();
    const root = document.documentElement;
    vi.spyOn(window, "matchMedia").mockImplementation(mediaList([]));
    const updates: Array<() => void> = [];
    applyThemeAttribute("light");
    stubViewTransition((update: () => void) => updates.push(update));
    applyThemeAttribute("dark");
    applyThemeAttribute("light");
    expect(root.dataset.theme).toBe("light");
    updates[0]();
    expect(root.dataset.theme).toBe("light");
  });

  it("does not crossfade on first application", () => {
    queueFrames();
    const start = vi.fn();
    stubViewTransition(start);
    vi.spyOn(window, "matchMedia").mockImplementation(mediaList([]));
    applyThemeAttribute("dark");
    expect(start).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("swaps instantly when the user prefers reduced motion", () => {
    queueFrames();
    const start = vi.fn();
    vi.spyOn(window, "matchMedia").mockImplementation(
      mediaList(["(prefers-reduced-motion: reduce)"]),
    );
    applyThemeAttribute("light");
    stubViewTransition(start);
    applyThemeAttribute("dark");
    expect(start).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("swaps elements other than the document root without a crossfade", () => {
    const start = vi.fn();
    stubViewTransition(start);
    const root = document.createElement("div");
    root.dataset.theme = "light";
    applyThemeAttribute("dark", root);
    expect(start).not.toHaveBeenCalled();
    expect(root.dataset.theme).toBe("dark");
  });
  it("paints theme colours inside the crossfade so the old snapshot keeps the old palette", () => {
    queueFrames();
    const root = document.documentElement;
    vi.spyOn(window, "matchMedia").mockImplementation(mediaList([]));
    const updates: Array<() => void> = [];
    applyTheme("light", DEFAULT_THEME.light);
    expect(root.style.getPropertyValue("--color-canvas")).toBe(DEFAULT_THEME.light.canvas);
    stubViewTransition((update: () => void) => updates.push(update));
    applyTheme("dark", DEFAULT_THEME.dark);
    expect(root.style.getPropertyValue("--color-canvas")).toBe(DEFAULT_THEME.light.canvas);
    updates[0]();
    expect(root.dataset.theme).toBe("dark");
    expect(root.style.getPropertyValue("--color-canvas")).toBe(DEFAULT_THEME.dark.canvas);
  });

  it("paints the latest colours when the palette changes during a crossfade", () => {
    queueFrames();
    const sage = BUILT_IN_THEMES.find((entry) => entry.id === "sage")!;
    const root = document.documentElement;
    vi.spyOn(window, "matchMedia").mockImplementation(mediaList([]));
    const updates: Array<() => void> = [];
    applyTheme("light", DEFAULT_THEME.light);
    stubViewTransition((update: () => void) => updates.push(update));
    applyTheme("dark", DEFAULT_THEME.dark);
    applyTheme("dark", sage.dark);
    updates.forEach((update) => update());
    expect(root.style.getPropertyValue("--color-canvas")).toBe(sage.dark.canvas);
  });

  it("swaps the palette instantly when the appearance is unchanged", () => {
    queueFrames();
    const sage = BUILT_IN_THEMES.find((entry) => entry.id === "sage")!;
    const root = document.documentElement;
    const start = vi.fn();
    vi.spyOn(window, "matchMedia").mockImplementation(mediaList([]));
    applyTheme("light", DEFAULT_THEME.light);
    stubViewTransition(start);
    applyTheme("light", sage.light);
    expect(start).not.toHaveBeenCalled();
    expect(root.hasAttribute(NO_TRANSITIONS_ATTRIBUTE)).toBe(true);
    expect(root.style.getPropertyValue("--color-accent")).toBe(sage.light.accent);
  });

  it("leaves matching first-paint colours untouched on a repeat request", () => {
    const root = document.documentElement;
    applyTheme("light", DEFAULT_THEME.light);
    root.style.setProperty("--color-canvas", "#000000");
    applyTheme("light", DEFAULT_THEME.light);
    expect(root.style.getPropertyValue("--color-canvas")).toBe("#000000");
  });
});
