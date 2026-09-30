import { contextBridge, ipcRenderer } from "electron";
import {
  DESKTOP_BRIDGE_KEY,
  type DesktopBridge,
  type DesktopPlatform,
} from "../src/lib/desktop/bridge";
import { CHANNELS } from "./channels";

function platform(): DesktopPlatform {
  const current = process.platform;
  return current === "darwin" || current === "win32" ? current : "linux";
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
      onChange(listener) {
        const handler = () => listener();
        ipcRenderer.on(CHANNELS.libraryChanged, handler);
        return () => {
          ipcRenderer.removeListener(CHANNELS.libraryChanged, handler);
        };
      },
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
