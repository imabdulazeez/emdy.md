import { EventEmitter } from "node:events";
import type { FSWatcher } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createWriteLog, isOutsideChange, watchFolder } from "./watcher";

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
