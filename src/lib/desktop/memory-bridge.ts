import type { DocumentIcon } from "../document-icon";
import { makeDocumentId } from "../route";
import { isNotFoundError, type MemoryDirectory } from "../storage/directory";
import { markdownExtension, sanitizeStem, titleFromFilename } from "../storage/filenames";
import { hashText } from "../storage/hash";
import type {
  DesktopBridge,
  DesktopPlatform,
  FolderApi,
  FolderPath,
  FolderResult,
  LibraryLocation,
  OpenedFile,
  OpenedFilesApi,
  OpenRequest,
} from "./bridge";

export interface MemoryOpenedFile {
  name: string;
  text: string;
  modified: number;
  icon: DocumentIcon | null;
  missing: boolean;
}

export interface MemoryBridge extends DesktopBridge {
  emitChange: () => void;
  requestClose: () => Promise<void>;
  setLocation: (next: LibraryLocation) => void;
  setChoice: (next: LibraryLocation | null) => void;
  revealed: () => number;
  revealedFiles: () => string[];
  setRoot: (next: MemoryDirectory | null) => void;
  openFile: (name: string, text: string) => string;
  requestLibraryFile: (name: string) => void;
  openedFile: (id: string) => MemoryOpenedFile | undefined;
  editOpenedFile: (id: string, text: string) => void;
  removeOpenedFile: (id: string) => void;
  closedFiles: () => string[];
  emitFilesChange: () => void;
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
  let clock = 1_000;
  const revealedFiles: string[] = [];
  const opened = new Map<string, MemoryOpenedFile>();
  const closed: string[] = [];
  let requests: OpenRequest[] = [];
  const changeListeners = new Set<() => void>();
  const closeListeners = new Set<() => Promise<void> | void>();
  const requestListeners = new Set<() => void>();
  const fileListeners = new Set<() => void>();

  const describe = (id: string, file: MemoryOpenedFile): OpenedFile => ({
    id,
    name: file.name,
    text: file.text,
    modified: file.modified,
    icon: file.icon,
  });

  const register = (name: string, text: string): string => {
    const id = makeDocumentId(opened.keys());
    opened.set(id, { name, text, modified: ++clock, icon: null, missing: false });
    return id;
  };

  const request = (next: OpenRequest) => {
    requests.push(next);
    for (const listener of requestListeners) listener();
  };

  const files: OpenedFilesApi = {
    list: async (taken) => {
      for (const id of taken) {
        const file = opened.get(id);
        if (!file) continue;
        opened.delete(id);
        opened.set(makeDocumentId([...opened.keys(), ...taken]), file);
      }
      const list = Array.from(opened, ([id, file]) => ({ id, file }));
      return {
        ok: true,
        value: {
          files: list.filter(({ file }) => !file.missing).map(({ id, file }) => describe(id, file)),
          missing: list.filter(({ file }) => file.missing).map(({ id }) => id),
        },
      };
    },
    takeRequests: async () => {
      const taken = requests;
      requests = [];
      return taken;
    },
    async openDropped(dropped) {
      let count = 0;
      for (const file of dropped) {
        if (!markdownExtension(file.name)) continue;
        request({ kind: "file", id: register(file.name, await file.text()) });
        count++;
      }
      return count;
    },
    save: async (id, change) => {
      const file = opened.get(id);
      if (!file)
        return {
          ok: false,
          error: { name: "NotFoundError", message: "That file is no longer open." },
        };
      let conflict: OpenedFile | null = null;
      if (!file.missing && file.text !== change.text && hashText(file.text) !== change.base) {
        const copy = register(`${titleFromFilename(file.name)} (conflict).md`, file.text);
        conflict = describe(copy, opened.get(copy)!);
      }
      if (change.title !== titleFromFilename(file.name))
        file.name = `${sanitizeStem(change.title)}${markdownExtension(file.name) ?? ".md"}`;
      if (file.text !== change.text || file.missing) file.modified = ++clock;
      file.text = change.text;
      file.icon = change.icon;
      file.missing = false;
      return { ok: true, value: { file: describe(id, file), conflict } };
    },
    close: async (id) => {
      opened.delete(id);
      closed.push(id);
    },
    reveal: async (id) => {
      revealedFiles.push(id);
    },
    onRequest(listener) {
      requestListeners.add(listener);
      return () => requestListeners.delete(listener);
    },
    onChange(listener) {
      fileListeners.add(listener);
      return () => fileListeners.delete(listener);
    },
  };

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
      async revealFile(name) {
        revealedFiles.push(name);
      },
      onChange(listener) {
        changeListeners.add(listener);
        return () => changeListeners.delete(listener);
      },
    },
    files,
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
    revealedFiles: () => [...revealedFiles],
    setRoot(next) {
      root = next;
      session++;
    },
    openFile(name, text) {
      const id = register(name, text);
      request({ kind: "file", id });
      return id;
    },
    requestLibraryFile(name) {
      request({ kind: "library", name });
    },
    openedFile: (id) => opened.get(id),
    editOpenedFile(id, text) {
      const file = opened.get(id);
      if (!file) return;
      file.text = text;
      file.modified = ++clock;
    },
    removeOpenedFile(id) {
      const file = opened.get(id);
      if (file) file.missing = true;
    },
    closedFiles: () => [...closed],
    emitFilesChange() {
      for (const listener of fileListeners) listener();
    },
  };
}
