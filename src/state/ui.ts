import { createSignal, untrack } from "solid-js";
import { layoutMode, setLayoutMode, isEditable } from "./layout";
import { rememberSidebar, sidebarPreference } from "./workspace";

export const SIDEBAR_BREAKPOINT = 900;

export function defaultSidebarOpen(viewportWidth: number): boolean {
  return viewportWidth >= SIDEBAR_BREAKPOINT;
}

export function initialSidebarOpen(viewportWidth: number): boolean {
  return defaultSidebarOpen(viewportWidth) && (sidebarPreference() ?? true);
}

// Seeded once at module init, before the first render, so the sidebar paints in its
// restored state instead of opening and snapping shut once the app settles.
const [sidebarOpen, setSidebarOpenSignal] = createSignal(
  initialSidebarOpen(typeof window === "undefined" ? SIDEBAR_BREAKPOINT : window.innerWidth),
);
const [focusMode, setFocusModeSignal] = createSignal(false);
const [shortcutsOpen, setShortcutsOpenSignal] = createSignal(false);
const [editorFocusRequested, setEditorFocusRequestedSignal] = createSignal(false);
const [searchRequested, setSearchRequestedSignal] = createSignal(false);

export { sidebarOpen, focusMode, shortcutsOpen, editorFocusRequested, searchRequested };

export function setSidebarOpen(open: boolean, viewportWidth = window.innerWidth): void {
  setSidebarOpenSignal(open);
  if (defaultSidebarOpen(viewportWidth)) rememberSidebar(open);
}

export function toggleSidebar(): void {
  setSidebarOpen(!untrack(sidebarOpen));
}

export function setFocusMode(on: boolean): void {
  setFocusModeSignal(on);
}

export function toggleFocusMode(): void {
  setFocusModeSignal((on) => !on);
}

export function setShortcutsOpen(open: boolean): void {
  setShortcutsOpenSignal(open);
}

export function toggleShortcuts(): void {
  setShortcutsOpenSignal((open) => !open);
}

export function requestEditorFocus(): void {
  if (!isEditable(untrack(layoutMode))) setLayoutMode("editor");
  setEditorFocusRequestedSignal(true);
}

export function takeEditorFocusRequest(): boolean {
  if (!untrack(editorFocusRequested)) return false;
  setEditorFocusRequestedSignal(false);
  return true;
}

export function requestSearch(): void {
  setSearchRequestedSignal(true);
}

export function takeSearchRequest(): boolean {
  if (!untrack(searchRequested)) return false;
  setSearchRequestedSignal(false);
  return true;
}

export function resetUiState(): void {
  setSidebarOpenSignal(true);
  setFocusModeSignal(false);
  setShortcutsOpenSignal(false);
  setEditorFocusRequestedSignal(false);
  setSearchRequestedSignal(false);
}
