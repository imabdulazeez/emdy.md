import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { CHANNELS } from "./channels";

const electron = vi.hoisted(() => {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    listeners,
    exposeInMainWorld: vi.fn(),
    invoke: vi.fn(async (..._args: unknown[]) => ({ ok: true, value: null })),
    send: vi.fn(),
    on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
      if (!listeners.has(channel)) listeners.set(channel, new Set());
      listeners.get(channel)!.add(listener);
    }),
    removeListener: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
      listeners.get(channel)?.delete(listener);
    }),
    emit(channel: string) {
      for (const listener of listeners.get(channel) ?? []) listener({});
    },
  };
});

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: {
    invoke: electron.invoke,
    send: electron.send,
    on: electron.on,
    removeListener: electron.removeListener,
  },
}));

const { createBridge } = await import("./preload");
const exposed = electron.exposeInMainWorld.mock.calls.slice();

beforeEach(() => {
  electron.listeners.clear();
  electron.invoke.mockClear();
  electron.send.mockClear();
});

describe("preload bridge", () => {
  it("exposes the bridge to the page under the documented key", () => {
    expect(exposed).toEqual([
      [
        "emdyDesktop",
        expect.objectContaining({ folder: expect.any(Object), library: expect.any(Object) }),
      ],
    ]);
  });

  it("forwards every folder call to its channel with the session and path", async () => {
    const bridge = createBridge();
    await bridge.folder.open();
    await bridge.folder.ensure(3, [".emdy"]);
    await bridge.folder.list(3, []);
    await bridge.folder.stat(3, [], "a.md");
    await bridge.folder.read(3, [], "a.md");
    await bridge.folder.write(3, [], "a.md", "text");
    await bridge.folder.remove(3, [], "a.md");
    await bridge.folder.rename(3, [], "a.md", "b.md");
    expect(electron.invoke.mock.calls).toEqual([
      [CHANNELS.folderOpen],
      [CHANNELS.folderEnsure, 3, [".emdy"]],
      [CHANNELS.folderList, 3, []],
      [CHANNELS.folderStat, 3, [], "a.md"],
      [CHANNELS.folderRead, 3, [], "a.md"],
      [CHANNELS.folderWrite, 3, [], "a.md", "text"],
      [CHANNELS.folderRemove, 3, [], "a.md"],
      [CHANNELS.folderRename, 3, [], "a.md", "b.md"],
    ]);
  });

  it("forwards library folder requests", async () => {
    const bridge = createBridge();
    await bridge.library.location();
    await bridge.library.choose();
    await bridge.library.reveal();
    expect(electron.invoke.mock.calls).toEqual([
      [CHANNELS.libraryLocation],
      [CHANNELS.libraryChoose],
      [CHANNELS.libraryReveal],
    ]);
  });

  it("reports folder changes until the listener is removed", () => {
    const bridge = createBridge();
    const listener = vi.fn();
    const stop = bridge.library.onChange(listener);
    electron.emit(CHANNELS.libraryChanged);
    stop();
    electron.emit(CHANNELS.libraryChanged);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("answers a close request once every listener has saved, even if one fails", async () => {
    const bridge = createBridge();
    let finishSave: () => void = () => {};
    bridge.window.onBeforeClose(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    bridge.window.onBeforeClose(() => Promise.reject(new Error("disk")));
    const removed = vi.fn();
    bridge.window.onBeforeClose(removed)();
    electron.emit(CHANNELS.beforeClose);
    await Promise.resolve();
    expect(electron.send).not.toHaveBeenCalled();
    finishSave();
    await vi.waitFor(() => expect(electron.send).toHaveBeenCalledWith(CHANNELS.closeReady));
    expect(removed).not.toHaveBeenCalled();
  });

  it("answers straight away when nothing needs saving", async () => {
    createBridge();
    electron.emit(CHANNELS.beforeClose);
    await vi.waitFor(() => expect(electron.send).toHaveBeenCalledWith(CHANNELS.closeReady));
  });

  it("reports the platform the page runs on", () => {
    expect(["darwin", "win32", "linux"]).toContain(createBridge().platform);
  });
});
