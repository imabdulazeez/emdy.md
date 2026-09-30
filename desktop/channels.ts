export const CHANNELS = {
  folderOpen: "emdy:folder:open",
  folderEnsure: "emdy:folder:ensure",
  folderList: "emdy:folder:list",
  folderStat: "emdy:folder:stat",
  folderRead: "emdy:folder:read",
  folderWrite: "emdy:folder:write",
  folderRemove: "emdy:folder:remove",
  folderRename: "emdy:folder:rename",
  libraryLocation: "emdy:library:location",
  libraryChoose: "emdy:library:choose",
  libraryReveal: "emdy:library:reveal",
  libraryChanged: "emdy:library:changed",
  beforeClose: "emdy:window:before-close",
  closeReady: "emdy:window:close-ready",
} as const;

export type Channel = (typeof CHANNELS)[keyof typeof CHANNELS];
