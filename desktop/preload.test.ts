import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { CHANNELS } from "./channels";

const electron = vi.hoisted(() => {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    listeners,
    exposeInMainWorld: vi.fn(),
    zoomFactor: 1,
    getPathForFile: vi.fn((file: { path?: string }) => {
      if (file.path === undefined) throw new TypeError("Not a file");
      return file.path;
    }),
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
  webFrame: { getZoomFactor: () => electron.zoomFactor },
  webUtils: { getPathForFile: electron.getPathForFile },
  ipcRenderer: {
    invoke: electron.invoke,
    send: electron.send,
    on: electron.on,
    removeListener: electron.removeListener,
  },
}));

const { createBridge, pathsForFiles, TRAFFIC_LIGHT_INSET_PROPERTY, watchTrafficLightInset } =
  await import("./preload");
const exposed = electron.exposeInMainWorld.mock.calls.slice();

beforeEach(() => {
  electron.listeners.clear();
  electron.invoke.mockClear();
  electron.send.mockClear();
  electron.zoomFactor = 1;
  document.documentElement.style.removeProperty(TRAFFIC_LIGHT_INSET_PROPERTY);
});

describe("preload bridge", () => {
  it("exposes the bridge to the page under the documented key", () => {
    expect(exposed).toEqual([
      [
        "emdyDesktop",
        expect.objectContaining({
          folder: expect.any(Object),
          library: expect.any(Object),
          files: expect.any(Object),
        }),
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
    await bridge.library.revealFile("a.md");
    expect(electron.invoke.mock.calls).toEqual([
      [CHANNELS.libraryLocation],
      [CHANNELS.libraryChoose],
      [CHANNELS.libraryReveal],
      [CHANNELS.libraryRevealFile, "a.md"],
    ]);
  });

  it("forwards opened file requests by id, never by path", async () => {
    const bridge = createBridge();
    const change = { title: "Notes", text: "text", base: "0", icon: null };
    await bridge.files.list(["abc123"]);
    await bridge.files.takeRequests();
    await bridge.files.save("abc123", change);
    await bridge.files.close("abc123");
    await bridge.files.reveal("abc123");
    expect(electron.invoke.mock.calls).toEqual([
      [CHANNELS.filesList, ["abc123"]],
      [CHANNELS.filesTake],
      [CHANNELS.filesSave, "abc123", change],
      [CHANNELS.filesClose, "abc123"],
      [CHANNELS.filesReveal, "abc123"],
    ]);
  });

  it("opens dropped files by the paths the browser attached to them", async () => {
    const bridge = createBridge();
    const dropped = [{ path: "/Users/ada/Notes.md" }, { path: "" }, {}] as unknown as File[];
    await bridge.files.openDropped(dropped);
    expect(electron.invoke.mock.calls).toEqual([[CHANNELS.filesOpen, ["/Users/ada/Notes.md"]]]);
  });

  it("sends nothing when the page hands over files without a path", async () => {
    const bridge = createBridge();
    expect(await bridge.files.openDropped([{}] as unknown as File[])).toBe(0);
    expect(pathsForFiles("not a list")).toEqual([]);
    expect(electron.invoke).not.toHaveBeenCalled();
  });

  it("reports open requests and outside edits to opened files until removed", () => {
    const bridge = createBridge();
    const requested = vi.fn();
    const changed = vi.fn();
    const stopRequests = bridge.files.onRequest(requested);
    const stopChanges = bridge.files.onChange(changed);
    electron.emit(CHANNELS.filesRequested);
    electron.emit(CHANNELS.filesChanged);
    stopRequests();
    stopChanges();
    electron.emit(CHANNELS.filesRequested);
    electron.emit(CHANNELS.filesChanged);
    expect(requested).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledTimes(1);
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

describe("traffic light inset", () => {
  const inset = () => document.documentElement.style.getPropertyValue(TRAFFIC_LIGHT_INSET_PROPERTY);

  it("reserves the traffic lights' space in screen points and follows zoom changes", () => {
    electron.zoomFactor = 0.8;
    watchTrafficLightInset("darwin");
    expect(inset()).toBe("120px");
    electron.zoomFactor = 1.25;
    window.dispatchEvent(new Event("resize"));
    expect(inset()).toBe("76.8px");
  });

  it("waits for the document when the preload runs before it exists", () => {
    const root = document.documentElement;
    Object.defineProperty(document, "documentElement", { configurable: true, get: () => null });
    try {
      expect(() => watchTrafficLightInset("darwin")).not.toThrow();
    } finally {
      delete (document as { documentElement?: unknown }).documentElement;
    }
    expect(document.documentElement).toBe(root);
    electron.zoomFactor = 0.5;
    window.dispatchEvent(new Event("DOMContentLoaded"));
    expect(inset()).toBe("192px");
  });

  it("leaves the page alone where the native frame is kept", () => {
    watchTrafficLightInset("win32");
    watchTrafficLightInset("linux");
    expect(inset()).toBe("");
  });
});
