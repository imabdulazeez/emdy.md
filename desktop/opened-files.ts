import { mkdir, readdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  FolderResult,
  OpenedFile,
  OpenedFileChange,
  OpenedFileList,
  OpenedFileSaved,
  OpenRequest,
} from "../src/lib/desktop/bridge";
import { isDocumentIcon, sameDocumentIcon, type DocumentIcon } from "../src/lib/document-icon";
import { isDocumentId, makeDocumentId } from "../src/lib/route";
import {
  filenameFor,
  isMarkdownFile,
  markdownExtension,
  titleFromFilename,
} from "../src/lib/storage/filenames";
import { hashText } from "../src/lib/storage/hash";
import { describeFailure, errorCode, FolderFault, stagingName, writeStaged } from "./folder";

export const OPENED_FILES_STORE = "opened-files.json";

export interface OpenedFileEntry {
  id: string;
  path: string;
  icon?: DocumentIcon;
}

export interface OpenedFilesOptions {
  store: string;
  libraryFolder: () => string;
  onWrite?: (path: string) => void;
  platform?: NodeJS.Platform;
}

export interface OpenedFiles {
  load: () => Promise<void>;
  open: (paths: readonly unknown[]) => Promise<number>;
  takeRequests: () => OpenRequest[];
  list: (taken: unknown) => Promise<FolderResult<OpenedFileList>>;
  save: (id: unknown, change: unknown) => Promise<FolderResult<OpenedFileSaved>>;
  close: (id: unknown) => Promise<void>;
  locate: (id: unknown) => string | null;
  folders: () => Map<string, Set<string>>;
}

export function isMarkdownPath(path: string): boolean {
  return markdownExtension(basename(path)) !== null;
}

export function isOpenedFileEntry(value: unknown): value is OpenedFileEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    isDocumentId(entry.id) &&
    typeof entry.path === "string" &&
    isAbsolute(entry.path) &&
    isMarkdownPath(entry.path) &&
    (entry.icon === undefined || isDocumentIcon(entry.icon))
  );
}

export function isOpenedFileChange(value: unknown): value is OpenedFileChange {
  if (typeof value !== "object" || value === null) return false;
  const change = value as Record<string, unknown>;
  return (
    typeof change.title === "string" &&
    typeof change.text === "string" &&
    typeof change.base === "string" &&
    (change.icon === null || isDocumentIcon(change.icon))
  );
}

export async function readOpenedFileEntries(file: string): Promise<OpenedFileEntry[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch {
    return [];
  }
  const files = (parsed as { files?: unknown } | null)?.files;
  if (!Array.isArray(files)) return [];
  const ids = new Set<string>();
  const paths = new Set<string>();
  const entries: OpenedFileEntry[] = [];
  for (const entry of files) {
    if (!isOpenedFileEntry(entry) || ids.has(entry.id) || paths.has(entry.path)) continue;
    ids.add(entry.id);
    paths.add(entry.path);
    entries.push({ id: entry.id, path: entry.path, ...(entry.icon ? { icon: entry.icon } : {}) });
  }
  return entries;
}

export async function writeOpenedFileEntries(
  file: string,
  entries: readonly OpenedFileEntry[],
): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const staged = `${file}.tmp`;
  await writeFile(staged, `${JSON.stringify({ files: entries }, null, 2)}\n`, "utf8");
  await rename(staged, file);
}

export function markdownPathsFromArgv(argv: readonly string[], cwd: string): string[] {
  const paths: string[] = [];
  for (const arg of argv.slice(1)) {
    if (arg.startsWith("-")) continue;
    let path = arg;
    if (arg.startsWith("file:")) {
      try {
        path = fileURLToPath(arg);
      } catch {
        continue;
      }
    }
    if (isMarkdownPath(path)) paths.push(resolve(cwd, path));
  }
  return paths;
}

function sameFolder(a: string, b: string, platform: NodeJS.Platform): boolean {
  return platform === "linux" ? a === b : a.toLowerCase() === b.toLowerCase();
}

async function canonical(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}

async function readOptionalText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") return null;
    throw error;
  }
}

export function createOpenedFiles(options: OpenedFilesOptions): OpenedFiles {
  const platform = options.platform ?? process.platform;
  let entries: OpenedFileEntry[] = [];
  let taken = new Set<string>();
  let requests: OpenRequest[] = [];
  let temporary = 0;
  let queue: Promise<unknown> = Promise.resolve();

  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(task);
    queue = next.catch(() => undefined);
    return next;
  };

  const persist = () => writeOpenedFileEntries(options.store, entries);

  const mint = () => makeDocumentId([...entries.map((entry) => entry.id), ...taken]);

  const find = (id: unknown) =>
    typeof id === "string" ? entries.find((entry) => entry.id === id) : undefined;

  const inLibrary = async (path: string): Promise<boolean> => {
    if (!isMarkdownFile(basename(path))) return false;
    return sameFolder(dirname(path), await canonical(options.libraryFolder()), platform);
  };

  const describe = async (entry: OpenedFileEntry, text: string): Promise<OpenedFile> => {
    const info = await stat(entry.path);
    return {
      id: entry.id,
      name: basename(entry.path),
      text,
      modified: Math.trunc(info.mtimeMs),
      icon: entry.icon ?? null,
    };
  };

  const write = async (path: string, text: string, mode?: number) => {
    options.onWrite?.(path);
    await writeStaged(path, join(dirname(path), stagingName(++temporary)), text, platform, mode);
  };

  const settle = async <T>(subject: string, task: () => Promise<T>): Promise<FolderResult<T>> => {
    try {
      return { ok: true, value: await task() };
    } catch (error) {
      return { ok: false, error: describeFailure(error, subject) };
    }
  };

  return {
    load: () =>
      serial(async () => {
        entries = await readOpenedFileEntries(options.store);
      }),
    open: (paths) =>
      serial(async () => {
        const opened: OpenRequest[] = [];
        let changed = false;
        for (const raw of paths) {
          if (typeof raw !== "string" || !isAbsolute(raw) || !isMarkdownPath(raw)) continue;
          let path: string;
          try {
            path = await realpath(raw);
            if (!(await stat(path)).isFile() || !isMarkdownPath(path)) continue;
          } catch {
            continue;
          }
          if (await inLibrary(path)) {
            opened.push({ kind: "library", name: basename(path) });
            continue;
          }
          let entry = entries.find((candidate) => candidate.path === path);
          if (!entry) {
            entry = { id: mint(), path };
            entries.push(entry);
            changed = true;
          }
          opened.push({ kind: "file", id: entry.id });
        }
        if (changed) await persist();
        requests.push(...opened);
        return opened.length;
      }),
    takeRequests() {
      const pending = requests;
      requests = [];
      return pending;
    },
    list: (ids) =>
      serial(() =>
        settle("", async () => {
          taken = new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : []);
          let changed = false;
          const files: OpenedFile[] = [];
          const missing: string[] = [];
          for (const entry of entries) {
            if (taken.has(entry.id)) {
              entry.id = mint();
              changed = true;
            }
            if (await inLibrary(entry.path)) {
              entries = entries.filter((candidate) => candidate !== entry);
              missing.push(entry.id);
              changed = true;
              continue;
            }
            try {
              files.push(await describe(entry, await readFile(entry.path, "utf8")));
            } catch {
              missing.push(entry.id);
            }
          }
          if (changed) await persist();
          return { files, missing };
        }),
      ),
    save: (id, change) =>
      serial(() => {
        const entry = find(id);
        return settle(entry ? basename(entry.path) : "", async () => {
          if (!entry) throw new FolderFault("NotFoundError", "That file is no longer open.");
          if (!isOpenedFileChange(change)) throw new FolderFault("TypeError", "Invalid change.");
          const folder = dirname(entry.path);
          const name = basename(entry.path);
          const extension = markdownExtension(name) ?? ".md";
          const disk = await readOptionalText(entry.path);
          const mode = disk === null ? undefined : (await stat(entry.path)).mode;
          let conflict: OpenedFile | null = null;
          if (disk !== null && disk !== change.text && hashText(disk) !== change.base) {
            const copy = join(
              folder,
              filenameFor(
                `${titleFromFilename(name)} (conflict)`,
                await readdir(folder),
                undefined,
                extension,
              ),
            );
            await write(copy, disk, mode);
            const copied: OpenedFileEntry = { id: mint(), path: copy };
            entries.push(copied);
            conflict = await describe(copied, disk);
          }
          let target = entry.path;
          if (change.title !== titleFromFilename(name)) {
            const next = filenameFor(change.title, await readdir(folder), name, extension);
            if (next !== name) target = join(folder, next);
          }
          if (target !== entry.path && disk !== null) {
            options.onWrite?.(entry.path);
            options.onWrite?.(target);
            await rename(entry.path, target);
          }
          if (disk !== change.text) await write(target, change.text, mode);
          const changed =
            conflict !== null ||
            target !== entry.path ||
            !sameDocumentIcon(entry.icon ?? null, change.icon);
          entry.path = target;
          if (change.icon) entry.icon = change.icon;
          else delete entry.icon;
          if (changed) await persist();
          return { file: await describe(entry, change.text), conflict };
        });
      }),
    close: (id) =>
      serial(async () => {
        const entry = find(id);
        if (!entry) return;
        entries = entries.filter((candidate) => candidate !== entry);
        await persist();
      }),
    locate: (id) => find(id)?.path ?? null,
    folders() {
      const folders = new Map<string, Set<string>>();
      for (const entry of entries) {
        const folder = dirname(entry.path);
        if (!folders.has(folder)) folders.set(folder, new Set());
        folders.get(folder)!.add(basename(entry.path));
      }
      return folders;
    },
  };
}
