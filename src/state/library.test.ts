import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createRoot, flush } from "solid-js";
import { parseArchive, serializeArchive } from "~/lib/storage/archive";
import { CATALOG_DIRECTORY, CATALOG_FILE } from "~/lib/storage/catalog";
import { createMemoryDirectory, type MemoryDirectory } from "~/lib/storage/directory";
import { seedDirectory } from "~/lib/storage/fixtures";
import { TEST_DOCUMENTS } from "~/test-documents";
import {
  activeDocumentId,
  clearDocumentState,
  createDocument,
  deleteDocument,
  documents,
  findDocument,
  setDocText,
  setDocumentIcon,
  setTitle,
} from "./document";
import { registerEditorApi, resetEditorApiState } from "./editor-api";
import {
  currentLibrary,
  dismissImportStatus,
  downloadLibrary,
  exportLibrary,
  flushLibrary,
  importLibraryFile,
  importLibraryText,
  importStatus,
  libraryStatus,
  librarySaveError,
  retryLibrarySave,
  refreshLibrary,
  resetLibraryState,
  startLibrary,
  trackLibrary,
  useLibraryDirectory,
  type TrackingWindow,
} from "./library";
import { lastDocumentId, resetWorkspaceState } from "./workspace";
import { hashText } from "~/lib/storage/hash";
import { clearJournal, readJournal, writeJournal } from "~/lib/storage/journal";

let restore: (() => void) | undefined;
let dispose: (() => void) | undefined;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  restore?.();
  restore = undefined;
  resetLibraryState();
  clearDocumentState();
  resetWorkspaceState();
  resetEditorApiState();
  clearJournal();
});

async function storage(): Promise<MemoryDirectory> {
  const directory = createMemoryDirectory();
  await seedDirectory(directory, TEST_DOCUMENTS);
  restore = useLibraryDirectory(async () => directory);
  return directory;
}

function track(win: TrackingWindow): void {
  dispose = createRoot((stop) => {
    trackLibrary(win);
    return stop;
  });
}

function trackingWindow(): TrackingWindow & {
  visibility: (state: DocumentVisibilityState) => void;
} {
  const target = new EventTarget();
  let state: DocumentVisibilityState = "visible";
  return {
    document: {
      get visibilityState() {
        return state;
      },
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
    },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    visibility(next) {
      state = next;
      target.dispatchEvent(new Event("visibilitychange"));
    },
  };
}

describe("library startup", () => {
  it("opens an empty origin private file system as an empty library without writing documents", async () => {
    const files = createMemoryDirectory();
    restore = useLibraryDirectory(async () => files);
    await startLibrary();
    flush();
    expect(libraryStatus()).toEqual({ kind: "ready" });
    expect(documents()).toEqual([]);
    expect(activeDocumentId()).toBe("");
    expect(lastDocumentId()).toBeNull();
    expect(files.files()).toEqual({});
    expect(files.childDirectory(CATALOG_DIRECTORY)?.files()[CATALOG_FILE]).toContain(
      '"documents": []',
    );
    expect(currentLibrary()).not.toBeNull();
  });

  it("opens stored documents with their catalog ids and remembers the opened document", async () => {
    const files = await storage();
    await startLibrary();
    flush();
    expect(libraryStatus()).toEqual({ kind: "ready" });
    expect(documents().map((doc) => doc.id)).toEqual(TEST_DOCUMENTS.map((doc) => doc.id));
    expect(Object.keys(files.files())).toContain("Welcome to emdy.md");
    expect(activeDocumentId()).toBe("welcom");
    expect(lastDocumentId()).toBe("welcom");
    expect(currentLibrary()).not.toBeNull();
  });

  it("reopens the documents already stored on disk", async () => {
    const directory = createMemoryDirectory({ "Mine.md": "# Mine" });
    restore = useLibraryDirectory(async () => directory);
    await startLibrary();
    flush();
    expect(libraryStatus()).toEqual({ kind: "ready" });
    expect(documents().map((doc) => [doc.title, doc.text])).toEqual([["Mine", "# Mine"]]);
  });

  it("gates the workspace when the storage cannot be opened, and recovers on retry", async () => {
    let attempts = 0;
    const directory = createMemoryDirectory();
    await seedDirectory(directory, TEST_DOCUMENTS);
    restore = useLibraryDirectory(async () => {
      attempts++;
      if (attempts === 1) throw new Error("storage unavailable");
      return directory;
    });
    await startLibrary();
    flush();
    expect(libraryStatus()).toEqual({ kind: "error", message: "storage unavailable" });
    expect(documents()).toEqual([]);
    await startLibrary();
    flush();
    expect(libraryStatus()).toEqual({ kind: "ready" });
    expect(documents().map((doc) => doc.title)).toEqual(TEST_DOCUMENTS.map((doc) => doc.title));
  });

  it("surfaces a failure to read the directory", async () => {
    restore = useLibraryDirectory(async () => ({
      ...createMemoryDirectory(),
      list: async () => {
        throw new Error("disk on fire");
      },
    }));
    await startLibrary();
    flush();
    expect(libraryStatus()).toEqual({ kind: "error", message: "disk on fire" });
  });
});

describe("library tracking", () => {
  it("writes edits, renames, creations, and deletions to the directory", async () => {
    const browser = await storage();
    await startLibrary();
    flush();
    track(trackingWindow());
    flush();
    flush(() => setDocText("# Welcome to emdy\n\nchanged body"));
    await flushLibrary();
    expect(browser.files()["Welcome to emdy.md"]).toBe("# Welcome to emdy\n\nchanged body");
    flush(() => setTitle("Renamed"));
    await flushLibrary();
    expect(browser.files()["Renamed.md"]).toBe("# Welcome to emdy\n\nchanged body");
    expect(browser.files()["Welcome to emdy.md"]).toBeUndefined();
    flush(() => createDocument("Fresh", "fresh text"));
    await flushLibrary();
    expect(browser.files()["Fresh.md"]).toBe("fresh text");
    flush(() => deleteDocument(activeDocumentId()));
    await flushLibrary();
    expect(browser.files()["Fresh.md"]).toBeUndefined();
    expect(browser.childDirectory(CATALOG_DIRECTORY)?.files()[CATALOG_FILE]).not.toContain(
      "Fresh.md",
    );
  });

  it("points links at a renamed document's new file", async () => {
    const browser = createMemoryDirectory();
    await seedDirectory(browser, [
      { id: "readng", title: "Reading list", text: "# Reading list" },
      {
        id: "linker",
        title: "Linker",
        text: "[Reading list](Reading%20list.md) and [my books](Reading%20list.md#fiction)",
      },
    ]);
    restore = useLibraryDirectory(async () => browser);
    await startLibrary();
    flush();
    track(trackingWindow());
    flush();
    expect(activeDocumentId()).toBe("readng");
    flush(() => setTitle("Books (2026)"));
    await flushLibrary();
    flush();
    await flushLibrary();
    expect(browser.files()["Books (2026).md"]).toBe("# Reading list");
    expect(browser.files()["Linker.md"]).toBe(
      "[Books (2026)](Books%20%282026%29.md) and [my books](Books%20%282026%29.md#fiction)",
    );
  });

  it("saves a chosen icon to the catalog without moving the document in time", async () => {
    const browser = await storage();
    await startLibrary();
    flush();
    track(trackingWindow());
    flush();
    const modified = currentLibrary()!.entry("readng")!.modified;
    const icon = { kind: "lucide", name: "book-open", color: "green" } as const;
    flush(() => setDocumentIcon("readng", icon));
    await flushLibrary();
    const catalog = JSON.parse(browser.childDirectory(CATALOG_DIRECTORY)!.files()[CATALOG_FILE]);
    expect(catalog.documents.find((entry: { id: string }) => entry.id === "readng")).toMatchObject({
      icon,
      modified,
    });
    expect(browser.files()["Reading list.md"]).toBe(TEST_DOCUMENTS[2].text);

    resetLibraryState();
    clearDocumentState();
    await startLibrary();
    flush();
    expect(findDocument("readng")?.icon).toEqual(icon);
  });

  it("flushes the editor snapshot and pending writes when the page hides", async () => {
    const browser = await storage();
    await startLibrary();
    flush();
    const win = trackingWindow();
    track(win);
    const editorFlush = vi.fn(() => setDocText("# Welcome to emdy\n\nfrom editor"));
    flush(() =>
      registerEditorApi({
        scrollToLine: vi.fn(),
        focus: vi.fn(),
        getText: () => "",
        flush: editorFlush,
        runCommand: vi.fn(),
        applyEdits: vi.fn(),
      }),
    );
    win.visibility("hidden");
    await vi.waitFor(() =>
      expect(browser.files()["Welcome to emdy.md"]).toBe("# Welcome to emdy\n\nfrom editor"),
    );
    expect(editorFlush).toHaveBeenCalled();
  });

  it("keeps every document removed outside the app in one refresh gone", async () => {
    const browser = await storage();
    await startLibrary();
    flush();
    const win = trackingWindow();
    track(win);
    browser.drop("Reading list.md");
    browser.drop("Project ideas.md");
    win.visibility("visible");
    await vi.waitFor(() => expect(findDocument("readng")).toBeUndefined());
    flush();
    const titles = documents().map((doc) => doc.title);
    expect(titles).not.toContain("Reading list");
    expect(titles).not.toContain("Project ideas");
    await flushLibrary();
    expect(browser.files()["Reading list.md"]).toBeUndefined();
    expect(browser.files()["Project ideas.md"]).toBeUndefined();
  });

  it("picks up outside changes when the page becomes visible again", async () => {
    const browser = await storage();
    await startLibrary();
    flush();
    const win = trackingWindow();
    track(win);
    browser.place("Welcome to emdy.md", "edited in another app", 5_000);
    browser.place("Dropped in.md", "new arrival", 5_001);
    browser.drop("Reading list.md");
    win.visibility("visible");
    await vi.waitFor(() => expect(findDocument("welcom")?.text).toBe("edited in another app"));
    flush();
    expect(documents().map((doc) => doc.title)).toContain("Dropped in");
    expect(documents().some((doc) => doc.title === "Reading list")).toBe(false);
    await flushLibrary();
    expect(Object.keys(browser.files()).sort()).toEqual(
      [
        "Dropped in.md",
        "Project ideas.md",
        "Weekly sync — product.md",
        "Welcome to emdy.md",
      ].sort(),
    );
  });

  it("journals pending edits while flushing and clears the journal afterwards", async () => {
    const browser = await storage();
    await startLibrary();
    flush();
    track(trackingWindow());
    flush();
    flush(() => setDocText("# Welcome to emdy\n\nnearly lost"));
    const journal = flushLibrary();
    expect(readJournal()).toEqual([
      {
        id: "welcom",
        title: "Welcome to emdy",
        text: "# Welcome to emdy\n\nnearly lost",
        bases: [hashText(TEST_DOCUMENTS[0].text)],
      },
    ]);
    await journal;
    expect(readJournal()).toEqual([]);
    expect(browser.files()["Welcome to emdy.md"]).toBe("# Welcome to emdy\n\nnearly lost");
  });

  it("replays journaled edits after an interrupted flush", async () => {
    const browser = await storage();
    writeJournal([
      {
        id: "welcom",
        title: "Welcome, renamed",
        text: "journaled body",
        bases: [hashText(TEST_DOCUMENTS[0].text)],
      },
      { id: "new0d1", title: "Never written", text: "fresh body", bases: [] },
    ]);
    await startLibrary();
    flush();
    expect(findDocument("welcom")).toMatchObject({
      title: "Welcome, renamed",
      text: "journaled body",
    });
    expect(findDocument("new0d1")).toMatchObject({ title: "Never written", text: "fresh body" });
    expect(readJournal()).toEqual([]);
    await flushLibrary();
    expect(browser.files()["Welcome, renamed.md"]).toBe("journaled body");
    expect(browser.files()["Never written.md"]).toBe("fresh body");
    expect(browser.childDirectory(CATALOG_DIRECTORY)?.files()[CATALOG_FILE]).toContain("new0d1");
  });

  it("keeps the disk version and saves a conflict copy when the journal is stale", async () => {
    const browser = await storage();
    writeJournal([
      {
        id: "welcom",
        title: "Welcome to emdy",
        text: "journaled body",
        bases: ["stale0stale0stal"],
      },
      {
        id: "readng",
        title: "Reading list",
        text: TEST_DOCUMENTS[2].text,
        bases: ["stale0stale0stal"],
      },
    ]);
    await startLibrary();
    flush();
    expect(findDocument("welcom")?.text).toBe(TEST_DOCUMENTS[0].text);
    const copy = documents().find((doc) => doc.title === "Welcome to emdy (conflict)");
    expect(copy?.text).toBe("journaled body");
    expect(documents().filter((doc) => doc.title.startsWith("Reading list"))).toHaveLength(1);
    await flushLibrary();
    expect(browser.files()["Welcome to emdy (conflict).md"]).toBe("journaled body");
  });

  it("ignores refresh requests before the library is ready", async () => {
    await storage();
    await expect(refreshLibrary()).resolves.toBeUndefined();
    await expect(flushLibrary()).resolves.toBeUndefined();
  });
});

describe("durable journal recovery", () => {
  it("keeps the journal until replayed files have reached storage", async () => {
    const browser = await storage();
    await startLibrary();
    flush();
    resetLibraryState();
    writeJournal([
      {
        id: "welcom",
        title: "Recovered",
        text: "recovered text",
        bases: [hashText(TEST_DOCUMENTS[0].text)],
      },
    ]);
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const write = browser.write;
    browser.write = async (name, text) => {
      started.resolve();
      await release.promise;
      await write(name, text);
    };
    const opening = startLibrary();
    await started.promise;
    expect(readJournal()[0].text).toBe("recovered text");
    expect(browser.files()["Recovered.md"]).toBeUndefined();
    release.resolve();
    await opening;
    flush();
    expect(readJournal()).toEqual([]);
    expect(browser.files()["Recovered.md"]).toBe("recovered text");
    expect(findDocument("welcom")?.text).toBe("recovered text");
  });

  it("keeps recovery data when replay fails and completes it on retry", async () => {
    const browser = await storage();
    await startLibrary();
    flush();
    resetLibraryState();
    writeJournal([
      {
        id: "welcom",
        title: "Recovered",
        text: "recovered text",
        bases: [hashText(TEST_DOCUMENTS[0].text)],
      },
    ]);
    const write = browser.write;
    browser.write = async () => {
      throw new Error("replay failed");
    };
    await startLibrary();
    flush();
    expect(libraryStatus()).toEqual({ kind: "error", message: "replay failed" });
    expect(readJournal()[0].text).toBe("recovered text");
    browser.write = write;
    await startLibrary();
    flush();
    expect(libraryStatus()).toEqual({ kind: "ready" });
    expect(readJournal()).toEqual([]);
    expect(findDocument("welcom")).toMatchObject({ title: "Recovered", text: "recovered text" });
  });

  it("reports failed saves without discarding the open editor and retries them", async () => {
    const browser = await storage();
    await startLibrary();
    flush();
    const current = currentLibrary()!;
    const write = browser.write;
    browser.write = async () => {
      throw new Error("quota exceeded");
    };
    current.save({ id: "welcom", title: "Welcome to emdy", text: "unsaved edit" });
    await retryLibrarySave();
    flush();
    expect(libraryStatus()).toEqual({ kind: "ready" });
    expect(librarySaveError()).toBe("quota exceeded");
    expect(current.pending()).toBe(true);
    expect(readJournal()[0].text).toBe("unsaved edit");
    browser.write = write;
    await retryLibrarySave();
    flush();
    expect(librarySaveError()).toBeNull();
    expect(current.pending()).toBe(false);
    expect(readJournal()).toEqual([]);
    expect(browser.files()["Welcome to emdy.md"]).toBe("unsaved edit");
  });
});

describe("export and import", () => {
  const archiveFile = (text: string) => new File([text], "emdy.json", { type: "application/json" });

  it("exports every document with its catalog stamps after flushing pending edits", async () => {
    const browser = await storage();
    await startLibrary();
    flush();
    track(trackingWindow());
    flush();
    flush(() => setDocText("# Welcome to emdy\n\nexported body"));
    const stamp = new Date(2026, 8, 11, 10).getTime();
    const { name, text } = await exportLibrary(() => stamp);
    expect(name).toBe("emdy-2026-09-11.json");
    const archive = parseArchive(text)!;
    expect(archive.exportedAt).toBe(stamp);
    expect(archive.documents.map((doc) => [doc.id, doc.title])).toEqual(
      TEST_DOCUMENTS.map((doc) => [doc.id, doc.title]),
    );
    expect(archive.documents[0].text).toBe("# Welcome to emdy\n\nexported body");
    expect(browser.files()["Welcome to emdy.md"]).toBe("# Welcome to emdy\n\nexported body");
    const entry = currentLibrary()!.entry("welcom")!;
    expect(archive.documents[0]).toMatchObject({
      created: entry.created,
      modified: entry.modified,
    });
  });

  it("carries document icons through an export and a fresh import", async () => {
    await storage();
    await startLibrary();
    flush();
    track(trackingWindow());
    flush();
    const icon = { kind: "emoji", emoji: "🌱" } as const;
    flush(() => setDocumentIcon("welcom", icon));
    const { text } = await exportLibrary();
    const archive = parseArchive(text)!;
    expect(archive.documents.find((doc) => doc.id === "welcom")?.icon).toEqual(icon);
    expect(archive.documents.find((doc) => doc.id === "readng")).not.toHaveProperty("icon");

    dispose?.();
    dispose = undefined;
    restore?.();
    resetLibraryState();
    clearDocumentState();
    restore = useLibraryDirectory(async () => createMemoryDirectory());
    await startLibrary();
    flush();
    await importLibraryText(text);
    flush();
    expect(findDocument("welcom")?.icon).toEqual(icon);
    expect(currentLibrary()!.entry("welcom")?.icon).toEqual(icon);
  });

  it("imports new documents, leaves existing ones untouched, and reports the counts", async () => {
    const browser = await storage();
    await startLibrary();
    flush();
    track(trackingWindow());
    flush();
    const summary = await importLibraryText(
      serializeArchive(
        [
          {
            id: "welcom",
            title: "Welcome to emdy",
            text: TEST_DOCUMENTS[0].text,
            created: 1,
            modified: 2,
          },
          {
            id: "readng",
            title: "Reading list",
            text: "a different reading list",
            created: 3,
            modified: 4,
          },
          { id: "fresh0", title: "  Fresh   arrival ", text: "new", created: 5, modified: 6 },
        ],
        7,
      ),
    );
    flush();
    expect(summary).toEqual({ imported: 2, skipped: 1 });
    expect(findDocument("readng")?.text).toBe(TEST_DOCUMENTS[2].text);
    expect(findDocument("fresh0")).toMatchObject({ title: "Fresh arrival", text: "new" });
    const copy = documents().find((doc) => doc.text === "a different reading list")!;
    expect(copy.id).not.toBe("readng");
    expect(copy.title).toBe("Reading list");
    expect(activeDocumentId()).toBe("welcom");
    expect(documents()).toHaveLength(TEST_DOCUMENTS.length + 2);
    expect(browser.files()["Reading list.md"]).toBe(TEST_DOCUMENTS[2].text);
    expect(browser.files()["Reading list 2.md"]).toBe("a different reading list");
    expect(browser.files()["Fresh arrival.md"]).toBe("new");
    expect(currentLibrary()!.entry("fresh0")).toMatchObject({ created: 5, modified: 6 });
    expect(findDocument("fresh0")?.modified).toBe(6);
    expect(copy.modified).toBe(4);
    await flushLibrary();
    expect(currentLibrary()!.pending()).toBe(false);
    expect(browser.files()["Fresh arrival.md"]).toBe("new");
  });

  it("records the outcome of a file import and rejects files that are not exports", async () => {
    await storage();
    await startLibrary();
    flush();
    await importLibraryFile(
      archiveFile(
        serializeArchive(
          [{ id: "fresh0", title: "Fresh", text: "new", created: 1, modified: 2 }],
          3,
        ),
      ),
    );
    flush();
    expect(importStatus()).toEqual({ kind: "imported", imported: 1, skipped: 0 });
    await importLibraryFile(archiveFile('{"documents":[]}'));
    flush();
    expect(importStatus()).toEqual({ kind: "error", message: "This file isn’t an emdy export." });
    flush(() => dismissImportStatus());
    expect(importStatus()).toBeNull();
  });

  it("refuses to import before the library is ready", async () => {
    await expect(importLibraryText(serializeArchive([], 1))).rejects.toThrow("aren’t ready yet");
  });

  it("downloads the export as a JSON file named after the day", async () => {
    await storage();
    await startLibrary();
    flush();
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return "blob:emdy";
    });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      await downloadLibrary();
      expect(click).toHaveBeenCalledTimes(1);
      const anchor = click.mock.contexts[0] as HTMLAnchorElement;
      expect(anchor.download).toMatch(/^emdy-\d{4}-\d{2}-\d{2}\.json$/);
      expect(blobs[0].type).toBe("application/json");
      expect(parseArchive(await blobs[0].text())?.documents.map((doc) => doc.id)).toEqual(
        TEST_DOCUMENTS.map((doc) => doc.id),
      );
    } finally {
      click.mockRestore();
    }
  });
});

describe("automatic titles on disk", () => {
  const track = (win: TrackingWindow) => {
    dispose = createRoot((stop) => {
      trackLibrary(win);
      return stop;
    });
  };

  const restart = async () => {
    dispose?.();
    dispose = undefined;
    resetLibraryState();
    clearDocumentState();
    await startLibrary();
    flush();
    track(trackingWindow());
    flush();
  };

  const markdownFiles = (directory: MemoryDirectory) =>
    Object.keys(directory.files())
      .filter((name) => name.endsWith(".md"))
      .sort();

  it("renames the file once when a heading is typed within one write window", async () => {
    vi.useFakeTimers();
    try {
      const browser = await storage();
      await startLibrary();
      flush();
      track(trackingWindow());
      flush(() => createDocument());
      await vi.advanceTimersByTimeAsync(1_000);
      await flushLibrary();
      expect(markdownFiles(browser)).toContain("Untitled.md");
      const directoryWrite = vi.spyOn(browser, "write");
      const directoryRemove = vi.spyOn(browser, "remove");
      let text = "";
      for (const character of "# Trip to Lisbon") {
        text += character;
        flush(() => setDocText(text));
        await vi.advanceTimersByTimeAsync(20);
      }
      await vi.advanceTimersByTimeAsync(1_000);
      await flushLibrary();
      const markdownWrites = directoryWrite.mock.calls.filter(([name]) => name.endsWith(".md"));
      expect(markdownWrites.map(([name]) => name)).toEqual(["Trip to Lisbon.md"]);
      expect(directoryRemove.mock.calls.map(([name]) => name)).toContain("Untitled.md");
      expect(browser.files()["Trip to Lisbon.md"]).toBe("# Trip to Lisbon");
      expect(markdownFiles(browser)).not.toContain("Untitled.md");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the derived title, id, and automatic behaviour across a restart", async () => {
    const browser = await storage();
    await startLibrary();
    flush();
    track(trackingWindow());
    flush(() => createDocument());
    const id = activeDocumentId();
    flush(() => setDocText("# Garden plans\n\nTomatoes"));
    await flushLibrary();
    expect(browser.files()["Garden plans.md"]).toBe("# Garden plans\n\nTomatoes");

    await restart();
    expect(findDocument(id)).toMatchObject({ title: "Garden plans" });
    expect(activeDocumentId()).toBe(id);
    flush(() => setDocText("# Garden plans 2027\n\nTomatoes"));
    await flushLibrary();
    expect(findDocument(id)?.title).toBe("Garden plans 2027");
    expect(browser.files()["Garden plans 2027.md"]).toBe("# Garden plans 2027\n\nTomatoes");
    expect(browser.files()["Garden plans.md"]).toBeUndefined();
  });

  it("keeps a manual title across a restart even when the heading changes", async () => {
    const browser = await storage();
    await startLibrary();
    flush();
    track(trackingWindow());
    flush(() => createDocument());
    const id = activeDocumentId();
    flush(() => setDocText("# Draft"));
    flush(() => setTitle("Keep this name"));
    await flushLibrary();

    await restart();
    expect(activeDocumentId()).toBe(id);
    flush(() => setDocText("# A different heading"));
    await flushLibrary();
    expect(findDocument(id)?.title).toBe("Keep this name");
    expect(browser.files()["Keep this name.md"]).toBe("# A different heading");
  });

  it("gives two documents with the same heading distinct files but the same title", async () => {
    const browser = await storage();
    await startLibrary();
    flush();
    track(trackingWindow());
    flush(() => createDocument());
    const first = activeDocumentId();
    flush(() => setDocText("# Standup"));
    flush(() => createDocument());
    const second = activeDocumentId();
    flush(() => setDocText("# Standup"));
    await flushLibrary();
    expect(findDocument(first)?.title).toBe("Standup");
    expect(findDocument(second)?.title).toBe("Standup");
    expect(browser.files()["Standup.md"]).toBe("# Standup");
    expect(browser.files()["Standup 2.md"]).toBe("# Standup");

    await restart();
    expect(findDocument(second)?.title).toBe("Standup");
    flush(() => setDocText("# Standup notes"));
    await flushLibrary();
    expect(findDocument(second)?.title).toBe("Standup notes");
    expect(browser.files()["Standup notes.md"]).toBe("# Standup notes");
    expect(browser.files()["Standup 2.md"]).toBeUndefined();
    expect(browser.files()["Standup.md"]).toBe("# Standup");
  });

  it("sanitizes derived titles that contain characters files cannot hold", async () => {
    const browser = await storage();
    await startLibrary();
    flush();
    track(trackingWindow());
    flush(() => createDocument());
    const id = activeDocumentId();
    flush(() => setDocText("# Q1/Q2: plan?"));
    await flushLibrary();
    expect(findDocument(id)?.title).toBe("Q1/Q2: plan?");
    expect(browser.files()["Q1Q2 plan.md"]).toBe("# Q1/Q2: plan?");
  });

  it("leaves files edited elsewhere under their own names", async () => {
    const browser = await storage();
    await startLibrary();
    flush();
    const win = trackingWindow();
    track(win);
    browser.place("Welcome to emdy.md", "# Rewritten in another tab", 5_000);
    win.visibility("visible");
    await vi.waitFor(() => expect(findDocument("welcom")?.text).toBe("# Rewritten in another tab"));
    await flushLibrary();
    expect(findDocument("welcom")?.title).toBe("Welcome to emdy");
    expect(browser.files()["Welcome to emdy.md"]).toBe("# Rewritten in another tab");
  });
});
