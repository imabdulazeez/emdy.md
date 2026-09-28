export interface FileInfo {
  name: string;
  size: number;
  lastModified: number;
}

export const LIBRARY_LOCK = "emdy:library";

export interface Directory {
  exclusive: <T>(task: () => Promise<T>) => Promise<T>;
  list: () => Promise<FileInfo[]>;
  stat: (name: string) => Promise<FileInfo>;
  read: (name: string) => Promise<string>;
  write: (name: string, text: string) => Promise<void>;
  remove: (name: string) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
  child: (name: string) => Promise<Directory>;
}

export interface MemoryDirectory extends Directory {
  files: () => Record<string, string>;
  info: (name: string) => FileInfo | undefined;
  place: (name: string, text: string, lastModified?: number) => void;
  drop: (name: string) => void;
  childDirectory: (name: string) => MemoryDirectory | undefined;
}

interface MemoryFile {
  text: string;
  lastModified: number;
}

const encoder = new TextEncoder();

export function notFound(name: string): DOMException {
  return new DOMException(
    `A requested file or directory could not be found: ${name}`,
    "NotFoundError",
  );
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}

export function createMemoryDirectory(
  initial: Record<string, string> = {},
  now: () => number = () => Date.now(),
): MemoryDirectory {
  let queue: Promise<unknown> = Promise.resolve();
  const entries = new Map<string, MemoryFile>();
  const children = new Map<string, MemoryDirectory>();
  for (const [name, text] of Object.entries(initial))
    entries.set(name, { text, lastModified: now() });

  const directory: MemoryDirectory = {
    exclusive(task) {
      const next = queue.then(task, task);
      queue = next.catch(() => undefined);
      return next;
    },
    list: async () =>
      Array.from(entries, ([name, file]) => ({
        name,
        size: encoder.encode(file.text).length,
        lastModified: file.lastModified,
      })),
    async stat(name) {
      const file = entries.get(name);
      if (!file) throw notFound(name);
      return { name, size: encoder.encode(file.text).length, lastModified: file.lastModified };
    },
    async read(name) {
      const file = entries.get(name);
      if (!file) throw notFound(name);
      return file.text;
    },
    async write(name, text) {
      entries.set(name, { text, lastModified: now() });
    },
    async remove(name) {
      if (!entries.delete(name)) throw notFound(name);
    },
    async rename(from, to) {
      const file = entries.get(from);
      if (!file) throw notFound(from);
      entries.delete(from);
      entries.set(to, file);
    },
    async child(name) {
      let child = children.get(name);
      if (!child) {
        child = createMemoryDirectory({}, now);
        children.set(name, child);
      }
      return child;
    },
    files: () => Object.fromEntries(Array.from(entries, ([name, file]) => [name, file.text])),
    info(name) {
      const file = entries.get(name);
      if (!file) return undefined;
      return { name, size: encoder.encode(file.text).length, lastModified: file.lastModified };
    },
    place(name, text, lastModified = now()) {
      entries.set(name, { text, lastModified });
    },
    drop(name) {
      entries.delete(name);
    },
    childDirectory: (name) => children.get(name),
  };
  return directory;
}

export function createHandleDirectory(
  handle: FileSystemDirectoryHandle,
  locks: Pick<LockManager, "request"> | undefined = globalThis.navigator?.locks,
): Directory {
  const fileHandle = (name: string, create = false) => handle.getFileHandle(name, { create });
  return {
    exclusive(task) {
      if (!locks)
        return Promise.reject(
          new Error("This browser cannot coordinate document storage between tabs."),
        );
      return locks.request(LIBRARY_LOCK, task);
    },
    async list() {
      const handles: [string, FileSystemFileHandle][] = [];
      for await (const [name, entry] of handle.entries()) {
        if (entry.kind === "file") handles.push([name, entry as FileSystemFileHandle]);
      }
      return Promise.all(
        handles.map(async ([name, entry]) => {
          const file = await entry.getFile();
          return { name, size: file.size, lastModified: file.lastModified };
        }),
      );
    },
    async stat(name) {
      const file = await (await fileHandle(name)).getFile();
      return { name, size: file.size, lastModified: file.lastModified };
    },
    async read(name) {
      const file = await (await fileHandle(name)).getFile();
      return file.text();
    },
    async write(name, text) {
      const writable = await (await fileHandle(name, true)).createWritable();
      try {
        await writable.write(text);
        await writable.close();
      } catch (error) {
        await writable.abort().catch(() => undefined);
        throw error;
      }
    },
    async remove(name) {
      await handle.removeEntry(name);
    },
    async rename(from, to) {
      const source = await fileHandle(from);
      if (typeof source.move === "function") {
        await source.move(to);
        return;
      }
      const text = await (await source.getFile()).text();
      const writable = await (await fileHandle(to, true)).createWritable();
      try {
        await writable.write(text);
        await writable.close();
      } catch (error) {
        await writable.abort().catch(() => undefined);
        throw error;
      }
      await handle.removeEntry(from);
    },
    async child(name) {
      return createHandleDirectory(await handle.getDirectoryHandle(name, { create: true }), locks);
    },
  };
}

export async function createOriginPrivateDirectory(
  storageManager: Pick<StorageManager, "getDirectory" | "persist"> | undefined = globalThis
    .navigator?.storage,
): Promise<Directory> {
  if (!storageManager || typeof storageManager.getDirectory !== "function")
    throw new Error("This browser has no private storage for documents.");
  const root = await storageManager.getDirectory();
  void storageManager.persist?.().catch(() => false);
  return createHandleDirectory(root);
}
