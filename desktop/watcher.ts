import { watch as watchFileSystem, type FSWatcher } from "node:fs";
import { basename, dirname } from "node:path";
import { isMarkdownFile } from "../src/lib/storage/filenames";

export const OWN_WRITE_WINDOW_MS = 1_500;
export const CHANGE_DEBOUNCE_MS = 200;

export interface WriteLog {
  record: (name: string) => void;
  isOwn: (name: string) => boolean;
}

export function createWriteLog(
  now: () => number = Date.now,
  windowMs: number = OWN_WRITE_WINDOW_MS,
): WriteLog {
  const recent = new Map<string, number>();
  return {
    record(name) {
      recent.set(name, now());
    },
    isOwn(name) {
      const at = recent.get(name);
      if (at === undefined) return false;
      if (now() - at > windowMs) {
        recent.delete(name);
        return false;
      }
      return true;
    },
  };
}

export function isOutsideChange(
  filename: string | null,
  log: WriteLog,
  relevant: (filename: string) => boolean = isMarkdownFile,
): boolean {
  if (filename === null) return true;
  if (filename.startsWith(".") || !relevant(filename)) return false;
  return !log.isOwn(filename);
}

export type WatchFunction = (
  folder: string,
  listener: (event: string, filename: string | null) => void,
) => FSWatcher;

export interface WatchTimers {
  setTimeout: (callback: () => void, delay: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

export interface WatchOptions {
  log: WriteLog;
  onChange: () => void;
  relevant?: (filename: string) => boolean;
  debounceMs?: number;
  watch?: WatchFunction;
  timers?: WatchTimers;
}

export function watchFolder(folder: string, options: WatchOptions): () => void {
  const timers = options.timers ?? {
    setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay),
    clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  const watch =
    options.watch ??
    ((path: string, listener: (event: string, filename: string | null) => void) =>
      watchFileSystem(path, { persistent: false }, (event, filename) =>
        listener(event, filename === null ? null : String(filename)),
      ));
  let pending: unknown = null;
  let watcher: FSWatcher;
  try {
    watcher = watch(folder, (_event, filename) => {
      if (!isOutsideChange(filename, options.log, options.relevant)) return;
      if (pending !== null) timers.clearTimeout(pending);
      pending = timers.setTimeout(() => {
        pending = null;
        options.onChange();
      }, options.debounceMs ?? CHANGE_DEBOUNCE_MS);
    });
  } catch {
    return () => {};
  }
  watcher.on("error", () => watcher.close());
  return () => {
    if (pending !== null) timers.clearTimeout(pending);
    pending = null;
    watcher.close();
  };
}

export interface FolderWatchers {
  sync: (folders: ReadonlyMap<string, ReadonlySet<string>>) => void;
  record: (path: string) => void;
  stop: () => void;
}

export interface FolderWatchersOptions {
  onChange: () => void;
  debounceMs?: number;
  watch?: WatchFunction;
  timers?: WatchTimers;
  now?: () => number;
}

export function createFolderWatchers(options: FolderWatchersOptions): FolderWatchers {
  const active = new Map<string, { names: ReadonlySet<string>; log: WriteLog; stop: () => void }>();
  const logFor = (folder: string) => active.get(folder)?.log;

  return {
    sync(folders) {
      for (const [folder, watcher] of active) {
        if (folders.has(folder)) continue;
        watcher.stop();
        active.delete(folder);
      }
      for (const [folder, names] of folders) {
        const current = active.get(folder);
        if (current) {
          current.names = names;
          continue;
        }
        const log = createWriteLog(options.now);
        const entry = { names, log, stop: () => {} };
        entry.stop = watchFolder(folder, {
          log,
          onChange: options.onChange,
          relevant: (filename) => entry.names.has(filename),
          debounceMs: options.debounceMs,
          watch: options.watch,
          timers: options.timers,
        });
        active.set(folder, entry);
      }
    },
    record(path) {
      logFor(dirname(path))?.record(basename(path));
    },
    stop() {
      for (const watcher of active.values()) watcher.stop();
      active.clear();
    },
  };
}
