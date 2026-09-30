import { EventEmitter } from "node:events";
import type { FSWatcher } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createFolderWatchers, createWriteLog, isOutsideChange, watchFolder } from "./watcher";

afterEach(() => {
  vi.useRealTimers();
});

describe("createWriteLog", () => {
  it("remembers the app's own writes for a short window", () => {
    let clock = 0;
    const log = createWriteLog(() => clock, 1_000);
    log.record("a.md");
    expect(log.isOwn("a.md")).toBe(true);
    clock = 1_000;
    expect(log.isOwn("a.md")).toBe(true);
    clock = 1_001;
    expect(log.isOwn("a.md")).toBe(false);
    expect(log.isOwn("a.md")).toBe(false);
    expect(log.isOwn("b.md")).toBe(false);
  });
});

describe("isOutsideChange", () => {
  it("reacts to Markdown files other apps touch", () => {
    const log = createWriteLog(() => 0);
    expect(isOutsideChange("Notes.md", log)).toBe(true);
    expect(isOutsideChange(null, log)).toBe(true);
  });

  it("ignores the app's own writes, staging files, and non-Markdown files", () => {
    const log = createWriteLog(() => 0);
    log.record("Mine.md");
    expect(isOutsideChange("Mine.md", log)).toBe(false);
    expect(isOutsideChange(".emdy-write-1-1.tmp", log)).toBe(false);
    expect(isOutsideChange(".emdy", log)).toBe(false);
    expect(isOutsideChange("photo.png", log)).toBe(false);
  });

  it("only reacts to the names a caller cares about when given a filter", () => {
    const log = createWriteLog(() => 0);
    const relevant = (name: string) => name === "Plan.markdown";
    expect(isOutsideChange("Plan.markdown", log, relevant)).toBe(true);
    expect(isOutsideChange("Other.md", log, relevant)).toBe(false);
    expect(isOutsideChange(".Plan.markdown", log, () => true)).toBe(false);
  });
});

function fakeWatcher() {
  const emitter = new EventEmitter() as EventEmitter & { close: () => void };
  emitter.close = vi.fn();
  let listener: ((event: string, filename: string | null) => void) | undefined;
  const watch = vi.fn((_folder: string, next: (event: string, filename: string | null) => void) => {
    listener = next;
    return emitter as unknown as FSWatcher;
  });
  return { emitter, watch, fire: (name: string | null) => listener?.("change", name) };
}

describe("watchFolder", () => {
  it("coalesces a burst of outside changes into one notification", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const fake = fakeWatcher();
    const stop = watchFolder("/notes", {
      log: createWriteLog(() => 0),
      onChange,
      debounceMs: 100,
      watch: fake.watch,
    });
    fake.fire("a.md");
    fake.fire("b.md");
    vi.advanceTimersByTime(99);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
    expect(fake.emitter.close).toHaveBeenCalled();
  });

  it("stays quiet for the app's own writes", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const log = createWriteLog(() => 0);
    log.record("a.md");
    const fake = fakeWatcher();
    watchFolder("/notes", { log, onChange, debounceMs: 10, watch: fake.watch });
    fake.fire("a.md");
    vi.advanceTimersByTime(50);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("drops a pending notification when stopped", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const fake = fakeWatcher();
    const stop = watchFolder("/notes", {
      log: createWriteLog(() => 0),
      onChange,
      debounceMs: 10,
      watch: fake.watch,
    });
    fake.fire("a.md");
    stop();
    vi.advanceTimersByTime(50);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes the watcher when the folder disappears", () => {
    const fake = fakeWatcher();
    watchFolder("/notes", { log: createWriteLog(), onChange: vi.fn(), watch: fake.watch });
    fake.emitter.emit("error", new Error("gone"));
    expect(fake.emitter.close).toHaveBeenCalled();
  });

  it("does nothing when the folder cannot be watched", () => {
    const stop = watchFolder("/notes", {
      log: createWriteLog(),
      onChange: vi.fn(),
      watch: () => {
        throw new Error("ENOENT");
      },
    });
    expect(stop()).toBeUndefined();
  });

  it("notices a real file written by another app", async () => {
    const folder = await mkdtemp(join(tmpdir(), "emdy-watch-"));
    const onChange = vi.fn();
    const stop = watchFolder(folder, { log: createWriteLog(), onChange, debounceMs: 20 });
    try {
      await writeFile(join(folder, "Outside.md"), "# Outside");
      await vi.waitFor(() => expect(onChange).toHaveBeenCalled(), { timeout: 3_000 });
    } finally {
      stop();
      await rm(folder, { recursive: true, force: true });
    }
  });
});

function fakeWatchers() {
  const watchers = new Map<
    string,
    { emitter: EventEmitter & { close: () => void }; fire: (name: string | null) => void }
  >();
  const watch = vi.fn((folder: string, next: (event: string, filename: string | null) => void) => {
    const emitter = new EventEmitter() as EventEmitter & { close: () => void };
    emitter.close = vi.fn();
    watchers.set(folder, { emitter, fire: (name) => next("change", name) });
    return emitter as unknown as FSWatcher;
  });
  return { watchers, watch };
}

describe("createFolderWatchers", () => {
  it("watches each folder once and only for the files open in it", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const fake = fakeWatchers();
    const watchers = createFolderWatchers({ onChange, debounceMs: 10, watch: fake.watch });
    watchers.sync(
      new Map([
        ["/a", new Set(["One.md"])],
        ["/b", new Set(["Two.markdown"])],
      ]),
    );
    expect(fake.watch).toHaveBeenCalledTimes(2);

    fake.watchers.get("/a")!.fire("Other.md");
    vi.advanceTimersByTime(20);
    expect(onChange).not.toHaveBeenCalled();

    fake.watchers.get("/b")!.fire("Two.markdown");
    vi.advanceTimersByTime(20);
    expect(onChange).toHaveBeenCalledTimes(1);

    watchers.sync(new Map([["/a", new Set(["One.md", "Other.md"])]]));
    expect(fake.watch).toHaveBeenCalledTimes(2);
    expect(fake.watchers.get("/b")!.emitter.close).toHaveBeenCalled();
    fake.watchers.get("/a")!.fire("Other.md");
    vi.advanceTimersByTime(20);
    expect(onChange).toHaveBeenCalledTimes(2);

    watchers.stop();
    expect(fake.watchers.get("/a")!.emitter.close).toHaveBeenCalled();
  });

  it("ignores the app's own recorded writes to an open file", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const fake = fakeWatchers();
    const watchers = createFolderWatchers({
      onChange,
      debounceMs: 10,
      watch: fake.watch,
      now: () => 0,
    });
    watchers.sync(new Map([["/a", new Set(["One.md"])]]));
    watchers.record("/a/One.md");
    fake.watchers.get("/a")!.fire("One.md");
    vi.advanceTimersByTime(20);
    expect(onChange).not.toHaveBeenCalled();
  });
});
