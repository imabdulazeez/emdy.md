import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { flush } from "solid-js";
import { storageKey } from "~/lib/storage/key-value";
import { layoutMode, resetLayoutState, setLayoutMode } from "./layout";
import {
  SIDEBAR_BREAKPOINT,
  defaultSidebarOpen,
  focusMode,
  initialSidebarOpen,
  resetUiState,
  requestSearch,
  requestEditorFocus,
  searchRequested,
  setFocusMode,
  setShortcutsOpen,
  setSidebarOpen,
  shortcutsOpen,
  sidebarOpen,
  takeSearchRequest,
  takeEditorFocusRequest,
  editorFocusRequested,
  toggleFocusMode,
  toggleShortcuts,
  toggleSidebar,
} from "./ui";
import { resetWorkspaceState, sidebarPreference } from "./workspace";

afterEach(() => {
  resetLayoutState();
  resetUiState();
  resetWorkspaceState();
});

describe("ui state", () => {
  it("opens the sidebar by default on wide screens only", () => {
    expect(defaultSidebarOpen(SIDEBAR_BREAKPOINT)).toBe(true);
    expect(defaultSidebarOpen(SIDEBAR_BREAKPOINT - 1)).toBe(false);
  });

  it("toggles the sidebar", () => {
    expect(sidebarOpen()).toBe(true);
    flush(toggleSidebar);
    expect(sidebarOpen()).toBe(false);
    flush(() => setSidebarOpen(true));
    expect(sidebarOpen()).toBe(true);
  });

  it("remembers the sidebar state from wide viewports only", () => {
    flush(() => setSidebarOpen(false, SIDEBAR_BREAKPOINT));
    expect(sidebarPreference()).toBe(false);
    flush(() => setSidebarOpen(true, SIDEBAR_BREAKPOINT - 1));
    expect(sidebarOpen()).toBe(true);
    expect(sidebarPreference()).toBe(false);
    flush(toggleSidebar);
    expect(sidebarOpen()).toBe(false);
  });

  it("restores the remembered sidebar state on wide viewports and hides it on narrow ones", () => {
    expect(initialSidebarOpen(SIDEBAR_BREAKPOINT)).toBe(true);
    expect(initialSidebarOpen(SIDEBAR_BREAKPOINT - 1)).toBe(false);
    flush(() => setSidebarOpen(false, SIDEBAR_BREAKPOINT));
    expect(initialSidebarOpen(SIDEBAR_BREAKPOINT)).toBe(false);
    expect(initialSidebarOpen(SIDEBAR_BREAKPOINT - 1)).toBe(false);
    flush(() => resetWorkspaceState());
    expect(initialSidebarOpen(SIDEBAR_BREAKPOINT)).toBe(true);
  });

  it("seeds the sidebar from storage and the viewport before anything renders", async () => {
    const key = storageKey("workspace", "sidebar");
    const width = window.innerWidth;
    const load = async (stored: string | null, viewportWidth: number) => {
      if (stored === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, stored);
      Object.defineProperty(window, "innerWidth", { value: viewportWidth, configurable: true });
      vi.resetModules();
      return (await import("./ui")).sidebarOpen();
    };
    try {
      expect(await load(null, SIDEBAR_BREAKPOINT)).toBe(true);
      expect(await load("false", SIDEBAR_BREAKPOINT)).toBe(false);
      expect(await load("true", SIDEBAR_BREAKPOINT)).toBe(true);
      expect(await load("42", SIDEBAR_BREAKPOINT)).toBe(true);
      expect(await load(null, SIDEBAR_BREAKPOINT - 1)).toBe(false);
      expect(await load("true", SIDEBAR_BREAKPOINT - 1)).toBe(false);
    } finally {
      window.localStorage.removeItem(key);
      Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
    }
  });

  it("toggles focus mode", () => {
    expect(focusMode()).toBe(false);
    flush(toggleFocusMode);
    expect(focusMode()).toBe(true);
    flush(toggleFocusMode);
    expect(focusMode()).toBe(false);
    flush(() => setFocusMode(true));
    expect(focusMode()).toBe(true);
  });

  it("toggles the shortcuts panel", () => {
    expect(shortcutsOpen()).toBe(false);
    flush(toggleShortcuts);
    expect(shortcutsOpen()).toBe(true);
    flush(() => setShortcutsOpen(false));
    expect(shortcutsOpen()).toBe(false);
  });

  it("hands an editor focus request to the first taker only", () => {
    expect(editorFocusRequested()).toBe(false);
    expect(takeEditorFocusRequest()).toBe(false);
    flush(requestEditorFocus);
    expect(editorFocusRequested()).toBe(true);
    expect(takeEditorFocusRequest()).toBe(true);
    flush();
    expect(editorFocusRequested()).toBe(false);
    expect(takeEditorFocusRequest()).toBe(false);
  });

  it("switches Read-only preview to Raw Markdown so the editor can take focus", () => {
    flush(() => setLayoutMode("reader"));
    flush(requestEditorFocus);
    expect(layoutMode()).toBe("editor");
    expect(editorFocusRequested()).toBe(true);
  });

  it("keeps an editing layout when the editor is asked for focus", () => {
    flush(() => setLayoutMode("preview"));
    flush(requestEditorFocus);
    expect(layoutMode()).toBe("preview");
  });

  it("hands a search request to the first taker only", () => {
    expect(searchRequested()).toBe(false);
    expect(takeSearchRequest()).toBe(false);
    flush(requestSearch);
    expect(searchRequested()).toBe(true);
    expect(takeSearchRequest()).toBe(true);
    flush();
    expect(searchRequested()).toBe(false);
    expect(takeSearchRequest()).toBe(false);
  });

  it("drops a pending search request on reset", () => {
    flush(requestSearch);
    flush(resetUiState);
    expect(searchRequested()).toBe(false);
  });

  it("drops a pending title edit request on reset", () => {
    flush(requestEditorFocus);
    flush(resetUiState);
    expect(editorFocusRequested()).toBe(false);
  });
});
