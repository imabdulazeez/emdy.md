import { afterEach, describe, expect, it } from "vite-plus/test";
import { flush } from "solid-js";
import { storageKey } from "~/lib/storage/key-value";
import { layoutMode, resetLayoutState, setLayoutMode } from "./layout";
import {
  focusMode,
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
import { resetWorkspaceState } from "./workspace";

afterEach(() => {
  resetLayoutState();
  resetUiState();
  resetWorkspaceState();
});

describe("ui state", () => {
  it("keeps the narrow-screen drawer shut until asked and never persists it", () => {
    expect(sidebarOpen()).toBe(false);
    flush(toggleSidebar);
    expect(sidebarOpen()).toBe(true);
    flush(() => setSidebarOpen(false));
    expect(sidebarOpen()).toBe(false);
    flush(() => setSidebarOpen(true));
    expect(window.localStorage.getItem(storageKey("workspace", "sidebar"))).toBeNull();
    flush(resetUiState);
    expect(sidebarOpen()).toBe(false);
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
