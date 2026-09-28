import { describe, expect, it, vi } from "vite-plus/test";
import {
  LIBRARY_LOCK,
  createHandleDirectory,
  createMemoryDirectory,
  createOriginPrivateDirectory,
  isNotFoundError,
  notFound,
} from "./directory";

describe("memory directory", () => {
  it("lists, reads, writes, renames, and removes files with byte sizes and timestamps", async () => {
    let clock = 100;
    const dir = createMemoryDirectory({ "a.md": "héllo" }, () => clock);
    expect(await dir.list()).toEqual([{ name: "a.md", size: 6, lastModified: 100 }]);
    clock = 200;
    await dir.write("b.md", "x");
    expect(dir.info("b.md")).toEqual({ name: "b.md", size: 1, lastModified: 200 });
    await dir.rename("a.md", "c.md");
    expect(await dir.read("c.md")).toBe("héllo");
    await dir.remove("b.md");
    expect(dir.files()).toEqual({ "c.md": "héllo" });
  });

  it("throws NotFoundError for missing files", async () => {
    const dir = createMemoryDirectory();
    await expect(dir.read("nope.md")).rejects.toSatisfy(isNotFoundError);
    await expect(dir.remove("nope.md")).rejects.toSatisfy(isNotFoundError);
    await expect(dir.rename("nope.md", "x.md")).rejects.toSatisfy(isNotFoundError);
    expect(isNotFoundError(new Error("plain"))).toBe(false);
    expect(notFound("x").name).toBe("NotFoundError");
  });

  it("creates child directories once and exposes them for inspection", async () => {
    const dir = createMemoryDirectory();
    const child = await dir.child(".emdy");
    await child.write("index.json", "{}");
    expect(await dir.child(".emdy")).toBe(child);
    expect(dir.childDirectory(".emdy")?.files()).toEqual({ "index.json": "{}" });
    expect(dir.childDirectory("missing")).toBeUndefined();
    expect(await dir.list()).toEqual([]);
  });

  it("stats a single file and reports a missing one", async () => {
    const dir = createMemoryDirectory({ "a.md": "héllo" }, () => 100);
    expect(await dir.stat("a.md")).toEqual({ name: "a.md", size: 6, lastModified: 100 });
    await expect(dir.stat("nope.md")).rejects.toSatisfy(isNotFoundError);
  });

  it("supports placing and dropping files to simulate external edits", () => {
    const dir = createMemoryDirectory();
    dir.place("ext.md", "outside", 5);
    expect(dir.info("ext.md")).toEqual({ name: "ext.md", size: 7, lastModified: 5 });
    dir.drop("ext.md");
    expect(dir.info("ext.md")).toBeUndefined();
  });
});

interface FakeFile {
  text: string;
  lastModified: number;
}

function fakeDirectoryHandle(
  files: Map<string, FakeFile>,
  options: { move?: boolean } = {},
): FileSystemDirectoryHandle & { children: Map<string, FileSystemDirectoryHandle> } {
  const children = new Map<string, FileSystemDirectoryHandle>();
  const fileHandle = (name: string): FileSystemFileHandle => {
    const handle = {
      kind: "file" as const,
      name,
      async getFile() {
        const file = files.get(name);
        if (!file) throw notFound(name);
        return new File([file.text], name, { lastModified: file.lastModified });
      },
      async createWritable() {
        let buffer = "";
        return {
          write: async (chunk: string) => {
            buffer += chunk;
          },
          close: async () => {
            files.set(name, { text: buffer, lastModified: 999 });
          },
        } as unknown as FileSystemWritableFileStream;
      },
    } as unknown as FileSystemFileHandle;
    if (options.move) {
      handle.move = vi.fn(async (to: string) => {
        const file = files.get(name)!;
        files.delete(name);
        files.set(to, file);
      });
    }
    return handle;
  };
  const handle = {
    kind: "directory" as const,
    name: "root",
    children,
    async *entries() {
      for (const name of files.keys()) yield [name, fileHandle(name)] as [string, FileSystemHandle];
      for (const [name, child] of children) yield [name, child] as [string, FileSystemHandle];
    },
    async getFileHandle(name: string, opts?: { create?: boolean }) {
      if (!files.has(name)) {
        if (!opts?.create) throw notFound(name);
        files.set(name, { text: "", lastModified: 0 });
      }
      return fileHandle(name);
    },
    async getDirectoryHandle(name: string, opts?: { create?: boolean }) {
      let child = children.get(name);
      if (!child) {
        if (!opts?.create) throw notFound(name);
        child = fakeDirectoryHandle(new Map(), options);
        children.set(name, child);
      }
      return child;
    },
    async removeEntry(name: string) {
      if (!files.delete(name)) throw notFound(name);
    },
  };
  return handle as unknown as FileSystemDirectoryHandle & {
    children: Map<string, FileSystemDirectoryHandle>;
  };
}

describe("handle directory", () => {
  it("lists only files with their size and modification time", async () => {
    const files = new Map([["a.md", { text: "héllo", lastModified: 42 }]]);
    const handle = fakeDirectoryHandle(files);
    await handle.getDirectoryHandle(".emdy", { create: true });
    const dir = createHandleDirectory(handle);
    expect(await dir.list()).toEqual([{ name: "a.md", size: 6, lastModified: 42 }]);
  });

  it("stats every listed file concurrently rather than one at a time", async () => {
    const files = new Map([
      ["a.md", { text: "a", lastModified: 1 }],
      ["b.md", { text: "bb", lastModified: 2 }],
      ["c.md", { text: "ccc", lastModified: 3 }],
    ]);
    const handle = fakeDirectoryHandle(files);
    const entries = handle.entries.bind(handle);
    let waiting = 0;
    const release = Promise.withResolvers<void>();
    handle.entries = async function* () {
      for await (const [name, entry] of entries()) {
        const getFile = (entry as FileSystemFileHandle).getFile.bind(entry);
        (entry as FileSystemFileHandle).getFile = async () => {
          if (++waiting === files.size) release.resolve();
          await release.promise;
          return getFile();
        };
        yield [name, entry] as [string, FileSystemHandle];
      }
    } as FileSystemDirectoryHandle["entries"];
    expect(await createHandleDirectory(handle).list()).toEqual([
      { name: "a.md", size: 1, lastModified: 1 },
      { name: "b.md", size: 2, lastModified: 2 },
      { name: "c.md", size: 3, lastModified: 3 },
    ]);
  });

  it("stats a single file through the handle", async () => {
    const files = new Map([["a.md", { text: "héllo", lastModified: 42 }]]);
    const dir = createHandleDirectory(fakeDirectoryHandle(files));
    expect(await dir.stat("a.md")).toEqual({ name: "a.md", size: 6, lastModified: 42 });
    await expect(dir.stat("nope.md")).rejects.toSatisfy(isNotFoundError);
  });

  it("reads, writes, and removes through the handle", async () => {
    const files = new Map<string, FakeFile>();
    const dir = createHandleDirectory(fakeDirectoryHandle(files));
    await dir.write("a.md", "first");
    expect(await dir.read("a.md")).toBe("first");
    await dir.remove("a.md");
    await expect(dir.read("a.md")).rejects.toSatisfy(isNotFoundError);
  });

  it("uses the native move when available", async () => {
    const files = new Map([["a.md", { text: "body", lastModified: 1 }]]);
    const dir = createHandleDirectory(fakeDirectoryHandle(files, { move: true }));
    await dir.rename("a.md", "b.md");
    expect([...files.keys()]).toEqual(["b.md"]);
    expect(files.get("b.md")?.text).toBe("body");
  });

  it("falls back to copy and delete when move is unsupported", async () => {
    const files = new Map([["a.md", { text: "body", lastModified: 1 }]]);
    const dir = createHandleDirectory(fakeDirectoryHandle(files));
    await dir.rename("a.md", "b.md");
    expect([...files.keys()]).toEqual(["b.md"]);
    expect(files.get("b.md")?.text).toBe("body");
  });

  it("creates child directories on demand", async () => {
    const handle = fakeDirectoryHandle(new Map());
    const dir = createHandleDirectory(handle);
    const child = await dir.child(".emdy");
    await child.write("index.json", "{}");
    expect(handle.children.has(".emdy")).toBe(true);
    expect(await child.read("index.json")).toBe("{}");
  });
});

describe("origin private directory", () => {
  it("asks for persistence and wraps the origin private root", async () => {
    const files = new Map([["a.md", { text: "body", lastModified: 1 }]]);
    const root = fakeDirectoryHandle(files);
    const persist = vi.fn(async () => true);
    const dir = await createOriginPrivateDirectory({ getDirectory: async () => root, persist });
    expect(await dir.read("a.md")).toBe("body");
    expect(persist).toHaveBeenCalled();
  });

  it("survives a browser that refuses to persist", async () => {
    const root = fakeDirectoryHandle(new Map());
    const dir = await createOriginPrivateDirectory({
      getDirectory: async () => root,
      persist: async () => {
        throw new Error("denied");
      },
    });
    await dir.write("a.md", "body");
    expect(await dir.read("a.md")).toBe("body");
  });

  it("reports a browser with no origin private file system", async () => {
    const manager = { persist: async () => true } as unknown as StorageManager;
    await expect(createOriginPrivateDirectory(manager)).rejects.toThrow(
      "This browser has no private storage for documents.",
    );
  });
});

describe("directory coordination and failed writes", () => {
  it("serializes memory operations and releases the queue after failure", async () => {
    const dir = createMemoryDirectory();
    const gate = Promise.withResolvers<void>();
    const calls: number[] = [];
    const first = dir.exclusive(async () => {
      calls.push(1);
      await gate.promise;
      throw new Error("failed");
    });
    const failed = expect(first).rejects.toThrow("failed");
    const second = dir.exclusive(async () => {
      calls.push(2);
      return 2;
    });
    await Promise.resolve();
    expect(calls).toEqual([1]);
    gate.resolve();
    await failed;
    expect(await second).toBe(2);
    expect(calls).toEqual([1, 2]);
  });

  it("requests the shared browser lock and propagates its result", async () => {
    const request = vi.fn(async (_name: string, task: () => Promise<number>) => task());
    const dir = createHandleDirectory(fakeDirectoryHandle(new Map()), {
      request,
    } as unknown as LockManager);
    expect(await dir.exclusive(async () => 7)).toBe(7);
    expect(request).toHaveBeenCalledWith(LIBRARY_LOCK, expect.any(Function));
    await expect(
      createHandleDirectory(fakeDirectoryHandle(new Map())).exclusive(async () => 0),
    ).rejects.toThrow("coordinate document storage");
  });

  it("aborts a failed write instead of closing and publishing it", async () => {
    const close = vi.fn();
    const abort = vi.fn(async () => {});
    const handle = fakeDirectoryHandle(new Map());
    handle.getFileHandle = vi.fn(async () => ({
      createWritable: async () => ({
        write: async () => {
          throw new Error("quota exceeded");
        },
        close,
        abort,
      }),
    })) as unknown as FileSystemDirectoryHandle["getFileHandle"];
    await expect(createHandleDirectory(handle).write("A.md", "body")).rejects.toThrow(
      "quota exceeded",
    );
    expect(abort).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
  });
});
