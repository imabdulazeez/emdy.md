import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createRoot, flush } from "solid-js";
import { DESKTOP_BRIDGE_KEY } from "~/lib/desktop/bridge";
import { createMemoryBridge, type MemoryBridge } from "~/lib/desktop/memory-bridge";
import { createDesktopDirectory } from "~/lib/storage/desktop-directory";
import { createMemoryDirectory, type MemoryDirectory } from "~/lib/storage/directory";
import { seedDirectory } from "~/lib/storage/fixtures";
import { clearJournal } from "~/lib/storage/journal";
import { TEST_DOCUMENTS } from "~/test-documents";
import {
  chooseLibraryFolder,
  libraryLocation,
  loadLibraryLocation,
  resetDesktopState,
  revealLibraryFolder,
  startDesktopSync,
} from "./desktop";
import { clearDocumentState, documents, findDocument, setDocText } from "./document";
import { resetEditorApiState } from "./editor-api";
import {
  defaultDirectorySource,
  libraryStatus,
  resetLibraryState,
  startLibrary,
  trackLibrary,
  useLibraryDirectory,
  type TrackingWindow,
} from "./library";
import { resetWorkspaceState } from "./workspace";

const locks = {
  request: (_name: string, task: () => Promise<unknown>) => task(),
} as unknown as Pick<LockManager, "request">;

let restore: (() => void) | undefined;
let dispose: (() => void) | undefined;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  restore?.();
  restore = undefined;
  resetLibraryState();
  resetDesktopState();
  clearDocumentState();
  resetWorkspaceState();
  resetEditorApiState();
  clearJournal();
});

function eventWindow(): TrackingWindow & { fire: (type: string) => void } {
  const target = new EventTarget();
  return {
    document: {
      visibilityState: "visible",
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
    },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    fire: (type) => target.dispatchEvent(new Event(type)),
  };
}

async function openDesktop(): Promise<{ bridge: MemoryBridge; folder: MemoryDirectory }> {
  const folder = createMemoryDirectory();
  await seedDirectory(folder, TEST_DOCUMENTS);
  const bridge = createMemoryBridge(folder);
  restore = useLibraryDirectory(() => createDesktopDirectory(bridge, locks));
  await startLibrary();
  flush();
  return { bridge, folder };
}

function track(win: TrackingWindow): void {
  dispose = createRoot((stop) => {
    trackLibrary(win);
    return stop;
  });
  flush();
}

describe("defaultDirectorySource", () => {
  it("opens the desktop folder when the preload bridge is present", async () => {
    const folder = createMemoryDirectory({ "Note.md": "# Note" });
    const directory = await defaultDirectorySource({
      [DESKTOP_BRIDGE_KEY]: createMemoryBridge(folder),
    });
    expect(await directory.read("Note.md")).toBe("# Note");
  });

  it("falls back to the origin private file system in the browser", async () => {
    await expect(defaultDirectorySource({})).rejects.toThrow(/no private storage/);
  });
});

describe("library location", () => {
  it("loads the folder the desktop app keeps documents in", async () => {
    const bridge = createMemoryBridge(null, {
      location: { path: "/Users/ada/Notes", name: "Notes" },
    });
    await loadLibraryLocation(bridge);
    expect(libraryLocation()).toEqual({ path: "/Users/ada/Notes", name: "Notes" });
  });

  it("stays empty in the browser", async () => {
    await loadLibraryLocation(null);
    expect(libraryLocation()).toBeNull();
    expect(await chooseLibraryFolder(null)).toBe(false);
    await expect(revealLibraryFolder(null)).resolves.toBeUndefined();
  });

  it("asks the desktop app to reveal the folder", async () => {
    const bridge = createMemoryBridge(null);
    await revealLibraryFolder(bridge);
    expect(bridge.revealed()).toBe(1);
  });
});

describe("chooseLibraryFolder", () => {
  it("saves pending edits to the old folder before opening the new one", async () => {
    const { bridge, folder } = await openDesktop();
    track(eventWindow());
    flush(() => setDocText("# Welcome to emdy\n\nlast words"));
    const next = createMemoryDirectory({ "Elsewhere.md": "# Elsewhere" });
    bridge.setChoice({ path: "/Users/ada/Elsewhere", name: "Elsewhere" });
    const choose = bridge.library.choose;
    bridge.library.choose = async () => {
      const chosen = await choose();
      bridge.setRoot(next);
      return chosen;
    };
    expect(await chooseLibraryFolder(bridge)).toBe(true);
    flush();
    expect(folder.files()["Welcome to emdy.md"]).toBe("# Welcome to emdy\n\nlast words");
    expect(libraryStatus()).toEqual({ kind: "ready" });
    expect(documents().map((doc) => doc.title)).toEqual(["Elsewhere"]);
    expect(libraryLocation()).toEqual({ path: "/Users/ada/Elsewhere", name: "Elsewhere" });
    expect(Object.keys(next.files())).toEqual(["Elsewhere.md"]);
  });

  it("keeps the current library when the picker is cancelled", async () => {
    const { bridge } = await openDesktop();
    expect(await chooseLibraryFolder(bridge)).toBe(false);
    flush();
    expect(documents().map((doc) => doc.id)).toEqual(TEST_DOCUMENTS.map((doc) => doc.id));
  });
});

describe("startDesktopSync", () => {
  it("re-reads the folder when files change on disk or the window regains focus", async () => {
    const { bridge, folder } = await openDesktop();
    const win = eventWindow();
    track(win);
    const stop = startDesktopSync(bridge, win);
    folder.place("Welcome to emdy.md", "edited in another app", 5_000);
    bridge.emitChange();
    await vi.waitFor(() => expect(findDocument("welcom")?.text).toBe("edited in another app"));
    folder.place("Dropped in.md", "new arrival", 5_001);
    win.fire("focus");
    await vi.waitFor(() => {
      flush();
      expect(documents().map((doc) => doc.title)).toContain("Dropped in");
    });
    stop();
  });

  it("saves pending edits before the window closes", async () => {
    const { bridge, folder } = await openDesktop();
    const win = eventWindow();
    track(win);
    const stop = startDesktopSync(bridge, win);
    flush(() => setDocText("# Welcome to emdy\n\nsaved on close"));
    await bridge.requestClose();
    expect(folder.files()["Welcome to emdy.md"]).toBe("# Welcome to emdy\n\nsaved on close");
    stop();
  });

  it("stops listening once cleaned up", async () => {
    const { bridge, folder } = await openDesktop();
    const win = eventWindow();
    track(win);
    const stop = startDesktopSync(bridge, win);
    await vi.waitFor(() => expect(libraryLocation()).not.toBeNull());
    stop();
    folder.place("Late.md", "late", 6_000);
    bridge.emitChange();
    win.fire("focus");
    await new Promise((resolve) => setTimeout(resolve, 0));
    flush();
    expect(documents().some((doc) => doc.title === "Late")).toBe(false);
  });

  it("does nothing in the browser", () => {
    const stop = startDesktopSync(null, eventWindow());
    expect(stop()).toBeUndefined();
  });
});
