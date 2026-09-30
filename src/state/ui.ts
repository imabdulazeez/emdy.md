import { createSignal, untrack } from "solid-js";
import { layoutMode, setLayoutMode, isEditable } from "./layout";

const [sidebarOpen, setSidebarOpenSignal] = createSignal(false);
const [focusMode, setFocusModeSignal] = createSignal(false);
const [shortcutsOpen, setShortcutsOpenSignal] = createSignal(false);
const [editorFocusRequested, setEditorFocusRequestedSignal] = createSignal(false);
const [searchRequested, setSearchRequestedSignal] = createSignal(false);

export { sidebarOpen, focusMode, shortcutsOpen, editorFocusRequested, searchRequested };

export function setSidebarOpen(open: boolean): void {
  setSidebarOpenSignal(open);
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
  setSidebarOpenSignal(false);
  setFocusModeSignal(false);
  setShortcutsOpenSignal(false);
  setEditorFocusRequestedSignal(false);
  setSearchRequestedSignal(false);
}
