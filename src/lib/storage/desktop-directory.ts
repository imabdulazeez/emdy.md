import {
  unwrapFolderResult,
  type DesktopBridge,
  type FolderApi,
  type FolderPath,
} from "../desktop/bridge";
import { LIBRARY_LOCK, type Directory } from "./directory";

type Locks = Pick<LockManager, "request"> | undefined;

function folderDirectory(
  folder: FolderApi,
  session: number,
  path: FolderPath,
  locks: Locks,
): Directory {
  return {
    exclusive(task) {
      if (!locks) return Promise.reject(new Error("Document storage cannot be coordinated."));
      return locks.request(LIBRARY_LOCK, task);
    },
    list: async () => unwrapFolderResult(await folder.list(session, path)),
    stat: async (name) => unwrapFolderResult(await folder.stat(session, path, name)),
    read: async (name) => unwrapFolderResult(await folder.read(session, path, name)),
    async write(name, text) {
      unwrapFolderResult(await folder.write(session, path, name, text));
    },
    async remove(name) {
      unwrapFolderResult(await folder.remove(session, path, name));
    },
    async rename(from, to) {
      unwrapFolderResult(await folder.rename(session, path, from, to));
    },
    async child(name) {
      const next = [...path, name];
      unwrapFolderResult(await folder.ensure(session, next));
      return folderDirectory(folder, session, next, locks);
    },
  };
}

export async function createDesktopDirectory(
  bridge: Pick<DesktopBridge, "folder">,
  locks: Locks = globalThis.navigator?.locks,
): Promise<Directory> {
  const session = unwrapFolderResult(await bridge.folder.open());
  return folderDirectory(bridge.folder, session, [], locks);
}
