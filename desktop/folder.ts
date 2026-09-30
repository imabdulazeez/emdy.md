import { mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FileInfo } from "../src/lib/storage/directory";
import type { FolderFailure, FolderResult } from "../src/lib/desktop/bridge";

const MAX_SEGMENT_LENGTH = 255;
const RETRY_IN_PLACE = new Set(["EPERM", "EACCES", "EBUSY"]);

export interface FolderAccessOptions {
  root: () => string;
  session: () => number;
  onWrite?: (path: readonly string[], name: string) => void;
  platform?: NodeJS.Platform;
}

export interface FolderAccess {
  open: () => Promise<FolderResult<number>>;
  ensure: (session: unknown, path: unknown) => Promise<FolderResult<null>>;
  list: (session: unknown, path: unknown) => Promise<FolderResult<FileInfo[]>>;
  stat: (session: unknown, path: unknown, name: unknown) => Promise<FolderResult<FileInfo>>;
  read: (session: unknown, path: unknown, name: unknown) => Promise<FolderResult<string>>;
  write: (
    session: unknown,
    path: unknown,
    name: unknown,
    text: unknown,
  ) => Promise<FolderResult<null>>;
  remove: (session: unknown, path: unknown, name: unknown) => Promise<FolderResult<null>>;
  rename: (
    session: unknown,
    path: unknown,
    from: unknown,
    to: unknown,
  ) => Promise<FolderResult<null>>;
}

export function isSafeSegment(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_SEGMENT_LENGTH &&
    value !== "." &&
    value !== ".." &&
    !/[/\\\p{Cc}]/u.test(value)
  );
}

export class FolderFault extends Error {
  readonly failure: FolderFailure;

  constructor(name: string, message: string) {
    super(message);
    this.failure = { name, message };
  }
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

export function describeFailure(error: unknown, subject: string): FolderFailure {
  if (error instanceof FolderFault) return error.failure;
  switch (errorCode(error)) {
    case "ENOENT":
      return {
        name: "NotFoundError",
        message: `A requested file or directory could not be found: ${subject}`,
      };
    case "EISDIR":
    case "ENOTDIR":
      return {
        name: "TypeMismatchError",
        message: `“${subject}” is not the expected kind of item.`,
      };
    case "EACCES":
    case "EPERM":
      return { name: "NotAllowedError", message: `emdy isn’t allowed to change “${subject}”.` };
    case "ENOSPC":
      return { name: "QuotaExceededError", message: "The disk is full." };
    case "EROFS":
      return { name: "NotAllowedError", message: "The documents folder is read-only." };
    case "ENAMETOOLONG":
      return { name: "TypeError", message: `The name “${subject}” is too long for this disk.` };
    default:
      return { name: "Error", message: error instanceof Error ? error.message : String(error) };
  }
}

async function settle<T>(subject: string, task: () => Promise<T>): Promise<FolderResult<T>> {
  try {
    return { ok: true, value: await task() };
  } catch (error) {
    return { ok: false, error: describeFailure(error, subject) };
  }
}

function invalid(message: string): FolderFault {
  return new FolderFault("TypeError", message);
}

function toInfo(name: string, size: number, mtimeMs: number): FileInfo {
  return { name, size, lastModified: Math.trunc(mtimeMs) };
}

export function createFolderAccess(options: FolderAccessOptions): FolderAccess {
  const platform = options.platform ?? process.platform;
  let temporary = 0;

  const segments = (session: unknown, path: unknown): string[] => {
    if (session !== options.session())
      throw new FolderFault("InvalidStateError", "The library folder changed.");
    if (!Array.isArray(path) || !path.every(isSafeSegment))
      throw invalid("That folder path is not allowed.");
    return path;
  };

  const locate = (session: unknown, path: unknown, name?: unknown): string => {
    const parts = segments(session, path);
    if (name === undefined) return join(options.root(), ...parts);
    if (!isSafeSegment(name)) throw invalid("That file name is not allowed.");
    return join(options.root(), ...parts, name);
  };

  const subject = (name: unknown) => (typeof name === "string" ? name : "");

  return {
    open: () =>
      settle(options.root(), async () => {
        const root = options.root();
        let info;
        try {
          info = await stat(root);
        } catch (error) {
          if (errorCode(error) === "ENOENT")
            throw new FolderFault("NotFoundError", `The folder “${root}” can’t be found.`);
          throw error;
        }
        if (!info.isDirectory())
          throw new FolderFault("TypeMismatchError", `“${root}” is not a folder.`);
        return options.session();
      }),
    ensure: (session, path) =>
      settle("", async () => {
        await mkdir(locate(session, path), { recursive: true });
        return null;
      }),
    list: (session, path) =>
      settle("", async () => {
        const directory = locate(session, path);
        const entries = await readdir(directory, { withFileTypes: true });
        const infos = await Promise.all(
          entries
            .filter((entry) => entry.isFile() || entry.isSymbolicLink())
            .map(async (entry) => {
              try {
                const info = await stat(join(directory, entry.name));
                return info.isFile() ? toInfo(entry.name, info.size, info.mtimeMs) : null;
              } catch {
                return null;
              }
            }),
        );
        return infos.filter((info): info is FileInfo => info !== null);
      }),
    stat: (session, path, name) =>
      settle(subject(name), async () => {
        const info = await stat(locate(session, path, name));
        if (!info.isFile())
          throw new FolderFault("TypeMismatchError", `“${subject(name)}” is not a file.`);
        return toInfo(name as string, info.size, info.mtimeMs);
      }),
    read: (session, path, name) =>
      settle(subject(name), () => readFile(locate(session, path, name), "utf8")),
    write: (session, path, name, text) =>
      settle(subject(name), async () => {
        if (typeof text !== "string") throw invalid("Only text can be written.");
        const target = locate(session, path, name);
        const parts = segments(session, path);
        const staged = join(
          options.root(),
          ...parts,
          `.emdy-write-${process.pid}-${++temporary}.tmp`,
        );
        options.onWrite?.(parts, name as string);
        await writeFile(staged, text, "utf8");
        try {
          await rename(staged, target);
        } catch (error) {
          if (platform !== "win32" || !RETRY_IN_PLACE.has(errorCode(error) ?? "")) {
            await rm(staged, { force: true });
            throw error;
          }
          await writeFile(target, text, "utf8");
          await rm(staged, { force: true });
        }
        return null;
      }),
    remove: (session, path, name) =>
      settle(subject(name), async () => {
        const target = locate(session, path, name);
        options.onWrite?.(segments(session, path), name as string);
        await unlink(target);
        return null;
      }),
    rename: (session, path, from, to) =>
      settle(subject(from), async () => {
        const source = locate(session, path, from);
        const target = locate(session, path, to);
        const parts = segments(session, path);
        options.onWrite?.(parts, from as string);
        options.onWrite?.(parts, to as string);
        await rename(source, target);
        return null;
      }),
  };
}
