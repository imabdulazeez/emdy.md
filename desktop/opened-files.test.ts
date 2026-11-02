import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { FolderResult, OpenedFileChange } from "../src/lib/desktop/bridge";
import { hashText } from "../src/lib/storage/hash";
import {
  createOpenedFiles,
  isOpenedFileChange,
  isOpenedFileEntry,
  markdownPathsFromArgv,
  readOpenedFileEntries,
  writeOpenedFileEntries,
} from "./opened-files";

let root: string;
let outside: string;
let library: string;
let store: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "emdy-opened-")));
  outside = join(root, "Downloads");
  library = join(root, "emdy");
  store = join(root, "data", "opened-files.json");
  await mkdir(outside);
  await mkdir(library);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function files(onWrite?: (path: string) => void) {
  return createOpenedFiles({ store, libraryFolder: () => library, onWrite, platform: "linux" });
}

function unwrap<T>(result: FolderResult<T>): T {
  if (!result.ok) throw new Error(`${result.error.name}: ${result.error.message}`);
  return result.value;
}

function change(text: string, base: string, title = "Notes"): OpenedFileChange {
  return { title, text, base, icon: null };
}

describe("isOpenedFileEntry", () => {
  it("accepts an id with an absolute Markdown path and an optional icon", () => {
    expect(isOpenedFileEntry({ id: "abc123", path: "/tmp/Notes.md" })).toBe(true);
    expect(isOpenedFileEntry({ id: "abc123", path: "/tmp/Plan.markdown" })).toBe(true);
    expect(
      isOpenedFileEntry({ id: "abc123", path: "/tmp/a.md", icon: { kind: "emoji", emoji: "📝" } }),
    ).toBe(true);
  });

  it("rejects relative paths, other extensions, bad ids, and bad icons", () => {
    expect(isOpenedFileEntry({ id: "abc123", path: "Notes.md" })).toBe(false);
    expect(isOpenedFileEntry({ id: "abc123", path: "/tmp/notes.txt" })).toBe(false);
    expect(isOpenedFileEntry({ id: "ABC", path: "/tmp/a.md" })).toBe(false);
    expect(isOpenedFileEntry({ id: "abc123", path: "/tmp/a.md", icon: { kind: "x" } })).toBe(false);
    expect(isOpenedFileEntry(null)).toBe(false);
  });
});

describe("isOpenedFileChange", () => {
  it("requires a title, text, base hash, and a valid icon or null", () => {
    expect(isOpenedFileChange(change("# Notes", "0"))).toBe(true);
    expect(isOpenedFileChange({ title: "a", text: "b", base: "c" })).toBe(false);
    expect(isOpenedFileChange({ title: "a", text: 1, base: "c", icon: null })).toBe(false);
    expect(isOpenedFileChange("text")).toBe(false);
  });
});

describe("opened file store", () => {
  it("round-trips valid entries and drops invalid or duplicate ones", async () => {
    await writeOpenedFileEntries(store, [
      { id: "aaaaaa", path: "/tmp/One.md" },
      { id: "bbbbbb", path: "/tmp/Two.md", icon: { kind: "emoji", emoji: "📝" } },
    ]);
    expect(await readOpenedFileEntries(store)).toEqual([
      { id: "aaaaaa", path: "/tmp/One.md" },
      { id: "bbbbbb", path: "/tmp/Two.md", icon: { kind: "emoji", emoji: "📝" } },
    ]);

    await writeFile(
      store,
      JSON.stringify({
        files: [
          { id: "aaaaaa", path: "/tmp/One.md" },
          { id: "aaaaaa", path: "/tmp/Other.md" },
          { id: "cccccc", path: "/tmp/One.md" },
          { id: "dddddd", path: "relative.md" },
        ],
      }),
    );
    expect(await readOpenedFileEntries(store)).toEqual([{ id: "aaaaaa", path: "/tmp/One.md" }]);
  });

  it("falls back to no files when the store is missing or malformed", async () => {
    expect(await readOpenedFileEntries(store)).toEqual([]);
    await mkdir(join(root, "data"));
    await writeFile(store, "{not json");
    expect(await readOpenedFileEntries(store)).toEqual([]);
    await writeFile(store, JSON.stringify({ files: "nope" }));
    expect(await readOpenedFileEntries(store)).toEqual([]);
  });
});

describe("markdownPathsFromArgv", () => {
  it("keeps Markdown paths and file URLs, resolved against the working directory", () => {
    expect(
      markdownPathsFromArgv(
        [
          "/Applications/emdy.app/Contents/MacOS/emdy",
          "--allow-file-access-from-files",
          "notes/Plan.md",
          "/abs/Road map.markdown",
          pathToFileURL("/abs/From url.md").href,
          "/abs/photo.png",
          "/abs/app",
        ],
        "/home/ada",
      ),
    ).toEqual(["/home/ada/notes/Plan.md", "/abs/Road map.markdown", "/abs/From url.md"]);
  });

  it("ignores the executable itself and malformed file URLs", () => {
    expect(markdownPathsFromArgv(["/tmp/emdy.md"], "/")).toEqual([]);
    expect(markdownPathsFromArgv(["emdy", "file://host/x.md"], "/")).toEqual([]);
  });
});

describe("createOpenedFiles", () => {
  it("registers a Markdown file from another folder and lists its contents", async () => {
    const path = join(outside, "Notes.md");
    await writeFile(path, "# Notes");
    const opened = files();
    await opened.load();

    expect(await opened.open([path])).toBe(1);
    const [request] = opened.takeRequests();
    expect(request).toEqual({ kind: "file", id: expect.stringMatching(/^[a-z0-9]{6}$/) });
    expect(opened.takeRequests()).toEqual([]);
    const id = (request as { id: string }).id;

    const list = unwrap(await opened.list([]));
    expect(list.missing).toEqual([]);
    expect(list.files).toEqual([
      { id, name: "Notes.md", text: "# Notes", modified: expect.any(Number), icon: null },
    ]);
    expect(opened.locate(id)).toBe(path);
    expect(opened.folders()).toEqual(new Map([[outside, new Set(["Notes.md"])]]));
    expect(await readOpenedFileEntries(store)).toEqual([{ id, path }]);
  });

  it("reuses the id when the same file is opened again, even through a link", async () => {
    const path = join(outside, "Notes.md");
    await writeFile(path, "# Notes");
    await symlink(path, join(outside, "Alias.md"));
    const opened = files();
    await opened.load();
    await opened.open([path]);
    await opened.open([join(outside, "Alias.md")]);
    const [first, second] = opened.takeRequests();
    expect(second).toEqual(first);
    expect(unwrap(await opened.list([])).files).toHaveLength(1);
  });

  it("refuses relative paths, other file types, folders, and missing files", async () => {
    await writeFile(join(outside, "photo.png"), "png");
    await mkdir(join(outside, "folder.md"));
    const opened = files();
    await opened.load();
    expect(
      await opened.open([
        "Notes.md",
        join(outside, "photo.png"),
        join(outside, "folder.md"),
        join(outside, "Missing.md"),
        42,
      ]),
    ).toBe(0);
    expect(opened.takeRequests()).toEqual([]);
  });

  it("turns a file inside the library folder into a request for that library document", async () => {
    const path = join(library, "Library note.md");
    await writeFile(path, "# In the library");
    const opened = files();
    await opened.load();
    expect(await opened.open([path])).toBe(1);
    expect(opened.takeRequests()).toEqual([{ kind: "library", name: "Library note.md" }]);
    expect(unwrap(await opened.list([])).files).toEqual([]);
  });

  it("restores registered files after a restart and reports ones that vanished", async () => {
    const kept = join(outside, "Kept.md");
    const gone = join(outside, "Gone.md");
    await writeFile(kept, "kept");
    await writeFile(gone, "gone");
    const first = files();
    await first.load();
    await first.open([kept, gone]);
    const [keptId, goneId] = first.takeRequests().map((request) => (request as { id: string }).id);
    await rm(gone);

    const second = files();
    await second.load();
    const list = unwrap(await second.list([]));
    expect(list.files.map((file) => file.id)).toEqual([keptId]);
    expect(list.missing).toEqual([goneId]);

    await second.close(goneId);
    expect((await readOpenedFileEntries(store)).map((entry) => entry.id)).toEqual([keptId]);
  });

  it("re-mints an id that collides with a library document", async () => {
    const path = join(outside, "Notes.md");
    await writeFile(path, "# Notes");
    const opened = files();
    await opened.load();
    await opened.open([path]);
    const [{ id }] = opened.takeRequests() as { id: string }[];

    const [file] = unwrap(await opened.list([id])).files;
    expect(file.id).not.toBe(id);
    expect(opened.locate(file.id)).toBe(path);
    expect(opened.locate(id)).toBeNull();
  });

  it("drops a file that now lives in the library folder", async () => {
    const path = join(outside, "Notes.md");
    await writeFile(path, "# Notes");
    let folder = library;
    const opened = createOpenedFiles({ store, libraryFolder: () => folder, platform: "linux" });
    await opened.load();
    await opened.open([path]);
    const [{ id }] = opened.takeRequests() as { id: string }[];
    folder = outside;
    expect(unwrap(await opened.list([]))).toEqual({ files: [], missing: [id] });
    expect(opened.locate(id)).toBeNull();
  });

  it("writes edits back to the file in its own folder, never the library", async () => {
    const path = join(outside, "Notes.md");
    await writeFile(path, "# Notes");
    const onWrite = vi.fn();
    const opened = files(onWrite);
    await opened.load();
    await opened.open([path]);
    const [{ id }] = opened.takeRequests() as { id: string }[];

    const saved = unwrap(await opened.save(id, change("# Notes\n\nEdited.", hashText("# Notes"))));
    expect(saved.conflict).toBeNull();
    expect(saved.file).toMatchObject({ id, name: "Notes.md", text: "# Notes\n\nEdited." });
    expect(await readFile(path, "utf8")).toBe("# Notes\n\nEdited.");
    expect(onWrite).toHaveBeenCalledWith(path);
    expect(await readdir(library)).toEqual([]);
    expect(await readdir(outside)).toEqual(["Notes.md"]);
  });

  it("keeps the file's permissions when it replaces it", async () => {
    const path = join(outside, "Script.md");
    await writeFile(path, "a", { mode: 0o600 });
    const opened = files();
    await opened.load();
    await opened.open([path]);
    const [{ id }] = opened.takeRequests() as { id: string }[];
    unwrap(await opened.save(id, change("b", hashText("a"), "Script")));
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it("renames the file, keeping its extension, when the title changes", async () => {
    const path = join(outside, "draft.markdown");
    await writeFile(path, "text");
    await writeFile(join(outside, "Plan.markdown"), "taken");
    const opened = files();
    await opened.load();
    await opened.open([path]);
    const [{ id }] = opened.takeRequests() as { id: string }[];

    const saved = unwrap(await opened.save(id, change("text", hashText("text"), "Plan")));
    expect(saved.file.name).toBe("Plan 2.markdown");
    expect(opened.locate(id)).toBe(join(outside, "Plan 2.markdown"));
    expect((await readdir(outside)).sort()).toEqual(["Plan 2.markdown", "Plan.markdown"]);
    expect(await readOpenedFileEntries(store)).toEqual([
      { id, path: join(outside, "Plan 2.markdown") },
    ]);
  });

  it("leaves the name alone while the title still matches it", async () => {
    const path = join(outside, "  spaced  .md");
    await writeFile(path, "a");
    const opened = files();
    await opened.load();
    await opened.open([path]);
    const [{ id }] = opened.takeRequests() as { id: string }[];
    unwrap(await opened.save(id, change("b", hashText("a"), "spaced")));
    expect(await readdir(outside)).toEqual(["  spaced  .md"]);
  });

  it("keeps an outside edit as a conflict copy when both sides changed", async () => {
    const path = join(outside, "Notes.md");
    await writeFile(path, "original");
    const opened = files();
    await opened.load();
    await opened.open([path]);
    const [{ id }] = opened.takeRequests() as { id: string }[];
    await writeFile(path, "changed elsewhere");

    const saved = unwrap(await opened.save(id, change("changed here", hashText("original"))));
    expect(await readFile(path, "utf8")).toBe("changed here");
    expect(saved.conflict).toMatchObject({
      name: "Notes (conflict).md",
      text: "changed elsewhere",
    });
    expect(await readFile(join(outside, "Notes (conflict).md"), "utf8")).toBe("changed elsewhere");
    expect(opened.locate(saved.conflict!.id)).toBe(join(outside, "Notes (conflict).md"));
  });

  it("recreates a file that disappeared while it had unsaved edits", async () => {
    const path = join(outside, "Notes.md");
    await writeFile(path, "a");
    const opened = files();
    await opened.load();
    await opened.open([path]);
    const [{ id }] = opened.takeRequests() as { id: string }[];
    await rm(path);
    unwrap(await opened.save(id, change("b", hashText("a"))));
    expect(await readFile(path, "utf8")).toBe("b");
  });

  it("stores the chosen icon with the file and forgets it when reset", async () => {
    const path = join(outside, "Notes.md");
    await writeFile(path, "a");
    const opened = files();
    await opened.load();
    await opened.open([path]);
    const [{ id }] = opened.takeRequests() as { id: string }[];
    const icon = { kind: "emoji", emoji: "📝" } as const;

    const saved = unwrap(await opened.save(id, { ...change("a", hashText("a")), icon }));
    expect(saved.file.icon).toEqual(icon);
    expect(await readOpenedFileEntries(store)).toEqual([{ id, path, icon }]);
    unwrap(await opened.save(id, change("a", hashText("a"))));
    expect(await readOpenedFileEntries(store)).toEqual([{ id, path }]);
  });

  it("rejects saves for unknown ids and malformed changes", async () => {
    const path = join(outside, "Notes.md");
    await writeFile(path, "a");
    const opened = files();
    await opened.load();
    await opened.open([path]);
    const [{ id }] = opened.takeRequests() as { id: string }[];
    expect(await opened.save("zzzzzz", change("b", "0"))).toEqual({
      ok: false,
      error: { name: "NotFoundError", message: "That file is no longer open." },
    });
    expect(await opened.save(id, { text: "b" })).toMatchObject({
      ok: false,
      error: { name: "TypeError" },
    });
    expect(await readFile(path, "utf8")).toBe("a");
  });
});
