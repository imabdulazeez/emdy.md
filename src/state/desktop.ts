import { createSignal, flush, untrack } from "solid-js";
import {
  desktopBridge,
  type DesktopBridge,
  type LibraryLocation,
  type OpenRequest,
} from "~/lib/desktop/bridge";
import { markdownExtension, sameFilename } from "~/lib/storage/filenames";
import { flushPersistence } from "~/lib/storage/persisted";
import { findDocument, openDocument } from "./document";
import {
  currentLibrary,
  libraryStatus,
  onLibraryReady,
  reopenLibrary,
  retryLibrarySave,
  syncLibrary,
  syncOpenedFiles,
} from "./library";
import { closeSettings } from "./navigation";
import { ownsDocument } from "./opened-files";

const [location, setLocation] = createSignal<LibraryLocation | null>(null);

export const libraryLocation = location;

export interface DesktopSyncWindow {
  addEventListener: Window["addEventListener"];
  removeEventListener: Window["removeEventListener"];
}

function requestedDocument(request: OpenRequest): string | undefined {
  if (request.kind === "file") return findDocument(request.id)?.id;
  return currentLibrary()
    ?.entries()
    .find((entry) => sameFilename(entry.file, request.name))?.id;
}

export async function openRequestedFiles(
  bridge: DesktopBridge | null = desktopBridge(),
): Promise<boolean> {
  if (!bridge || untrack(libraryStatus).kind !== "ready") return false;
  const requests = await bridge.files.takeRequests();
  if (requests.length === 0) return false;
  await syncLibrary();
  flush();
  const target = requests.map(requestedDocument).findLast((id) => id !== undefined);
  if (!target) return false;
  closeSettings();
  return openDocument(target);
}

export function droppedMarkdownFiles(transfer: DataTransfer | null): File[] {
  return Array.from(transfer?.files ?? []).filter((file) => markdownExtension(file.name) !== null);
}

export function acceptFileDrag(event: DragEvent): void {
  const transfer = event.dataTransfer;
  if (!transfer || !Array.from(transfer.types).includes("Files")) return;
  event.preventDefault();
  transfer.dropEffect = "copy";
}

export function openDroppedFiles(
  event: DragEvent,
  bridge: DesktopBridge | null = desktopBridge(),
): boolean {
  const files = droppedMarkdownFiles(event.dataTransfer);
  if (!bridge || files.length === 0) return false;
  event.preventDefault();
  event.stopPropagation();
  void bridge.files.openDropped(files);
  return true;
}

export async function revealDocument(
  id: string,
  bridge: DesktopBridge | null = desktopBridge(),
): Promise<void> {
  if (!bridge) return;
  await retryLibrarySave();
  if (ownsDocument(id)) {
    await bridge.files.reveal(id);
    return;
  }
  const file = currentLibrary()?.entry(id)?.file;
  if (file) await bridge.library.revealFile(file);
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
  const openRequested = () => void openRequestedFiles(bridge);
  const stopRequests = bridge.files.onRequest(openRequested);
  const stopReady = onLibraryReady(openRequested);
  const stopFileChanges = bridge.files.onChange(() => void syncOpenedFiles());
  const onDrop = (event: DragEvent) => openDroppedFiles(event, bridge);
  win.addEventListener("focus", refresh);
  win.addEventListener("dragover", acceptFileDrag, true);
  win.addEventListener("drop", onDrop, true);
  return () => {
    stopChanges();
    stopClose();
    stopRequests();
    stopReady();
    stopFileChanges();
    win.removeEventListener("focus", refresh);
    win.removeEventListener("dragover", acceptFileDrag, true);
    win.removeEventListener("drop", onDrop, true);
  };
}

export function resetDesktopState(): void {
  setLocation(null);
}
