import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createMemoryBridge, type MemoryBridge } from "~/lib/desktop/memory-bridge";
import { createOpenedFileStore, toOpenedDocument } from "./opened-files";

afterEach(() => {
  vi.useRealTimers();
});

function setup(options: Parameters<typeof createOpenedFileStore>[1] = {}) {
  const bridge = createMemoryBridge(null);
  const store = createOpenedFileStore(bridge.files, { writeDelayMs: 10, ...options });
  return { bridge, store };
}

async function opened(bridge: MemoryBridge, name: string, text: string) {
  const id = bridge.openFile(name, text);
  await bridge.files.takeRequests();
  return id;
}

describe("toOpenedDocument", () => {
  it("titles a file after its name", () => {
    expect(
      toOpenedDocument({ id: "abc123", name: "Plan.markdown", text: "x", modified: 5, icon: null }),
    ).toEqual({
      id: "abc123",
      title: "Plan",
      text: "x",
      modified: 5,
      icon: null,
      fixedTitle: true,
    });
  });
});

describe("createOpenedFileStore", () => {
  it("loads every open file and forgets the ones that vanished", async () => {
    const { bridge, store } = setup();
    const kept = await opened(bridge, "Kept.md", "kept");
    const gone = await opened(bridge, "Gone.md", "gone");
    bridge.removeOpenedFile(gone);

    const docs = await store.load([]);
    expect(docs).toEqual([
      {
        id: kept,
        title: "Kept",
        text: "kept",
        modified: expect.any(Number),
        icon: null,
        fixedTitle: true,
      },
    ]);
    expect(bridge.closedFiles()).toEqual([gone]);
    expect(store.has(kept)).toBe(true);
    expect(store.has(gone)).toBe(false);
  });

  it("writes an edit back to the file after the debounce", async () => {
    vi.useFakeTimers();
    const onSaved = vi.fn();
    const { bridge, store } = setup({ onSaved });
    const id = await opened(bridge, "Notes.md", "# Notes");
    await store.load([]);

    store.save({ id, title: "Notes", text: "# Notes\n\nmore", icon: null });
    expect(store.pending()).toBe(true);
    expect(bridge.openedFile(id)?.text).toBe("# Notes");
    await vi.advanceTimersByTimeAsync(10);
    expect(bridge.openedFile(id)?.text).toBe("# Notes\n\nmore");
    expect(store.pending()).toBe(false);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("skips saves that change nothing and ignores documents it does not own", async () => {
    const { bridge, store } = setup();
    const id = await opened(bridge, "Notes.md", "# Notes");
    await store.load([]);
    const save = vi.spyOn(bridge.files, "save");
    store.save({ id, title: "Notes", text: "# Notes", icon: null });
    store.save({ id: "zzzzzz", title: "Other", text: "x", icon: null });
    expect(store.pending()).toBe(false);
    await store.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it("renames the file and stores the icon through a save", async () => {
    const { bridge, store } = setup();
    const id = await opened(bridge, "draft.md", "text");
    await store.load([]);
    const icon = { kind: "emoji", emoji: "📝" } as const;
    store.save({ id, title: "Final", text: "text", icon });
    await store.flush();
    expect(bridge.openedFile(id)).toMatchObject({ name: "Final.md", icon });
    store.save({ id, title: "Final", text: "text", icon });
    expect(store.pending()).toBe(false);
  });

  it("sends the hash it last read so an outside edit becomes a conflict copy", async () => {
    const onRefresh = vi.fn();
    const { bridge, store } = setup({ onRefresh });
    const id = await opened(bridge, "Notes.md", "original");
    await store.load([]);
    bridge.editOpenedFile(id, "changed elsewhere");
    store.save({ id, title: "Notes", text: "changed here", icon: null });
    await store.flush();
    expect(bridge.openedFile(id)?.text).toBe("changed here");
    expect(onRefresh).toHaveBeenCalledWith({
      added: [expect.objectContaining({ title: "Notes (conflict)", text: "changed elsewhere" })],
      updated: [],
      removed: [],
    });
  });

  it("keeps an edit pending and reports the error when the write fails", async () => {
    const onError = vi.fn();
    const { bridge, store } = setup({ onError });
    const id = await opened(bridge, "Notes.md", "a");
    await store.load([]);
    const save = bridge.files.save;
    bridge.files.save = async () => ({
      ok: false,
      error: { name: "NotAllowedError", message: "read-only" },
    });
    store.save({ id, title: "Notes", text: "b", icon: null });
    await expect(store.flush()).rejects.toThrow("read-only");
    expect(onError).toHaveBeenCalled();
    expect(store.pending()).toBe(true);

    bridge.files.save = save;
    await store.flush();
    expect(bridge.openedFile(id)?.text).toBe("b");
  });

  it("reports new, changed, renamed, and vanished files on refresh", async () => {
    const { bridge, store } = setup();
    const edited = await opened(bridge, "Edited.md", "old");
    const gone = await opened(bridge, "Gone.md", "gone");
    const same = await opened(bridge, "Same.md", "same");
    await store.load([]);
    bridge.editOpenedFile(edited, "new");
    bridge.removeOpenedFile(gone);
    const added = bridge.openFile("Added.md", "added");

    const result = await store.refresh([]);
    expect(result.added.map((doc) => doc.id)).toEqual([added]);
    expect(result.updated).toEqual([expect.objectContaining({ id: edited, text: "new" })]);
    expect(result.removed).toEqual([gone]);
    expect(result.updated.some((doc) => doc.id === same)).toBe(false);
  });

  it("leaves a file with unsaved edits alone on refresh", async () => {
    const { bridge, store } = setup({ writeDelayMs: 1_000 });
    const id = await opened(bridge, "Notes.md", "a");
    await store.load([]);
    store.save({ id, title: "Notes", text: "mine", icon: null });
    bridge.editOpenedFile(id, "theirs");
    bridge.removeOpenedFile(id);
    expect(await store.refresh([])).toEqual({ added: [], updated: [], removed: [] });
    await store.flush();
  });

  it("saves pending edits before closing a file", async () => {
    const { bridge, store } = setup({ writeDelayMs: 1_000 });
    const id = await opened(bridge, "Notes.md", "a");
    await store.load([]);
    store.save({ id, title: "Notes", text: "last words", icon: null });
    const calls: string[] = [];
    const save = bridge.files.save;
    const close = bridge.files.close;
    bridge.files.save = async (target, change) => {
      calls.push(`save ${change.text}`);
      return save(target, change);
    };
    bridge.files.close = async (target) => {
      calls.push("close");
      return close(target);
    };
    await store.close(id);
    expect(calls).toEqual(["save last words", "close"]);
    expect(store.has(id)).toBe(false);
    expect(bridge.openedFile(id)).toBeUndefined();
  });
});
