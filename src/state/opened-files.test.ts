import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { flush } from "solid-js";
import { createMemoryBridge, type MemoryBridge } from "~/lib/desktop/memory-bridge";
import { clearDocumentState, documents, findDocument, loadDocuments } from "./document";
import {
  applyOpenedFiles,
  clearOpenedFileError,
  closeOpenedFile,
  flushOpenedFiles,
  isOpenedFile,
  loadOpenedFiles,
  openedFileError,
  openedFileIds,
  ownsDocument,
  refreshOpenedFiles,
  resetOpenedFileState,
  saveOpenedFile,
  useOpenedFilesBridge,
} from "./opened-files";
import { resetWorkspaceState } from "./workspace";

afterEach(() => {
  resetOpenedFileState();
  clearDocumentState();
  resetWorkspaceState();
});

async function load(bridge: MemoryBridge, taken: string[] = []) {
  await bridge.files.takeRequests();
  const docs = await loadOpenedFiles(taken, bridge);
  loadDocuments(docs);
  flush();
  return docs;
}

describe("loadOpenedFiles", () => {
  it("returns every open file as a document and marks it as opened", async () => {
    const bridge = createMemoryBridge(null);
    const id = bridge.openFile("Notes.md", "# Notes");
    const docs = await load(bridge);
    expect(docs).toEqual([expect.objectContaining({ id, title: "Notes", text: "# Notes" })]);
    expect(isOpenedFile(id)).toBe(true);
    expect(ownsDocument(id)).toBe(true);
    expect(openedFileIds()).toEqual(new Set([id]));
  });

  it("uses the bridge a test provides in place of the preload's", async () => {
    const bridge = createMemoryBridge(null);
    const id = bridge.openFile("Notes.md", "# Notes");
    const restore = useOpenedFilesBridge(bridge);
    try {
      expect((await loadOpenedFiles([])).map((doc) => doc.id)).toEqual([id]);
    } finally {
      restore();
    }
    expect(await loadOpenedFiles([])).toEqual([]);
  });

  it("opens nothing in the browser", async () => {
    expect(await loadOpenedFiles([], null)).toEqual([]);
    expect(openedFileIds().size).toBe(0);
    await expect(refreshOpenedFiles()).resolves.toBeUndefined();
    await expect(flushOpenedFiles()).resolves.toBeUndefined();
  });

  it("reports a failure to list files instead of throwing", async () => {
    const bridge = createMemoryBridge(null);
    bridge.files.list = async () => ({ ok: false, error: { name: "Error", message: "gone" } });
    expect(await loadOpenedFiles([], bridge)).toEqual([]);
    expect(openedFileError()).toBe("gone");
    clearOpenedFileError();
    flush();
    expect(openedFileError()).toBeNull();
  });
});

describe("opened file changes", () => {
  it("adds, updates, and removes documents from a refresh", async () => {
    const bridge = createMemoryBridge(null);
    const edited = bridge.openFile("Edited.md", "old");
    const gone = bridge.openFile("Gone.md", "gone");
    await load(bridge);
    bridge.editOpenedFile(edited, "new");
    bridge.removeOpenedFile(gone);
    const added = bridge.openFile("Added.md", "added");

    await refreshOpenedFiles();
    flush();
    expect(findDocument(edited)?.text).toBe("new");
    expect(findDocument(gone)).toBeUndefined();
    expect(findDocument(added)?.title).toBe("Added");
    expect(isOpenedFile(added)).toBe(true);
  });

  it("marks documents added directly as opened", () => {
    applyOpenedFiles({
      added: [
        { id: "abc123", title: "Copy", text: "x", modified: 1, icon: null, fixedTitle: true },
      ],
      updated: [],
      removed: [],
    });
    flush();
    expect(isOpenedFile("abc123")).toBe(true);
    expect(documents().map((doc) => doc.id)).toEqual(["abc123"]);
  });

  it("saves edits through the store and closes files on request", async () => {
    const bridge = createMemoryBridge(null);
    const id = bridge.openFile("Notes.md", "a");
    await load(bridge);
    saveOpenedFile({ id, title: "Notes", text: "b", icon: null });
    await flushOpenedFiles();
    expect(bridge.openedFile(id)?.text).toBe("b");

    closeOpenedFile(id);
    flush();
    expect(isOpenedFile(id)).toBe(false);
    await vi.waitFor(() => expect(bridge.closedFiles()).toEqual([id]));
  });

  it("surfaces a failed save and clears it once a save succeeds", async () => {
    const bridge = createMemoryBridge(null);
    const id = bridge.openFile("Notes.md", "a");
    await load(bridge);
    const save = bridge.files.save;
    bridge.files.save = async () => ({
      ok: false,
      error: { name: "NotAllowedError", message: "read-only" },
    });
    saveOpenedFile({ id, title: "Notes", text: "b", icon: null });
    await expect(flushOpenedFiles()).rejects.toThrow("read-only");
    flush();
    expect(openedFileError()).toContain("read-only");
    bridge.files.save = save;
    await flushOpenedFiles();
    flush();
    expect(openedFileError()).toBeNull();
  });
});
