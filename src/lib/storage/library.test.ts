import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { CATALOG_DIRECTORY, CATALOG_FILE, parseCatalog } from "./catalog";
import { createMemoryDirectory, type MemoryDirectory } from "./directory";
import { seedDirectory } from "./fixtures";
import { hashText } from "./hash";
import { JOURNAL_PREFIX, clearJournal, readJournals, writeJournal } from "./journal";
import { TRANSACTION_FILE } from "./transaction";
import { LIBRARY_WRITE_DELAY_MS, createLibrary, type LibraryRefresh } from "./library";

const SEEDS = [
  { id: "welcom", title: "Welcome", text: "# Welcome" },
  { id: "second", title: "Second: note", text: "# Second" },
];

async function seeded(now?: () => number): Promise<MemoryDirectory> {
  const dir = createMemoryDirectory({}, now);
  await seedDirectory(dir, SEEDS);
  return dir;
}

afterEach(() => {
  vi.useRealTimers();
});

const catalogOf = (dir: ReturnType<typeof createMemoryDirectory>) =>
  parseCatalog(dir.childDirectory(CATALOG_DIRECTORY)?.files()[CATALOG_FILE] ?? null);

describe("library loading", () => {
  it("opens an empty directory as an empty library and writes only an empty catalog", async () => {
    const dir = createMemoryDirectory({}, () => 7);
    const library = createLibrary(dir, { now: () => 7 });
    expect(await library.load()).toEqual([]);
    expect(dir.files()).toEqual({});
    expect(catalogOf(dir)?.documents).toEqual([]);
    expect(library.files()).toEqual([]);
  });

  it("opens the files a directory already holds and reopens it empty once they are removed", async () => {
    const dir = createMemoryDirectory({ "Mine.md": "mine" });
    const library = createLibrary(dir);
    const docs = await library.load();
    expect(docs.map((doc) => doc.title)).toEqual(["Mine"]);
    expect(Object.keys(dir.files())).toEqual(["Mine.md"]);
    expect(library.entries().map((entry) => [entry.id, entry.file])).toEqual([
      [docs[0].id, "Mine.md"],
    ]);
    for (const doc of docs) library.remove(doc.id);
    await library.flush();
    expect(dir.files()).toEqual({});
    expect(await createLibrary(dir).load()).toEqual([]);
  });

  it("keeps ids and titles across reloads through the catalog", async () => {
    const dir = await seeded();
    const first = await createLibrary(dir).load();
    const second = await createLibrary(dir).load();
    expect(second.map((doc) => [doc.id, doc.title])).toEqual(
      first.map((doc) => [doc.id, doc.title]),
    );
  });

  it("rebuilds a missing or corrupt catalog from the files", async () => {
    const dir = await seeded();
    await createLibrary(dir).load();
    dir.childDirectory(CATALOG_DIRECTORY)!.place(CATALOG_FILE, "{oops");
    const docs = await createLibrary(dir).load();
    expect(docs.map((doc) => doc.title).sort()).toEqual(["Second note", "Welcome"]);
    expect(catalogOf(dir)?.documents).toHaveLength(2);
  });

  it("keeps ids from a catalog written before entries recorded synced", async () => {
    const text = "# Notes";
    const dir = createMemoryDirectory({ "Notes.md": text }, () => 100);
    const legacy = {
      id: "keep01",
      file: "Notes.md",
      title: "Notes",
      hash: hashText(text),
      size: text.length,
      modified: 50,
      created: 3,
    };
    const metadata = await dir.child(CATALOG_DIRECTORY);
    await metadata.write(CATALOG_FILE, JSON.stringify({ version: 1, documents: [legacy] }));
    const docs = await createLibrary(dir, { now: () => 100 }).load();
    expect(docs.map((doc) => [doc.id, doc.created, doc.text])).toEqual([["keep01", 3, text]]);
    expect(catalogOf(dir)?.documents).toMatchObject([{ id: "keep01", created: 3, synced: 100 }]);
  });
});

describe("library saving", () => {
  it("debounces writes and records them in the catalog", async () => {
    vi.useFakeTimers();
    const dir = await seeded();
    const library = createLibrary(dir);
    await library.load();
    library.save({ id: "welcom", title: "Welcome", text: "typing" });
    expect(library.pending()).toBe(true);
    expect(dir.files()["Welcome.md"]).toBe("# Welcome");
    vi.advanceTimersByTime(LIBRARY_WRITE_DELAY_MS);
    await library.flush();
    expect(dir.files()["Welcome.md"]).toBe("typing");
    expect(library.entry("welcom")?.hash).toBe(hashText("typing"));
    expect(catalogOf(dir)?.documents.find((entry) => entry.id === "welcom")?.hash).toBe(
      hashText("typing"),
    );
    expect(library.pending()).toBe(false);
  });

  it("renames the file when the title changes and avoids collisions", async () => {
    const dir = await seeded();
    const library = createLibrary(dir, { writeDelayMs: 1 });
    await library.load();
    library.save({ id: "second", title: "Welcome", text: "# Second" });
    await library.flush();
    expect(Object.keys(dir.files()).sort()).toEqual(["Welcome 2.md", "Welcome.md"]);
    expect(library.entry("second")).toMatchObject({ file: "Welcome 2.md", title: "Welcome" });
    library.save({ id: "second", title: "welcome", text: "# Second" });
    await library.flush();
    expect(library.entry("second")?.file).toBe("Welcome 2.md");
  });

  it("skips unchanged saves and safely copies a renamed document", async () => {
    let clock = 1;
    const dir = await seeded(() => clock);
    const library = createLibrary(dir, { writeDelayMs: 1 });
    await library.load();
    clock = 50;
    library.save({ id: "welcom", title: "Welcome", text: "# Welcome" });
    expect(library.pending()).toBe(false);
    library.save({ id: "welcom", title: "Renamed", text: "# Welcome" });
    await library.flush();
    expect(dir.info("Renamed.md")?.lastModified).toBe(50);
    expect(dir.files()["Renamed.md"]).toBe("# Welcome");
    expect(dir.files()["Welcome.md"]).toBeUndefined();
  });

  it("falls back to writing a fresh file when a rename fails", async () => {
    const dir = await seeded();
    const library = createLibrary(dir, { writeDelayMs: 1 });
    await library.load();
    dir.drop("Welcome.md");
    library.save({ id: "welcom", title: "Moved", text: "# Welcome" });
    await library.flush();
    expect(dir.files()["Moved.md"]).toBe("# Welcome");
  });

  it("removes files and forgets pending edits for deleted documents", async () => {
    const dir = await seeded();
    const library = createLibrary(dir, { writeDelayMs: 1 });
    await library.load();
    library.save({ id: "welcom", title: "Welcome", text: "unsaved" });
    library.remove("welcom");
    library.remove("unknown");
    await library.flush();
    expect(Object.keys(dir.files())).toEqual(["Second note.md"]);
    expect(catalogOf(dir)?.documents.map((entry) => entry.id)).toEqual(["second"]);
    expect(library.files()).toEqual(["Second note.md"]);
  });

  it("records a recoverable transaction before files, then publishes a catalog with the observed file times", async () => {
    const dir = await seeded();
    const library = createLibrary(dir, { writeDelayMs: 1 });
    await library.load();
    const log: string[] = [];
    const catalogDir = dir.childDirectory(CATALOG_DIRECTORY)!;
    const writeCatalog = catalogDir.write;
    catalogDir.write = async (name, text) => {
      log.push(`${CATALOG_DIRECTORY}/${name}`);
      await writeCatalog(name, text);
    };
    const writeFile = dir.write;
    dir.write = async (name, text) => {
      log.push(name);
      await writeFile(name, text);
    };
    library.save({ id: "welcom", title: "Welcome", text: "typed" });
    library.save({ id: "fresh0", title: "Fresh", text: "new" });
    await library.flush();
    expect(log).toEqual([
      `${CATALOG_DIRECTORY}/${TRANSACTION_FILE}`,
      "Welcome.md",
      "Fresh.md",
      `${CATALOG_DIRECTORY}/${CATALOG_FILE}`,
    ]);
    expect(catalogOf(dir)?.documents.find((entry) => entry.id === "fresh0")?.synced).toBe(
      dir.info("Fresh.md")?.lastModified,
    );
    expect(
      catalogOf(dir)
        ?.documents.map((entry) => entry.file)
        .sort(),
    ).toEqual(["Fresh.md", "Second note.md", "Welcome.md"]);
  });

  it("autosaves without listing or re-reading the folder while the catalog is unchanged", async () => {
    const dir = await seeded();
    const library = createLibrary(dir, { writeDelayMs: 1 });
    await library.load();
    const list = vi.spyOn(dir, "list");
    const read = vi.spyOn(dir, "read");
    const stat = vi.spyOn(dir, "stat");
    library.save({ id: "welcom", title: "Welcome", text: "one" });
    await library.flush();
    library.save({ id: "welcom", title: "Welcome", text: "two" });
    await library.flush();
    expect(list).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    expect(stat.mock.calls).toEqual([["Welcome.md"], ["Welcome.md"]]);
    expect(dir.files()["Welcome.md"]).toBe("two");
    expect(catalogOf(dir)?.documents.find((entry) => entry.id === "welcom")).toMatchObject({
      hash: hashText("two"),
      synced: dir.info("Welcome.md")?.lastModified,
    });
    const reopened = await createLibrary(dir).load();
    expect(reopened.map((doc) => [doc.id, doc.text])).toEqual([
      ["welcom", "two"],
      ["second", "# Second"],
    ]);
  });

  it("re-reads the folder before saving once another writer changed the catalog", async () => {
    const dir = await seeded();
    const library = createLibrary(dir, { writeDelayMs: 1 });
    await library.load();
    const other = createLibrary(dir, { writeDelayMs: 1 });
    await other.load();
    other.save({ id: "fresh0", title: "Fresh", text: "from the other tab" });
    await other.flush();
    const list = vi.spyOn(dir, "list");
    library.save({ id: "welcom", title: "Welcome", text: "mine" });
    await library.flush();
    expect(list).toHaveBeenCalledTimes(1);
    expect(library.entry("fresh0")).toMatchObject({ file: "Fresh.md" });
    expect(catalogOf(dir)?.documents.map((entry) => entry.id)).toEqual([
      "welcom",
      "second",
      "fresh0",
    ]);
  });

  it("finishes a transaction another writer left pending before autosaving", async () => {
    const dir = await seeded();
    const library = createLibrary(dir, { writeDelayMs: 1 });
    await library.load();
    const other = createLibrary(dir, { writeDelayMs: 1 });
    await other.load();
    const metadata = dir.childDirectory(CATALOG_DIRECTORY)!;
    const remove = metadata.remove;
    metadata.remove = async () => {
      throw new Error("interrupted");
    };
    other.save({ id: "second", title: "Second: note", text: "other tab" });
    await expect(other.flush()).rejects.toThrow("interrupted");
    metadata.remove = remove;
    expect(metadata.files()[TRANSACTION_FILE]).toBeDefined();
    library.save({ id: "welcom", title: "Welcome", text: "mine" });
    await library.flush();
    expect(metadata.files()[TRANSACTION_FILE]).toBeUndefined();
    expect(dir.files()).toEqual({ "Welcome.md": "mine", "Second note.md": "other tab" });
    expect(library.entry("second")?.hash).toBe(hashText("other tab"));
  });

  it("never stores document text in the catalog", async () => {
    const dir = createMemoryDirectory({ "Mine.md": "secret body" });
    const library = createLibrary(dir, { writeDelayMs: 1 });
    const catalogText = () => dir.childDirectory(CATALOG_DIRECTORY)!.files()[CATALOG_FILE];
    await library.load();
    expect(catalogText()).not.toContain("secret body");
    library.save({ id: "other0", title: "Other", text: "other body" });
    await library.flush();
    expect(catalogText()).not.toContain("secret body");
    expect(catalogText()).not.toContain("other body");
  });

  it("lists dirty documents with the hash they were based on", async () => {
    const dir = await seeded();
    const library = createLibrary(dir, { writeDelayMs: 60_000 });
    await library.load();
    expect(library.dirtyDocuments()).toEqual([]);
    library.save({ id: "welcom", title: "Welcome", text: "typing" });
    library.save({ id: "fresh0", title: "Fresh", text: "new" });
    expect(library.dirtyDocuments()).toEqual([
      { id: "welcom", title: "Welcome", text: "typing", bases: [hashText("# Welcome")] },
      { id: "fresh0", title: "Fresh", text: "new", bases: [] },
    ]);
    await library.flush();
    expect(library.dirtyDocuments()).toEqual([]);
  });

  it("keeps in-flight writes visible until they reach the directory", async () => {
    vi.useFakeTimers();
    const dir = await seeded();
    let release = () => {};
    let blocked = false;
    const started = Promise.withResolvers<void>();
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow = {
      ...dir,
      write: async (name: string, text: string) => {
        if (blocked) {
          started.resolve();
          await gate;
        }
        await dir.write(name, text);
      },
    };
    const library = createLibrary(slow);
    await library.load();
    blocked = true;
    library.save({ id: "welcom", title: "Welcome", text: "in flight" });
    vi.advanceTimersByTime(LIBRARY_WRITE_DELAY_MS);
    await started.promise;
    expect(library.pending()).toBe(true);
    expect(library.dirtyDocuments()).toEqual([
      { id: "welcom", title: "Welcome", text: "in flight", bases: [hashText("# Welcome")] },
    ]);
    library.save({ id: "welcom", title: "Welcome", text: "even newer" });
    expect(library.dirtyDocuments()).toEqual([
      {
        id: "welcom",
        title: "Welcome",
        text: "even newer",
        bases: [hashText("# Welcome"), hashText("in flight")],
      },
    ]);
    release();
    await library.flush();
    expect(library.dirtyDocuments()).toEqual([]);
    expect(library.pending()).toBe(false);
    expect(dir.files()["Welcome.md"]).toBe("even newer");
  });

  it("writes an icon change straight to the catalog without touching the file or its date", async () => {
    const dir = await seeded();
    const library = createLibrary(dir, { writeDelayMs: 60_000 });
    await library.load();
    const before = library.entry("welcom")!;
    const icon = { kind: "emoji", emoji: "📚" } as const;
    library.save({ id: "welcom", title: "Welcome", text: "# Welcome", icon });
    expect(library.dirtyDocuments()).toEqual([
      expect.objectContaining({ id: "welcom", icon, modified: before.modified }),
    ]);
    await library.flush();
    expect(library.pending()).toBe(false);
    expect(dir.files()["Welcome.md"]).toBe("# Welcome");
    expect(library.entry("welcom")).toMatchObject({ icon, modified: before.modified });
    expect(catalogOf(dir)?.documents.find((doc) => doc.id === "welcom")?.icon).toEqual(icon);

    library.save({ id: "welcom", title: "Welcome", text: "# Welcome", icon });
    expect(library.pending()).toBe(false);

    library.save({ id: "welcom", title: "Renamed", text: "typed" });
    await library.flush();
    expect(library.entry("welcom")).toMatchObject({ file: "Renamed.md", icon });
    const reopened = await createLibrary(dir).load();
    expect(reopened.find((doc) => doc.id === "welcom")?.icon).toEqual(icon);

    library.save({ id: "welcom", title: "Renamed", text: "typed", icon: null });
    await library.flush();
    expect(library.entry("welcom")).not.toHaveProperty("icon");
    expect(catalogOf(dir)?.documents.find((doc) => doc.id === "welcom")).not.toHaveProperty("icon");
  });

  it("keeps the file stamp on an icon-only save so the next refresh skips the file", async () => {
    const dir = await seeded();
    const library = createLibrary(dir, { writeDelayMs: 60_000 });
    await library.load();
    library.save({
      id: "welcom",
      title: "Welcome",
      text: "# Welcome",
      icon: { kind: "emoji", emoji: "📚" },
    });
    await library.flush();
    expect(catalogOf(dir)?.documents.find((doc) => doc.id === "welcom")?.synced).toBe(
      dir.info("Welcome.md")?.lastModified,
    );
    const read = vi.spyOn(dir, "read");
    await library.refresh(() => undefined);
    expect(read).not.toHaveBeenCalled();
  });

  it("restores an icon from a journal left by a closed tab", async () => {
    const dir = await seeded();
    const icon = { kind: "emoji", emoji: "📚" } as const;
    const key = `${JOURNAL_PREFIX}closed`;
    writeJournal(
      [{ id: "welcom", title: "Welcome", text: "# Welcome", bases: [hashText("# Welcome")], icon }],
      key,
    );
    try {
      const docs = await createLibrary(dir, { recoverJournals: true }).load();
      expect(docs.find((doc) => doc.id === "welcom")?.icon).toEqual(icon);
      expect(dir.files()["Welcome.md"]).toBe("# Welcome");
      expect(catalogOf(dir)?.documents.find((doc) => doc.id === "welcom")?.icon).toEqual(icon);
      expect(readJournals().some((snapshot) => snapshot.key === key)).toBe(false);
      const reopened = await createLibrary(dir).load();
      expect(reopened.find((doc) => doc.id === "welcom")?.icon).toEqual(icon);
    } finally {
      clearJournal(key);
    }
  });

  it("creates a file for a document it has never seen", async () => {
    const dir = createMemoryDirectory();
    const library = createLibrary(dir, { writeDelayMs: 1 });
    await library.load();
    library.save({ id: "fresh0", title: "Fresh", text: "new" });
    await library.flush();
    expect(dir.files()).toEqual({ "Fresh.md": "new" });
    expect(catalogOf(dir)?.documents[0]).toMatchObject({ id: "fresh0", file: "Fresh.md" });
  });
});

describe("library refresh", () => {
  it("reports external edits, additions, and deletions", async () => {
    const dir = await seeded();
    const library = createLibrary(dir, { writeDelayMs: 1 });
    const docs = await library.load();
    const texts = new Map(docs.map((doc) => [doc.id, doc.text]));
    dir.place("Welcome.md", "edited elsewhere", 900);
    dir.place("Dropped in.md", "hello", 901);
    dir.drop("Second note.md");
    const result = await library.refresh((id) => texts.get(id));
    expect(result.updated.map((doc) => [doc.id, doc.text])).toEqual([
      ["welcom", "edited elsewhere"],
    ]);
    expect(result.added.map((doc) => doc.title)).toEqual(["Dropped in"]);
    expect(result.removed).toEqual(["second"]);
    expect(library.entry("second")).toBeUndefined();
    expect(
      catalogOf(dir)
        ?.documents.map((entry) => entry.file)
        .sort(),
    ).toEqual(["Dropped in.md", "Welcome.md"]);
  });

  it("reports an icon changed by another window as an update", async () => {
    const dir = await seeded();
    const library = createLibrary(dir, { writeDelayMs: 1 });
    const docs = await library.load();
    const other = createLibrary(dir, { writeDelayMs: 1 });
    await other.load();
    const icon = { kind: "lucide", name: "map", color: "red" } as const;
    other.save({ id: "second", title: "Second: note", text: "# Second", icon });
    await other.flush();
    const texts = new Map(docs.map((doc) => [doc.id, doc.text]));
    const result = await library.refresh((id) => texts.get(id));
    expect(result.updated.map((doc) => [doc.id, doc.icon])).toEqual([["second", icon]]);
  });

  it("writes a conflict copy when a dirty document changed on disk", async () => {
    const dir = await seeded();
    const library = createLibrary(dir, { writeDelayMs: 60_000 });
    await library.load();
    library.save({ id: "welcom", title: "Welcome", text: "app edit" });
    dir.place("Welcome.md", "disk edit", 900);
    const result = await library.refresh(() => "app edit");
    expect(result.updated).toEqual([]);
    expect(result.added.map((doc) => [doc.file, doc.text])).toEqual([
      ["Welcome (conflict).md", "disk edit"],
    ]);
    await library.flush();
    expect(dir.files()["Welcome.md"]).toBe("app edit");
    expect(dir.files()["Welcome (conflict).md"]).toBe("disk edit");
  });

  it("is quiet when nothing changed", async () => {
    const dir = await seeded();
    const library = createLibrary(dir);
    const docs = await library.load();
    const result = await library.refresh((id) => docs.find((doc) => doc.id === id)?.text);
    expect(result).toEqual({ added: [], updated: [], removed: [] });
  });
});

describe("library failure recovery", () => {
  it.each(["transaction", "file", "remove", "catalog", "acknowledgement"])(
    "retains pending edits and recovers an interrupted %s operation",
    async (stage) => {
      const dir = await seeded();
      const onError = vi.fn();
      const library = createLibrary(dir, { onError });
      await library.load();
      const metadata = dir.childDirectory(CATALOG_DIRECTORY)!;
      const writeFile = dir.write;
      const removeFile = dir.remove;
      const writeMetadata = metadata.write;
      const removeMetadata = metadata.remove;
      let failing = true;
      dir.write = async (name, text) => {
        if (failing && stage === "file") throw new Error("write failed");
        await writeFile(name, text);
      };
      dir.remove = async (name) => {
        if (failing && stage === "remove") throw new Error("write failed");
        await removeFile(name);
      };
      metadata.write = async (name, text) => {
        if (
          failing &&
          ((stage === "transaction" && name === TRANSACTION_FILE) ||
            (stage === "catalog" && name === CATALOG_FILE))
        )
          throw new Error("write failed");
        await writeMetadata(name, text);
      };
      metadata.remove = async (name) => {
        if (failing && stage === "acknowledgement") throw new Error("write failed");
        await removeMetadata(name);
      };
      const edit = { id: "welcom", title: "Renamed", text: "recovered edit" };
      library.save(edit);
      await expect(library.flush()).rejects.toThrow("write failed");
      expect(library.pending()).toBe(true);
      expect(library.dirtyDocuments()).toEqual([{ ...edit, bases: [hashText("# Welcome")] }]);
      expect(library.entry("welcom")?.hash).toBe(hashText("# Welcome"));
      expect(onError).toHaveBeenCalled();
      failing = false;
      if (stage !== "transaction") {
        const reopened = await createLibrary(dir).load();
        expect(reopened.find((doc) => doc.id === "welcom")).toMatchObject(edit);
        expect(reopened.filter((doc) => doc.title === "Renamed")).toHaveLength(1);
      }
      library.save(edit);
      await library.flush();
      expect(library.pending()).toBe(false);
      expect(dir.files()).toEqual({ "Renamed.md": "recovered edit", "Second note.md": "# Second" });
      expect(metadata.files()[TRANSACTION_FILE]).toBeUndefined();
      expect((await createLibrary(dir).load()).find((doc) => doc.id === "welcom")).toMatchObject(
        edit,
      );
    },
  );

  it("keeps a newer edit made while a write fails", async () => {
    const dir = await seeded();
    const library = createLibrary(dir);
    await library.load();
    const write = dir.write;
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    dir.write = async () => {
      started.resolve();
      await release.promise;
      throw new Error("blocked write failed");
    };
    library.save({ id: "welcom", title: "Welcome", text: "first edit" });
    const saving = library.flush();
    await started.promise;
    library.save({ id: "welcom", title: "Welcome", text: "newest edit" });
    release.resolve();
    await expect(saving).rejects.toThrow("blocked write failed");
    expect(library.dirtyDocuments()[0].text).toBe("newest edit");
    dir.write = write;
    await library.flush();
    expect(dir.files()["Welcome.md"]).toBe("newest edit");
    expect(Object.keys(dir.files())).not.toContain("Welcome (conflict).md");
  });

  it("retains failed deletions for retry", async () => {
    const dir = await seeded();
    const library = createLibrary(dir);
    await library.load();
    const remove = dir.remove;
    dir.remove = async () => {
      throw new Error("cannot delete");
    };
    library.remove("welcom");
    await expect(library.flush()).rejects.toThrow("cannot delete");
    expect(library.pending()).toBe(true);
    expect(dir.files()["Welcome.md"]).toBe("# Welcome");
    dir.remove = remove;
    await library.flush();
    expect(library.pending()).toBe(false);
    expect((await createLibrary(dir).load()).map((doc) => doc.id)).toEqual(["second"]);
  });

  it("propagates catalog read failures instead of rebuilding identities", async () => {
    const dir = await seeded();
    await createLibrary(dir).load();
    const metadata = dir.childDirectory(CATALOG_DIRECTORY)!;
    const read = metadata.read;
    metadata.read = async (name) => {
      if (name === CATALOG_FILE) throw new Error("cannot read catalog");
      return read(name);
    };
    await expect(createLibrary(dir).load()).rejects.toThrow("cannot read catalog");
    expect(catalogOf(dir)?.documents.map((doc) => doc.id)).toEqual(["welcom", "second"]);
  });
});

describe("shared libraries", () => {
  it("preserves both edits from stale concurrent writers without a refresh", async () => {
    const dir = await seeded();
    const first = createLibrary(dir);
    const second = createLibrary(dir);
    await first.load();
    await second.load();
    first.save({ id: "welcom", title: "Welcome", text: "first tab" });
    second.save({ id: "welcom", title: "Welcome", text: "second tab" });
    await Promise.all([first.flush(), second.flush()]);
    expect(dir.files()["Welcome.md"]).toBe("second tab");
    expect(dir.files()["Welcome (conflict).md"]).toBe("first tab");
    const reopened = await createLibrary(dir).load();
    expect(reopened.find((doc) => doc.id === "welcom")?.text).toBe("second tab");
  });

  it("uses the shared catalog for new identities and concurrent filename allocation", async () => {
    const dir = await seeded();
    const first = createLibrary(dir);
    const second = createLibrary(dir);
    await first.load();
    await second.load();
    first.save({ id: "first0", title: "New", text: "first" });
    second.save({ id: "next00", title: "New", text: "second" });
    await Promise.all([first.flush(), second.flush()]);
    const result = await first.refresh(() => undefined);
    expect(result.added).toMatchObject([{ id: "next00", file: "New 2.md", text: "second" }]);
    expect(
      catalogOf(dir)
        ?.documents.map((doc) => doc.id)
        .sort(),
    ).toEqual(["first0", "next00", "second", "welcom"]);
    expect(dir.files()["New.md"]).toBe("first");
    expect(dir.files()["New 2.md"]).toBe("second");
  });
});

it("reuses confirmed text for unchanged files when saving one document", async () => {
  const dir = await seeded();
  const library = createLibrary(dir);
  await library.load();
  const read = vi.spyOn(dir, "read");
  library.save({ id: "welcom", title: "Welcome", text: "changed" });
  await library.flush();
  expect(read).not.toHaveBeenCalledWith("Second note.md");
  expect(dir.files()["Welcome.md"]).toBe("changed");
});

describe("library import", () => {
  const incoming = [
    { id: "welcom", title: "Welcome", text: "# Welcome", created: 1, modified: 2 },
    { id: "second", title: "Second: note", text: "changed", created: 3, modified: 4 },
    { id: "fresh0", title: "Fresh", text: "new", created: 5, modified: 6 },
  ];

  it("writes imported documents with their creation stamps and reports what was skipped", async () => {
    const dir = await seeded();
    const refreshes: LibraryRefresh[] = [];
    const library = createLibrary(dir, { onRefresh: (result) => refreshes.push(result) });
    await library.load();
    const result = await library.import(incoming);
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.added.map((doc) => doc.title).sort()).toEqual(["Fresh", "Second: note"]);
    expect(result.updated).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(refreshes).toEqual([{ added: result.added, updated: [], removed: [] }]);
    expect(dir.files()).toEqual({
      "Welcome.md": "# Welcome",
      "Second note.md": "# Second",
      "Second note 2.md": "changed",
      "Fresh.md": "new",
    });
    expect(library.entry("fresh0")).toMatchObject({ file: "Fresh.md", created: 5, modified: 6 });
    expect(library.entry("fresh0")!.synced).toBeGreaterThan(6);
    const copy = catalogOf(dir)!.documents.find((entry) => entry.file === "Second note 2.md")!;
    expect(copy.id).not.toBe("second");
    expect(copy.created).toBe(3);
    expect(copy.modified).toBe(4);
    expect(library.entry("second")?.hash).toBe(hashText("# Second"));
    expect(library.pending()).toBe(false);
    expect((await createLibrary(dir).load()).map((doc) => doc.id).sort()).toEqual(
      ["welcom", "second", "fresh0", copy.id].sort(),
    );
  });

  it("changes nothing when every document is already present", async () => {
    const dir = await seeded();
    const library = createLibrary(dir);
    await library.load();
    const before = catalogOf(dir);
    const result = await library.import([incoming[0], { ...incoming[0], id: "other0" }]);
    expect(result).toMatchObject({ imported: 0, skipped: 2, added: [], updated: [], removed: [] });
    expect(await library.import([])).toMatchObject({ imported: 0, skipped: 0, added: [] });
    expect(dir.files()).toEqual({ "Welcome.md": "# Welcome", "Second note.md": "# Second" });
    expect(catalogOf(dir)).toEqual(before);
  });

  it("merges against the folder on disk rather than what it last loaded", async () => {
    const dir = await seeded();
    const library = createLibrary(dir);
    await library.load();
    dir.place("Fresh.md", "new");
    const result = await library.import([incoming[2]]);
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.added.map((doc) => doc.file)).toEqual(["Fresh.md"]);
    expect(Object.keys(dir.files()).sort()).toEqual(["Fresh.md", "Second note.md", "Welcome.md"]);
  });
});
