import { createSignal } from "solid-js";
import { desktopBridge, type DesktopBridge, type LibraryLocation } from "~/lib/desktop/bridge";
import { flushPersistence } from "~/lib/storage/persisted";
import { reopenLibrary, retryLibrarySave, syncLibrary } from "./library";

const [location, setLocation] = createSignal<LibraryLocation | null>(null);

export const libraryLocation = location;

export interface DesktopSyncWindow {
  addEventListener: Window["addEventListener"];
  removeEventListener: Window["removeEventListener"];
}

export async function loadLibraryLocation(
  bridge: DesktopBridge | null = desktopBridge(),
): Promise<void> {
  if (!bridge) return;
  const next = await bridge.library.location();
  setLocation(() => next);
}

export async function chooseLibraryFolder(
  bridge: DesktopBridge | null = desktopBridge(),
): Promise<boolean> {
  if (!bridge) return false;
  await retryLibrarySave();
  const chosen = await bridge.library.choose();
  if (!chosen) return false;
  setLocation(() => chosen);
  await reopenLibrary();
  return true;
}

export async function revealLibraryFolder(
  bridge: DesktopBridge | null = desktopBridge(),
): Promise<void> {
  await bridge?.library.reveal();
}

export function startDesktopSync(
  bridge: DesktopBridge | null = desktopBridge(),
  win: DesktopSyncWindow = window,
): () => void {
  if (!bridge) return () => {};
  void loadLibraryLocation(bridge);
  const refresh = () => void syncLibrary();
  const stopChanges = bridge.library.onChange(refresh);
  const stopClose = bridge.window.onBeforeClose(async () => {
    flushPersistence();
    await retryLibrarySave();
  });
  win.addEventListener("focus", refresh);
  return () => {
    stopChanges();
    stopClose();
    win.removeEventListener("focus", refresh);
  };
}

export function resetDesktopState(): void {
  setLocation(null);
}
