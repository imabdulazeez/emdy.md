import { isNotFoundError, type MemoryDirectory } from "../storage/directory";
import type {
  DesktopBridge,
  DesktopPlatform,
  FolderApi,
  FolderPath,
  FolderResult,
  LibraryLocation,
} from "./bridge";

export interface MemoryBridge extends DesktopBridge {
  emitChange: () => void;
  requestClose: () => Promise<void>;
  setLocation: (next: LibraryLocation) => void;
  setChoice: (next: LibraryLocation | null) => void;
  revealed: () => number;
  setRoot: (next: MemoryDirectory | null) => void;
}

export interface MemoryBridgeOptions {
  platform?: DesktopPlatform;
  location?: LibraryLocation;
}

async function settle<T>(task: () => Promise<T>): Promise<FolderResult<T>> {
  try {
    return { ok: true, value: await task() };
  } catch (error) {
    if (isNotFoundError(error))
      return { ok: false, error: { name: "NotFoundError", message: (error as Error).message } };
    return { ok: false, error: { name: "Error", message: String(error) } };
  }
}

export function createMemoryBridge(
  initial: MemoryDirectory | null,
  options: MemoryBridgeOptions = {},
): MemoryBridge {
  let root = initial;
  let location = options.location ?? { path: "/Users/test/Documents/emdy", name: "emdy" };
  let choice: LibraryLocation | null = null;
  let reveals = 0;
  let session = 1;
  const changeListeners = new Set<() => void>();
  const closeListeners = new Set<() => Promise<void> | void>();

  const resolve = async (token: number, path: FolderPath): Promise<MemoryDirectory> => {
    if (token !== session) throw new Error("The library folder changed.");
    if (!root)
      throw new DOMException(`The folder “${location.path}” can’t be found.`, "NotFoundError");
    let current = root;
    for (const segment of path) {
      await current.child(segment);
      current = current.childDirectory(segment)!;
    }
    return current;
  };

  const folder: FolderApi = {
    open: () =>
      settle(async () => {
        await resolve(session, []);
        return session;
      }),
    ensure: (token, path) =>
      settle(async () => {
        await resolve(token, path);
        return null;
      }),
    list: (token, path) => settle(async () => (await resolve(token, path)).list()),
    stat: (token, path, name) => settle(async () => (await resolve(token, path)).stat(name)),
    read: (token, path, name) => settle(async () => (await resolve(token, path)).read(name)),
    write: (token, path, name, text) =>
      settle(async () => {
        await (await resolve(token, path)).write(name, text);
        return null;
      }),
    remove: (token, path, name) =>
      settle(async () => {
        await (await resolve(token, path)).remove(name);
        return null;
      }),
    rename: (token, path, from, to) =>
      settle(async () => {
        await (await resolve(token, path)).rename(from, to);
        return null;
      }),
  };

  return {
    platform: options.platform ?? "darwin",
    folder,
    library: {
      location: async () => location,
      async choose() {
        if (choice) {
          location = choice;
          session++;
        }
        return choice;
      },
      async reveal() {
        reveals++;
      },
      onChange(listener) {
        changeListeners.add(listener);
        return () => changeListeners.delete(listener);
      },
    },
    window: {
      onBeforeClose(listener) {
        closeListeners.add(listener);
        return () => closeListeners.delete(listener);
      },
    },
    emitChange() {
      for (const listener of changeListeners) listener();
    },
    async requestClose() {
      await Promise.all(Array.from(closeListeners, (listener) => Promise.resolve().then(listener)));
    },
    setLocation(next) {
      location = next;
    },
    setChoice(next) {
      choice = next;
    },
    revealed: () => reveals,
    setRoot(next) {
      root = next;
      session++;
    },
  };
}
