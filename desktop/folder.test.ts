import {
  chmod,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  createFolderAccess,
  describeFailure,
  FolderFault,
  isSafeSegment,
  stagingName,
  writeStaged,
} from "./folder";

let root: string;
let session: number;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "emdy-folder-"));
  session = 1;
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function access(onWrite?: (path: readonly string[], name: string) => void) {
  return createFolderAccess({ root: () => root, session: () => session, onWrite });
}

describe("isSafeSegment", () => {
  it("accepts ordinary file and folder names", () => {
    expect(isSafeSegment("Notes.md")).toBe(true);
    expect(isSafeSegment(".emdy")).toBe(true);
    expect(isSafeSegment("Weekly sync — product.md")).toBe(true);
  });

  it("rejects anything that could leave the folder", () => {
    expect(isSafeSegment("")).toBe(false);
    expect(isSafeSegment(".")).toBe(false);
    expect(isSafeSegment("..")).toBe(false);
    expect(isSafeSegment("a/b.md")).toBe(false);
    expect(isSafeSegment("a\\b.md")).toBe(false);
    expect(isSafeSegment("a\u0000b")).toBe(false);
    expect(isSafeSegment("x".repeat(256))).toBe(false);
    expect(isSafeSegment(42)).toBe(false);
  });
});

describe("describeFailure", () => {
  it("maps file-system errors to the names the storage layer understands", () => {
    const code = (value: string) => Object.assign(new Error(value), { code: value });
    expect(describeFailure(code("ENOENT"), "a.md")).toEqual({
      name: "NotFoundError",
      message: "A requested file or directory could not be found: a.md",
    });
    expect(describeFailure(code("EISDIR"), "a.md").name).toBe("TypeMismatchError");
    expect(describeFailure(code("EACCES"), "a.md").name).toBe("NotAllowedError");
    expect(describeFailure(code("EROFS"), "a.md").message).toMatch(/read-only/);
    expect(describeFailure(code("ENOSPC"), "a.md").message).toBe("The disk is full.");
    expect(describeFailure(code("ENAMETOOLONG"), "a.md").message).toMatch(/too long/);
    expect(describeFailure(new FolderFault("InvalidStateError", "changed"), "a.md")).toEqual({
      name: "InvalidStateError",
      message: "changed",
    });
    expect(describeFailure(new Error("boom"), "a.md")).toEqual({ name: "Error", message: "boom" });
    expect(describeFailure("odd", "a.md")).toEqual({ name: "Error", message: "odd" });
  });
});

describe("createFolderAccess", () => {
  it("opens an existing folder and reports a missing one by name", async () => {
    expect(await access().open()).toEqual({ ok: true, value: 1 });
    const missing = join(root, "gone");
    const result = await createFolderAccess({ root: () => missing, session: () => 1 }).open();
    expect(result).toEqual({
      ok: false,
      error: { name: "NotFoundError", message: `The folder “${missing}” can’t be found.` },
    });
  });

  it("creates the default folder when it is missing", async () => {
    const missing = join(root, "Documents", "emdy");
    const result = await createFolderAccess({
      root: () => missing,
      session: () => 1,
      createRoot: () => true,
    }).open();
    expect(result).toEqual({ ok: true, value: 1 });
    expect((await stat(missing)).isDirectory()).toBe(true);
  });

  it.skipIf(process.platform === "win32")(
    "reports a default folder it isn't allowed to create instead of throwing",
    async () => {
      const locked = join(root, "locked");
      await mkdir(locked);
      await chmod(locked, 0o500);
      try {
        const result = await createFolderAccess({
          root: () => join(locked, "emdy"),
          session: () => 1,
          createRoot: () => true,
        }).open();
        expect(result).toMatchObject({ ok: false, error: { name: "NotAllowedError" } });
      } finally {
        await chmod(locked, 0o700);
      }
    },
  );

  it("refuses to open a file as the documents folder", async () => {
    const file = join(root, "file.md");
    await writeFile(file, "x");
    const result = await createFolderAccess({ root: () => file, session: () => 1 }).open();
    expect(result).toMatchObject({ ok: false, error: { name: "TypeMismatchError" } });
  });

  it("writes plain files atomically and leaves no staging files behind", async () => {
    const onWrite = vi.fn();
    const folder = access(onWrite);
    expect(await folder.write(1, [], "Notes.md", "# Notes\n")).toEqual({ ok: true, value: null });
    expect(await readFile(join(root, "Notes.md"), "utf8")).toBe("# Notes\n");
    expect(await readdir(root)).toEqual(["Notes.md"]);
    expect(onWrite).toHaveBeenCalledWith([], "Notes.md");
    await folder.write(1, [], "Notes.md", "# Replaced\n");
    expect(await readFile(join(root, "Notes.md"), "utf8")).toBe("# Replaced\n");
  });

  it("writes through a symlinked document and keeps the link", async () => {
    const elsewhere = await mkdtemp(join(tmpdir(), "emdy-elsewhere-"));
    try {
      await writeFile(join(elsewhere, "notes.md"), "old");
      await symlink(join(elsewhere, "notes.md"), join(root, "notes.md"));
      expect(await access().write(1, [], "notes.md", "new")).toEqual({ ok: true, value: null });
      expect((await lstat(join(root, "notes.md"))).isSymbolicLink()).toBe(true);
      expect(await readFile(join(elsewhere, "notes.md"), "utf8")).toBe("new");
      expect(await readdir(elsewhere)).toEqual(["notes.md"]);
    } finally {
      await rm(elsewhere, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")("keeps a document's permissions", async () => {
    await writeFile(join(root, "Private.md"), "a", { mode: 0o600 });
    await access().write(1, [], "Private.md", "b");
    expect(await readFile(join(root, "Private.md"), "utf8")).toBe("b");
    expect((await stat(join(root, "Private.md"))).mode & 0o777).toBe(0o600);
  });

  it("reports what landed on disk after a write", async () => {
    const onWritten = vi.fn();
    const folder = createFolderAccess({ root: () => root, session: () => session, onWritten });
    await folder.write(1, [], "Notes.md", "héllo");
    const info = await stat(join(root, "Notes.md"));
    expect(onWritten).toHaveBeenCalledWith([], "Notes.md", {
      size: 6,
      mtimeMs: info.mtimeMs,
    });
  });

  it("lists files with byte sizes and whole-millisecond times, skipping folders", async () => {
    await writeFile(join(root, "a.md"), "héllo");
    await utimes(join(root, "a.md"), 1_700_000_000.5, 1_700_000_000.5);
    await mkdir(join(root, ".emdy"));
    await writeFile(join(root, "target.md"), "t");
    await symlink(join(root, "target.md"), join(root, "link.md"));
    const result = await access().list(1, []);
    expect(result.ok).toBe(true);
    const files = result.ok ? result.value.sort((a, b) => a.name.localeCompare(b.name)) : [];
    expect(files.map((file) => file.name)).toEqual(["a.md", "link.md", "target.md"]);
    expect(files[0]).toEqual({ name: "a.md", size: 6, lastModified: 1_700_000_000_500 });
  });

  it("reads, stats, renames, and removes files", async () => {
    const folder = access();
    await folder.write(1, [], "a.md", "text");
    expect(await folder.read(1, [], "a.md")).toEqual({ ok: true, value: "text" });
    const info = await folder.stat(1, [], "a.md");
    expect(info).toMatchObject({ ok: true, value: { name: "a.md", size: 4 } });
    expect(await folder.rename(1, [], "a.md", "b.md")).toEqual({ ok: true, value: null });
    expect(await readdir(root)).toEqual(["b.md"]);
    expect(await folder.remove(1, [], "b.md")).toEqual({ ok: true, value: null });
    expect(await readdir(root)).toEqual([]);
  });

  it("reports a missing file as NotFoundError", async () => {
    const folder = access();
    expect(await folder.read(1, [], "nope.md")).toMatchObject({
      ok: false,
      error: { name: "NotFoundError" },
    });
    expect(await folder.remove(1, [], "nope.md")).toMatchObject({
      ok: false,
      error: { name: "NotFoundError" },
    });
  });

  it("refuses to stat a folder as a file", async () => {
    await mkdir(join(root, "dir.md"));
    expect(await access().stat(1, [], "dir.md")).toMatchObject({
      ok: false,
      error: { name: "TypeMismatchError" },
    });
  });

  it("creates and works inside child folders", async () => {
    const folder = access();
    expect(await folder.ensure(1, [".emdy"])).toEqual({ ok: true, value: null });
    await folder.write(1, [".emdy"], "index.json", "{}");
    expect(await readFile(join(root, ".emdy", "index.json"), "utf8")).toBe("{}");
    expect(await folder.list(1, [])).toEqual({ ok: true, value: [] });
  });

  it("rejects names and paths that would escape the folder", async () => {
    const folder = access();
    expect(await folder.read(1, [], "../secret")).toMatchObject({
      ok: false,
      error: { name: "TypeError" },
    });
    expect(await folder.write(1, [".."], "x.md", "x")).toMatchObject({
      ok: false,
      error: { name: "TypeError" },
    });
    expect(await folder.list(1, "not-an-array")).toMatchObject({
      ok: false,
      error: { name: "TypeError" },
    });
    expect(await folder.write(1, [], "x.md", 5)).toMatchObject({
      ok: false,
      error: { name: "TypeError" },
    });
    expect(await readdir(root)).toEqual([]);
  });

  it("rejects calls from a library opened before the folder changed", async () => {
    const folder = access();
    session = 2;
    expect(await folder.write(1, [], "late.md", "x")).toEqual({
      ok: false,
      error: { name: "InvalidStateError", message: "The library folder changed." },
    });
    expect(await readdir(root)).toEqual([]);
    expect(await folder.write(2, [], "fresh.md", "x")).toEqual({ ok: true, value: null });
  });
});

describe("stagingName", () => {
  it("gives every write its own hidden staging file", () => {
    const first = stagingName();
    expect(first).toMatch(/^\.emdy-write-[0-9a-f-]+\.tmp$/);
    expect(stagingName()).not.toBe(first);
  });
});

describe("writeStaged", () => {
  it.skipIf(process.platform === "win32")(
    "removes the staging file when the in-place fallback fails too",
    async () => {
      const locked = join(root, "locked");
      await mkdir(locked);
      await chmod(locked, 0o500);
      try {
        await expect(
          writeStaged(join(locked, "Notes.md"), join(root, stagingName()), "text", "win32"),
        ).rejects.toMatchObject({ code: "EACCES" });
        expect(await readdir(root)).toEqual(["locked"]);
      } finally {
        await chmod(locked, 0o700);
      }
    },
  );
});
