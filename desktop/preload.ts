import { contextBridge, ipcRenderer, webFrame, webUtils } from "electron";
import {
  DESKTOP_BRIDGE_KEY,
  type DesktopBridge,
  type DesktopPlatform,
} from "../src/lib/desktop/bridge";
import { CHANNELS } from "./channels";
import { trafficLightInset } from "./window-chrome";

export const TRAFFIC_LIGHT_INSET_PROPERTY = "--traffic-light-inset";

function platform(): DesktopPlatform {
  const current = process.platform;
  return current === "darwin" || current === "win32" ? current : "linux";
}

export function syncTrafficLightInset(): void {
  document.documentElement?.style.setProperty(
    TRAFFIC_LIGHT_INSET_PROPERTY,
    trafficLightInset(webFrame.getZoomFactor()),
  );
}

export function watchTrafficLightInset(current: DesktopPlatform): void {
  if (current !== "darwin") return;
  syncTrafficLightInset();
  window.addEventListener("DOMContentLoaded", syncTrafficLightInset, { once: true });
  window.addEventListener("resize", syncTrafficLightInset);
}

export function pathsForFiles(files: unknown): string[] {
  if (!Array.isArray(files)) return [];
  const paths: string[] = [];
  for (const file of files) {
    try {
      const path = webUtils.getPathForFile(file as File);
      if (path) paths.push(path);
    } catch {
      continue;
    }
  }
  return paths;
}

function subscribe(channel: string, listener: () => void): () => void {
  const handler = () => listener();
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

export function createBridge(): DesktopBridge {
  const closeListeners = new Set<() => Promise<void> | void>();

  ipcRenderer.on(CHANNELS.beforeClose, () => {
    void Promise.allSettled(
      Array.from(closeListeners, (listener) => Promise.resolve().then(listener)),
    ).then(() => ipcRenderer.send(CHANNELS.closeReady));
  });

  return {
    platform: platform(),
    folder: {
      open: () => ipcRenderer.invoke(CHANNELS.folderOpen),
      ensure: (session, path) => ipcRenderer.invoke(CHANNELS.folderEnsure, session, path),
      list: (session, path) => ipcRenderer.invoke(CHANNELS.folderList, session, path),
      stat: (session, path, name) => ipcRenderer.invoke(CHANNELS.folderStat, session, path, name),
      read: (session, path, name) => ipcRenderer.invoke(CHANNELS.folderRead, session, path, name),
      write: (session, path, name, text) =>
        ipcRenderer.invoke(CHANNELS.folderWrite, session, path, name, text),
      remove: (session, path, name) =>
        ipcRenderer.invoke(CHANNELS.folderRemove, session, path, name),
      rename: (session, path, from, to) =>
        ipcRenderer.invoke(CHANNELS.folderRename, session, path, from, to),
    },
    library: {
      location: () => ipcRenderer.invoke(CHANNELS.libraryLocation),
      choose: () => ipcRenderer.invoke(CHANNELS.libraryChoose),
      reveal: () => ipcRenderer.invoke(CHANNELS.libraryReveal),
      revealFile: (name) => ipcRenderer.invoke(CHANNELS.libraryRevealFile, name),
      onChange: (listener) => subscribe(CHANNELS.libraryChanged, listener),
    },
    files: {
      list: (taken) => ipcRenderer.invoke(CHANNELS.filesList, taken),
      takeRequests: () => ipcRenderer.invoke(CHANNELS.filesTake),
      async openDropped(files) {
        const paths = pathsForFiles(files);
        return paths.length > 0 ? ipcRenderer.invoke(CHANNELS.filesOpen, paths) : 0;
      },
      save: (id, change) => ipcRenderer.invoke(CHANNELS.filesSave, id, change),
      close: (id) => ipcRenderer.invoke(CHANNELS.filesClose, id),
      reveal: (id) => ipcRenderer.invoke(CHANNELS.filesReveal, id),
      onRequest: (listener) => subscribe(CHANNELS.filesRequested, listener),
      onChange: (listener) => subscribe(CHANNELS.filesChanged, listener),
    },
    window: {
      onBeforeClose(listener) {
        closeListeners.add(listener);
        return () => {
          closeListeners.delete(listener);
        };
      },
    },
  };
}

contextBridge.exposeInMainWorld(DESKTOP_BRIDGE_KEY, createBridge());
watchTrafficLightInset(platform());
