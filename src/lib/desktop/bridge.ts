import type { DocumentIcon } from "../document-icon";
import type { FileInfo } from "../storage/directory";

export const DESKTOP_BRIDGE_KEY = "emdyDesktop";

export interface FolderFailure {
  name: string;
  message: string;
}

export type FolderResult<T> = { ok: true; value: T } | { ok: false; error: FolderFailure };

export type FolderPath = readonly string[];

export interface FolderApi {
  open: () => Promise<FolderResult<number>>;
  ensure: (session: number, path: FolderPath) => Promise<FolderResult<null>>;
  list: (session: number, path: FolderPath) => Promise<FolderResult<FileInfo[]>>;
  stat: (session: number, path: FolderPath, name: string) => Promise<FolderResult<FileInfo>>;
  read: (session: number, path: FolderPath, name: string) => Promise<FolderResult<string>>;
  write: (
    session: number,
    path: FolderPath,
    name: string,
    text: string,
  ) => Promise<FolderResult<null>>;
  remove: (session: number, path: FolderPath, name: string) => Promise<FolderResult<null>>;
  rename: (
    session: number,
    path: FolderPath,
    from: string,
    to: string,
  ) => Promise<FolderResult<null>>;
}

export interface LibraryLocation {
  path: string;
  name: string;
}

export interface LibraryFolderApi {
  location: () => Promise<LibraryLocation>;
  choose: () => Promise<LibraryLocation | null>;
  reveal: () => Promise<void>;
  revealFile: (name: string) => Promise<void>;
  onChange: (listener: () => void) => () => void;
}

export interface OpenedFile {
  id: string;
  name: string;
  text: string;
  modified: number;
  icon: DocumentIcon | null;
}

export interface OpenedFileList {
  files: OpenedFile[];
  missing: string[];
}

export type OpenRequest = { kind: "file"; id: string } | { kind: "library"; name: string };

export interface OpenedFileChange {
  title: string;
  text: string;
  base: string;
  icon: DocumentIcon | null;
}

export interface OpenedFileSaved {
  file: OpenedFile;
  conflict: OpenedFile | null;
}

export interface OpenedFilesApi {
  list: (taken: readonly string[]) => Promise<FolderResult<OpenedFileList>>;
  takeRequests: () => Promise<OpenRequest[]>;
  openDropped: (files: readonly File[]) => Promise<number>;
  save: (id: string, change: OpenedFileChange) => Promise<FolderResult<OpenedFileSaved>>;
  close: (id: string) => Promise<void>;
  reveal: (id: string) => Promise<void>;
  onRequest: (listener: () => void) => () => void;
  onChange: (listener: () => void) => () => void;
}

export interface WindowApi {
  onBeforeClose: (listener: () => Promise<void> | void) => () => void;
  onCommand: (listener: (command: string) => void) => () => void;
}

export type DesktopPlatform = "darwin" | "win32" | "linux";

export interface DesktopBridge {
  platform: DesktopPlatform;
  folder: FolderApi;
  library: LibraryFolderApi;
  files: OpenedFilesApi;
  window: WindowApi;
}

export function desktopBridge(host: object | undefined = globalThis): DesktopBridge | null {
  if (!host) return null;
  const bridge = (host as Record<string, unknown>)[DESKTOP_BRIDGE_KEY];
  return typeof bridge === "object" && bridge !== null ? (bridge as DesktopBridge) : null;
}

export function isDesktop(host: object | undefined = globalThis): boolean {
  return desktopBridge(host) !== null;
}

export function applyDesktopAttribute(
  root: HTMLElement = document.documentElement,
  bridge: DesktopBridge | null = desktopBridge(),
): void {
  if (bridge) root.dataset.desktop = bridge.platform;
  else delete root.dataset.desktop;
}

export function revealLabel(platform: DesktopPlatform): string {
  if (platform === "darwin") return "Show in Finder";
  if (platform === "win32") return "Show in File Explorer";
  return "Open folder";
}

export function revealFileLabel(platform: DesktopPlatform): string {
  if (platform === "darwin") return "Reveal in Finder";
  if (platform === "win32") return "Reveal in File Explorer";
  return "Open containing folder";
}

export function unwrapFolderResult<T>(result: FolderResult<T>): T {
  if (result.ok) return result.value;
  const { name, message } = result.error;
  if (name === "Error") throw new Error(message);
  throw new DOMException(message, name);
}
