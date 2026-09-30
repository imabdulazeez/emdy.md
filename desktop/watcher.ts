import { watch as watchFileSystem, type FSWatcher } from "node:fs";
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

export function isOutsideChange(filename: string | null, log: WriteLog): boolean {
  if (filename === null) return true;
  if (filename.startsWith(".") || !isMarkdownFile(filename)) return false;
  return !log.isOwn(filename);
}

export interface WatchOptions {
  log: WriteLog;
  onChange: () => void;
  debounceMs?: number;
  watch?: (folder: string, listener: (event: string, filename: string | null) => void) => FSWatcher;
  timers?: {
    setTimeout: (callback: () => void, delay: number) => unknown;
    clearTimeout: (handle: unknown) => void;
  };
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
      if (!isOutsideChange(filename, options.log)) return;
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
