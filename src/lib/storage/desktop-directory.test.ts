import { describe, expect, it, vi } from "vite-plus/test";
import { createMemoryBridge } from "../desktop/memory-bridge";
import { createDesktopDirectory } from "./desktop-directory";
import { LIBRARY_LOCK, createMemoryDirectory, isNotFoundError } from "./directory";
import { readOptional } from "./transaction";

const locks = {
  request: vi.fn((_name: string, task: () => Promise<unknown>) => task()),
} as unknown as Pick<LockManager, "request">;

describe("createDesktopDirectory", () => {
  it("reads, writes, stats, renames, and removes files in the chosen folder", async () => {
    const root = createMemoryDirectory({ "a.md": "héllo" }, () => 100);
    const directory = await createDesktopDirectory(createMemoryBridge(root), locks);
    expect(await directory.list()).toEqual([{ name: "a.md", size: 6, lastModified: 100 }]);
    await directory.write("b.md", "x");
    expect(root.files()).toEqual({ "a.md": "héllo", "b.md": "x" });
    expect(await directory.stat("b.md")).toEqual({ name: "b.md", size: 1, lastModified: 100 });
    await directory.rename("a.md", "c.md");
    expect(await directory.read("c.md")).toBe("héllo");
    await directory.remove("b.md");
    expect(root.files()).toEqual({ "c.md": "héllo" });
  });

  it("reports missing files as NotFoundError so optional reads fall back", async () => {
    const directory = await createDesktopDirectory(
      createMemoryBridge(createMemoryDirectory()),
      locks,
    );
    await expect(directory.read("nope.md")).rejects.toSatisfy(isNotFoundError);
    await expect(directory.remove("nope.md")).rejects.toSatisfy(isNotFoundError);
    expect(await readOptional(directory, "nope.md")).toBeNull();
  });

  it("creates and addresses child folders by path", async () => {
    const root = createMemoryDirectory();
    const directory = await createDesktopDirectory(createMemoryBridge(root), locks);
    const metadata = await directory.child(".emdy");
    await metadata.write("index.json", "{}");
    expect(root.childDirectory(".emdy")?.files()).toEqual({ "index.json": "{}" });
    expect(await directory.list()).toEqual([]);
  });

  it("refuses to open when the folder is gone", async () => {
    await expect(createDesktopDirectory(createMemoryBridge(null), locks)).rejects.toThrow(
      /can’t be found/,
    );
  });

  it("stops writing once the folder is swapped for another", async () => {
    const first = createMemoryDirectory();
    const bridge = createMemoryBridge(first);
    const directory = await createDesktopDirectory(bridge, locks);
    const second = createMemoryDirectory();
    bridge.setRoot(second);
    await expect(directory.write("late.md", "x")).rejects.toThrow(/folder changed/);
    expect(first.files()).toEqual({});
    expect(second.files()).toEqual({});
  });

  it("runs exclusive work under the library lock", async () => {
    const directory = await createDesktopDirectory(
      createMemoryBridge(createMemoryDirectory()),
      locks,
    );
    expect(await directory.exclusive(async () => 7)).toBe(7);
    expect(locks.request).toHaveBeenCalledWith(LIBRARY_LOCK, expect.any(Function));
  });

  it("rejects exclusive work when locks are unavailable", async () => {
    const directory = await createDesktopDirectory(
      createMemoryBridge(createMemoryDirectory()),
      undefined,
    );
    await expect(directory.exclusive(async () => 1)).rejects.toThrow(/coordinated/);
  });
});
