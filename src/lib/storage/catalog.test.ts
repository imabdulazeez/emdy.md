import { describe, expect, it, vi } from "vite-plus/test";
import {
  CATALOG_VERSION,
  conflictFilename,
  entryFor,
  isCatalog,
  parseCatalog,
  reconcile,
  serializeCatalog,
  withIcon,
  type CatalogEntry,
} from "./catalog";
import { createMemoryDirectory } from "./directory";
import { hashText } from "./hash";

const entry = (overrides: Partial<CatalogEntry> & { text?: string } = {}): CatalogEntry => {
  const text = overrides.text ?? "body";
  return {
    id: "abc123",
    file: "Notes.md",
    title: "Notes",
    hash: hashText(text),
    size: new TextEncoder().encode(text).length,
    modified: 10,
    created: 5,
    synced: 10,
    ...overrides,
  };
};

describe("catalog validation", () => {
  it("accepts a well-formed catalog and rejects malformed ones", () => {
    expect(isCatalog({ version: CATALOG_VERSION, documents: [entry()] })).toBe(true);
    expect(isCatalog({ version: 2, documents: [] })).toBe(false);
    expect(isCatalog({ version: 1, documents: [{ id: "x" }] })).toBe(false);
    expect(isCatalog({ version: 1, documents: [entry({ id: "TOO-LONG" })] })).toBe(false);
    expect(isCatalog({ version: 1, documents: [entry({ file: "notes.txt" })] })).toBe(false);
    expect(isCatalog({ version: 1, documents: [entry({ size: -1 })] })).toBe(false);
    expect(isCatalog({ version: 1, documents: [entry({ synced: -1 })] })).toBe(false);
    expect(isCatalog(null)).toBe(false);
  });

  it("accepts entries written before synced existed and syncs them to modified", () => {
    const { synced: _synced, ...unsynced } = entry({ modified: 42 });
    expect(isCatalog({ version: 1, documents: [unsynced] })).toBe(true);
    const parsed = parseCatalog(JSON.stringify({ version: 1, documents: [unsynced] }));
    expect(parsed?.documents).toEqual([{ ...unsynced, synced: 42 }]);
  });

  it("rejects duplicate ids and duplicate filenames", () => {
    expect(isCatalog({ version: 1, documents: [entry(), entry({ file: "Other.md" })] })).toBe(
      false,
    );
    expect(isCatalog({ version: 1, documents: [entry(), entry({ id: "zzz999" })] })).toBe(false);
  });

  it("parses JSON leniently and serializes in creation order", () => {
    expect(parseCatalog(null)).toBeNull();
    expect(parseCatalog("{not json")).toBeNull();
    expect(parseCatalog(JSON.stringify({ version: 1, documents: [] }))).toEqual({
      version: 1,
      documents: [],
    });
    const later = entry({ id: "later0", file: "Later.md", created: 9 });
    const earlier = entry({ id: "early0", file: "Early.md", created: 1 });
    const raw = serializeCatalog([later, earlier]);
    expect(raw.endsWith("\n")).toBe(true);
    expect(parseCatalog(raw)?.documents.map((doc) => doc.id)).toEqual(["early0", "later0"]);
  });

  it("keeps a valid document icon and drops an invalid one without losing the entry", () => {
    const icon = { kind: "emoji", emoji: "📝" } as const;
    const raw = serializeCatalog([
      entry({ icon }),
      { ...entry({ id: "bad001", file: "Bad.md" }), icon: { kind: "gif" } } as never,
    ]);
    const parsed = parseCatalog(raw)!;
    const byId = new Map(parsed.documents.map((doc) => [doc.id, doc]));
    expect(byId.size).toBe(2);
    expect(byId.get("abc123")?.icon).toEqual(icon);
    expect(byId.get("bad001")).not.toHaveProperty("icon");
    expect(withIcon(entry({ icon }), null)).not.toHaveProperty("icon");
    expect(withIcon(entry(), icon).icon).toEqual(icon);
  });

  it("builds entries with a hash and names conflict copies", () => {
    const loaded = entryFor("abc123", "A.md", "A", "text", 4, 1, 1);
    expect(loaded.hash).toBe(hashText("text"));
    expect(loaded.text).toBe("text");
    expect(loaded.synced).toBe(0);
    expect(entryFor("abc123", "A.md", "A", "text", 4, 1, 1, 7).synced).toBe(7);
    expect(conflictFilename("Notes", ["Notes.md"])).toBe("Notes (conflict).md");
    expect(conflictFilename("Notes", ["Notes (conflict).md"])).toBe("Notes (conflict) 2.md");
  });
});

describe("reconcile", () => {
  it("adopts a folder without a catalog, deriving titles from filenames", async () => {
    const dir = createMemoryDirectory(
      { "Zeta.md": "z", "Alpha.md": "a", "notes.txt": "skip" },
      () => 50,
    );
    const result = await reconcile([], await dir.list(), { read: dir.read, now: 50 });
    expect(result.documents.map((doc) => doc.title)).toEqual(["Alpha", "Zeta"]);
    expect(result.documents.map((doc) => doc.text)).toEqual(["a", "z"]);
    expect(new Set(result.documents.map((doc) => doc.id)).size).toBe(2);
    for (const doc of result.documents) expect(doc.id).toMatch(/^[a-z0-9]{6}$/);
    expect(result.added).toHaveLength(2);
    expect(result.changed).toBe(true);
    expect(result.removed).toEqual([]);
  });

  it("keeps ids, titles, and creation dates for files that match the catalog", async () => {
    const dir = createMemoryDirectory({}, () => 10);
    dir.place("Notes.md", "body", 10);
    const previous = [entry({ title: "Notes: with colon" })];
    const result = await reconcile(previous, await dir.list(), {
      read: dir.read,
      now: 99,
      readAll: true,
    });
    expect(result.documents).toEqual([{ ...previous[0], text: "body" }]);
    expect(result.changed).toBe(false);
    expect(result.updated).toEqual([]);
  });

  it("skips reading untouched files when a previous text is available", async () => {
    const dir = createMemoryDirectory();
    dir.place("Notes.md", "body", 10);
    const read = vi.fn(dir.read);
    const result = await reconcile([entry()], await dir.list(), {
      read,
      now: 99,
      previousText: () => "cached",
    });
    expect(read).not.toHaveBeenCalled();
    expect(result.documents[0].text).toBe("cached");
  });

  it("reads every file that needs reading concurrently and keeps the listing order", async () => {
    const dir = createMemoryDirectory({}, () => 10);
    dir.place("Notes.md", "edited", 20);
    dir.place("Fresh.md", "fresh", 30);
    dir.place("Other.md", "other", 40);
    const release = Promise.withResolvers<void>();
    const started: string[] = [];
    const read = async (name: string) => {
      started.push(name);
      if (started.length === 3) release.resolve();
      await release.promise;
      return dir.read(name);
    };
    const result = await reconcile([entry()], await dir.list(), { read, now: 99 });
    expect(started).toEqual(["Notes.md", "Fresh.md", "Other.md"]);
    expect(result.updated.map((doc) => [doc.id, doc.text])).toEqual([["abc123", "edited"]]);
    expect(result.added.map((doc) => [doc.file, doc.text])).toEqual([
      ["Fresh.md", "fresh"],
      ["Other.md", "other"],
    ]);
  });

  it("reports edited files as updates and refreshes their metadata", async () => {
    const dir = createMemoryDirectory();
    dir.place("Notes.md", "changed outside", 20);
    const result = await reconcile([entry()], await dir.list(), { read: dir.read, now: 99 });
    expect(result.updated.map((doc) => doc.id)).toEqual(["abc123"]);
    expect(result.documents[0]).toMatchObject({
      id: "abc123",
      title: "Notes",
      text: "changed outside",
      hash: hashText("changed outside"),
      modified: 20,
      synced: 20,
    });
    expect(result.changed).toBe(true);
  });

  it("carries a document icon across edits and renames", async () => {
    const icon = { kind: "lucide", name: "map", color: "teal" } as const;
    const previous = [
      entry({ icon }),
      entry({ id: "moved0", file: "Old.md", text: "moved", icon }),
    ];
    const dir = createMemoryDirectory({ "Notes.md": "edited", "New.md": "moved" });
    const result = await reconcile(previous, await dir.list(), { read: dir.read, now: 1 });
    expect(result.documents.find((doc) => doc.id === "abc123")?.icon).toEqual(icon);
    expect(result.documents.find((doc) => doc.id === "moved0")).toMatchObject({
      file: "New.md",
      icon,
    });
  });

  it("keeps the recorded write time for a touched file with identical content", async () => {
    const dir = createMemoryDirectory();
    dir.place("Notes.md", "body", 33);
    const result = await reconcile([entry()], await dir.list(), { read: dir.read, now: 99 });
    expect(result.updated).toEqual([]);
    expect(result.documents[0].modified).toBe(10);
    expect(result.documents[0].synced).toBe(33);
    expect(result.changed).toBe(true);
  });

  it("keeps an imported write time once the app's own write lands on disk", async () => {
    const dir = createMemoryDirectory();
    dir.place("Notes.md", "body", 40);
    const written = entry({ modified: 3, synced: 0 });
    const result = await reconcile([written], await dir.list(), { read: dir.read, now: 99 });
    expect(result.documents[0]).toMatchObject({ modified: 3, synced: 40 });
    expect(result.changed).toBe(true);
    const again = await reconcile(result.documents, await dir.list(), {
      read: dir.read,
      now: 99,
      previousText: () => "body",
    });
    expect(again.changed).toBe(false);
    expect(again.documents[0].modified).toBe(3);
  });

  it("detects a renamed file by content hash and takes the title from the new name", async () => {
    const dir = createMemoryDirectory();
    dir.place("Renamed outside.md", "body", 10);
    const result = await reconcile([entry({ created: 3 })], await dir.list(), {
      read: dir.read,
      now: 99,
    });
    expect(result.documents).toEqual([
      {
        id: "abc123",
        file: "Renamed outside.md",
        title: "Renamed outside",
        hash: hashText("body"),
        size: 4,
        modified: 10,
        created: 3,
        synced: 10,
        text: "body",
      },
    ]);
    expect(result.updated.map((doc) => doc.file)).toEqual(["Renamed outside.md"]);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it("removes catalog entries whose files disappeared", async () => {
    const dir = createMemoryDirectory();
    const result = await reconcile([entry()], await dir.list(), { read: dir.read, now: 99 });
    expect(result.documents).toEqual([]);
    expect(result.removed.map((doc) => doc.id)).toEqual(["abc123"]);
    expect(result.changed).toBe(true);
  });

  it("keeps the app's text and reports a conflict when a dirty document changed on disk", async () => {
    const dir = createMemoryDirectory();
    dir.place("Notes.md", "disk version", 20);
    const result = await reconcile([entry()], await dir.list(), {
      read: dir.read,
      now: 99,
      dirty: new Set(["abc123"]),
      previousText: () => "app version",
    });
    expect(result.conflicts.map((doc) => doc.text)).toEqual(["disk version"]);
    expect(result.updated).toEqual([]);
    expect(result.documents[0].text).toBe("app version");
    expect(result.documents[0].hash).toBe(hashText("body"));
  });

  it("never reuses an existing id for new files", async () => {
    const dir = createMemoryDirectory({ "New.md": "fresh" });
    const result = await reconcile([entry()], await dir.list(), { read: dir.read, now: 99 });
    expect(result.added).toHaveLength(1);
    expect(result.added[0].id).not.toBe("abc123");
    expect(result.added[0].created).toBeGreaterThan(0);
  });
});
