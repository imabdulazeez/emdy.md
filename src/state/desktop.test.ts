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
  acceptFileDrag,
  chooseLibraryFolder,
  droppedMarkdownFiles,
  libraryLocation,
  loadLibraryLocation,
  openDroppedFiles,
  openRequestedFiles,
  resetDesktopState,
  revealDocument,
  revealLibraryFolder,
  startDesktopSync,
} from "./desktop";
import {
  activeDocumentId,
  clearDocumentState,
  deleteDocument,
  documents,
  findDocument,
  openDocument,
  setDocText,
  updateDocumentText,
} from "./document";
import { resetEditorApiState } from "./editor-api";
import {
  defaultDirectorySource,
  exportLibrary,
  flushLibrary,
  librarySaveError,
  libraryStatus,
  resetLibraryState,
  startLibrary,
  trackLibrary,
  useLibraryDirectory,
  type TrackingWindow,
} from "./library";
import { isOpenedFile, useOpenedFilesBridge } from "./opened-files";
import { resetWorkspaceState } from "./workspace";

const locks = {
  request: (_name: string, task: () => Promise<unknown>) => task(),
} as unknown as Pick<LockManager, "request">;

let restore: (() => void) | undefined;
let restoreBridge: (() => void) | undefined;
let dispose: (() => void) | undefined;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  restore?.();
  restore = undefined;
  restoreBridge?.();
  restoreBridge = undefined;
  resetLibraryState();
  resetDesktopState();
  clearDocumentState();
  resetWorkspaceState();
  resetEditorApiState();
  clearJournal();
});

function eventWindow(): TrackingWindow & {
  fire: (type: string) => void;
  dispatchEvent: (event: Event) => boolean;
} {
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
    dispatchEvent: (event) => target.dispatchEvent(event),
  };
}

async function openDesktop(
  prepare: (bridge: MemoryBridge) => void = () => {},
): Promise<{ bridge: MemoryBridge; folder: MemoryDirectory }> {
  const folder = createMemoryDirectory();
  await seedDirectory(folder, TEST_DOCUMENTS);
  const bridge = createMemoryBridge(folder);
  prepare(bridge);
  restore = useLibraryDirectory(() => createDesktopDirectory(bridge, locks));
  restoreBridge = useOpenedFilesBridge(bridge);
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

function dragEvent(type: string, files: File[], types: string[] = ["Files"]): DragEvent {
  const event = new Event(type, { cancelable: true, bubbles: true }) as DragEvent;
  Object.defineProperty(event, "dataTransfer", {
    value: { files, types, dropEffect: "none" },
  });
  return event;
}

describe("opened files", () => {
  it("lists files from other folders beside the library and saves edits back to them", async () => {
    let id = "";
    const { bridge, folder } = await openDesktop((next) => {
      id = next.openFile("Outside.md", "# Outside");
    });
    track(eventWindow());
    expect(documents().map((doc) => doc.id)).toEqual([...TEST_DOCUMENTS.map((doc) => doc.id), id]);
    expect(isOpenedFile(id)).toBe(true);

    flush(() => updateDocumentText(id, "# Outside\n\nEdited in emdy."));
    await flushLibrary();
    expect(bridge.openedFile(id)?.text).toBe("# Outside\n\nEdited in emdy.");
    expect(Object.keys(folder.files()).filter((name) => name.startsWith("Outside"))).toEqual([]);
  });

  it("closes an opened file without touching the file or the library", async () => {
    let id = "";
    const { bridge, folder } = await openDesktop((next) => {
      id = next.openFile("Outside.md", "# Outside");
    });
    track(eventWindow());
    const before = folder.files();
    flush(() => deleteDocument(id));
    await vi.waitFor(() => expect(bridge.closedFiles()).toEqual([id]));
    expect(folder.files()).toEqual(before);
    expect(isOpenedFile(id)).toBe(false);
  });

  it("leaves opened files out of the library export", async () => {
    await openDesktop((next) => void next.openFile("Outside.md", "# Outside"));
    const { text } = await exportLibrary(() => 0);
    expect(text).not.toContain("# Outside");
    expect(text).toContain("welcom");
  });

  it("shows a failed save to an opened file like any other save error", async () => {
    let id = "";
    const { bridge } = await openDesktop((next) => {
      id = next.openFile("Outside.md", "a");
    });
    track(eventWindow());
    bridge.files.save = async () => ({
      ok: false,
      error: { name: "NotAllowedError", message: "read-only" },
    });
    flush(() => updateDocumentText(id, "b"));
    await expect(flushLibrary()).rejects.toThrow("read-only");
    flush();
    expect(librarySaveError()).toContain("read-only");
  });

  it("opens the file the system asked for once the library is ready", async () => {
    let id = "";
    const { bridge } = await openDesktop((next) => {
      id = next.openFile("Outside.md", "# Outside");
    });
    const win = eventWindow();
    track(win);
    const stop = startDesktopSync(bridge, win);
    await vi.waitFor(() => {
      flush();
      expect(activeDocumentId()).toBe(id);
    });
    stop();
  });

  it("opens files the system asks for while the app is running", async () => {
    const { bridge } = await openDesktop();
    const win = eventWindow();
    track(win);
    const stop = startDesktopSync(bridge, win);
    const id = bridge.openFile("Later.md", "# Later");
    await vi.waitFor(() => {
      flush();
      expect(activeDocumentId()).toBe(id);
    });
    expect(findDocument(id)?.title).toBe("Later");
    stop();
  });

  it("opens the library document when its own file is opened from outside", async () => {
    const { bridge } = await openDesktop((next) =>
      next.requestLibraryFile("Weekly sync — product.md"),
    );
    expect(await openRequestedFiles(bridge)).toBe(true);
    flush();
    expect(activeDocumentId()).toBe("weekly");
    expect(await openRequestedFiles(bridge)).toBe(false);
    expect(await openRequestedFiles(null)).toBe(false);
  });

  it("follows edits other apps make to an opened file", async () => {
    let id = "";
    const { bridge } = await openDesktop((next) => {
      id = next.openFile("Outside.md", "before");
    });
    const win = eventWindow();
    track(win);
    const stop = startDesktopSync(bridge, win);
    bridge.editOpenedFile(id, "after");
    bridge.emitFilesChange();
    await vi.waitFor(() => {
      flush();
      expect(findDocument(id)?.text).toBe("after");
    });
    stop();
  });

  it("opens Markdown files dropped on the window", async () => {
    const { bridge } = await openDesktop();
    const win = eventWindow();
    track(win);
    const stop = startDesktopSync(bridge, win);
    const drop = dragEvent("drop", [new File(["# Dropped"], "Dropped.md")]);
    win.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    await vi.waitFor(() => {
      flush();
      expect(findDocument(activeDocumentId())?.title).toBe("Dropped");
    });
    expect(isOpenedFile(activeDocumentId())).toBe(true);
    stop();
  });

  it("leaves drops without Markdown files to the page", () => {
    const bridge = createMemoryBridge(null);
    const openDropped = vi.spyOn(bridge.files, "openDropped");
    const drop = dragEvent("drop", [new File(["png"], "photo.png")]);
    expect(openDroppedFiles(drop, bridge)).toBe(false);
    expect(drop.defaultPrevented).toBe(false);
    expect(openDroppedFiles(dragEvent("drop", [new File(["x"], "a.md")]), null)).toBe(false);
    expect(openDropped).not.toHaveBeenCalled();
  });

  it("picks the Markdown files out of a drop", () => {
    const files = [new File([""], "a.md"), new File([""], "b.txt"), new File([""], "c.markdown")];
    expect(droppedMarkdownFiles(dragEvent("drop", files).dataTransfer).map((f) => f.name)).toEqual([
      "a.md",
      "c.markdown",
    ]);
    expect(droppedMarkdownFiles(null)).toEqual([]);
  });

  it("accepts file drags and ignores dragged text", () => {
    const files = dragEvent("dragover", []);
    acceptFileDrag(files);
    expect(files.defaultPrevented).toBe(true);
    expect(files.dataTransfer?.dropEffect).toBe("copy");
    const text = dragEvent("dragover", [], ["text/plain"]);
    acceptFileDrag(text);
    expect(text.defaultPrevented).toBe(false);
  });
});

describe("revealDocument", () => {
  it("reveals a library document by its file and an opened file by its id", async () => {
    let id = "";
    const { bridge } = await openDesktop((next) => {
      id = next.openFile("Outside.md", "# Outside");
    });
    track(eventWindow());
    openDocument("weekly");
    await revealDocument("weekly", bridge);
    await revealDocument(id, bridge);
    expect(bridge.revealedFiles()).toEqual(["Weekly sync — product.md", id]);
  });

  it("does nothing in the browser", async () => {
    await expect(revealDocument("weekly", null)).resolves.toBeUndefined();
  });
});
