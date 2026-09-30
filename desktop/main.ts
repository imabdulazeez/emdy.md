import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  protocol,
  session,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
} from "electron";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  APP_ORIGIN,
  APP_SCHEME,
  APP_URL,
  appResponse,
  DICTIONARY_PREFIX,
  devServerOrigin,
  isAppDocument,
  type AppRoots,
} from "./app-url";
import { developmentIcon } from "./app-icon";
import { CHANNELS } from "./channels";
import { createCloseGuard, type CloseGuard } from "./close-guard";
import {
  defaultLibraryFolder,
  describeLocation,
  readDesktopConfig,
  writeDesktopConfig,
} from "./config";
import { textContextMenu } from "./context-menu";
import { pickSpellcheckLanguages, seedDictionaries } from "./dictionaries";
import { createFolderAccess, isSafeSegment } from "./folder";
import { applicationMenu } from "./menu";
import { isAllowedRequest, isExternalUrl, isGrantedPermission } from "./network";
import { createOpenedFiles, markdownPathsFromArgv, OPENED_FILES_STORE } from "./opened-files";
import { createFolderWatchers, createWriteLog, watchFolder } from "./watcher";
import {
  nextZoomLevel,
  syncTrafficLights,
  windowChrome,
  type ZoomDirection,
} from "./window-chrome";

const development = !app.isPackaged;
const devServerUrl = development ? (process.env.EMDY_DEV_SERVER_URL ?? null) : null;
const devOrigin = devServerOrigin(devServerUrl);
const appRoot = import.meta.dirname;
const roots: AppRoots = {
  renderer: join(appRoot, "renderer"),
  dictionaries: app.isPackaged
    ? join(process.resourcesPath, "dictionaries")
    : join(appRoot, "..", "dictionaries"),
};

if (development) {
  app.setPath(
    "userData",
    process.env.EMDY_USER_DATA_DIR ?? join(app.getPath("appData"), "emdy-dev"),
  );
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true },
  },
]);

const writes = createWriteLog();
const guards = new Map<number, CloseGuard>();
let libraryFolder = "";
let librarySession = 1;
let stopWatching: () => void = () => {};
let quitting = false;
let started = false;
const waitingPaths: string[] = [];

const folder = createFolderAccess({
  root: () => libraryFolder,
  session: () => librarySession,
  onWrite: (path, name) => {
    if (path.length === 0) writes.record(name);
  },
});

function configFile(): string {
  return join(app.getPath("userData"), "desktop.json");
}

function broadcast(channel: string): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel);
}

const fileWatchers = createFolderWatchers({ onChange: () => broadcast(CHANNELS.filesChanged) });

const openedFiles = createOpenedFiles({
  store: join(app.getPath("userData"), OPENED_FILES_STORE),
  libraryFolder: () => libraryFolder,
  onWrite: (path) => fileWatchers.record(path),
});

async function afterFileChange<T>(task: Promise<T>): Promise<T> {
  try {
    return await task;
  } finally {
    fileWatchers.sync(openedFiles.folders());
  }
}

async function openPaths(paths: readonly string[]): Promise<number> {
  if (!started) {
    waitingPaths.push(...paths);
    return paths.length;
  }
  const count = await afterFileChange(openedFiles.open(paths));
  if (count === 0) return 0;
  const window = BrowserWindow.getAllWindows()[0] ?? createWindow();
  if (window.isMinimized()) window.restore();
  window.focus();
  broadcast(CHANNELS.filesRequested);
  return count;
}

async function chooseFiles(): Promise<void> {
  const options: OpenDialogOptions = {
    title: "Open Markdown files",
    buttonLabel: "Open",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
  };
  const owner = BrowserWindow.getFocusedWindow();
  const result = owner
    ? await dialog.showOpenDialog(owner, options)
    : await dialog.showOpenDialog(options);
  if (!result.canceled) await openPaths(result.filePaths);
}

function watchLibrary(): void {
  stopWatching();
  stopWatching = watchFolder(libraryFolder, {
    log: writes,
    onChange: () => broadcast(CHANNELS.libraryChanged),
  });
}

async function useLibraryFolder(next: string, remember: boolean): Promise<void> {
  libraryFolder = next;
  librarySession++;
  watchLibrary();
  if (remember) await writeDesktopConfig(configFile(), { libraryFolder: next });
}

async function loadLibraryFolder(): Promise<void> {
  const fallback = defaultLibraryFolder(app.getPath("documents"), development);
  const override = development ? process.env.EMDY_LIBRARY_FOLDER : undefined;
  const config = await readDesktopConfig(configFile(), { libraryFolder: fallback });
  const chosen = override ?? config.libraryFolder;
  if (chosen === fallback || chosen === override) await mkdir(chosen, { recursive: true });
  await useLibraryFolder(chosen, false);
}

function isTrusted(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
  const url = event.senderFrame?.url;
  return typeof url === "string" && isAppDocument(url, devOrigin);
}

function handle(
  channel: string,
  listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrusted(event)) throw new Error("Blocked a request from an untrusted page.");
    return listener(event, ...args);
  });
}

function registerIpc(): void {
  handle(CHANNELS.folderOpen, () => folder.open());
  handle(CHANNELS.folderEnsure, (_event, token, path) => folder.ensure(token, path));
  handle(CHANNELS.folderList, (_event, token, path) => folder.list(token, path));
  handle(CHANNELS.folderStat, (_event, token, path, name) => folder.stat(token, path, name));
  handle(CHANNELS.folderRead, (_event, token, path, name) => folder.read(token, path, name));
  handle(CHANNELS.folderWrite, (_event, token, path, name, text) =>
    folder.write(token, path, name, text),
  );
  handle(CHANNELS.folderRemove, (_event, token, path, name) => folder.remove(token, path, name));
  handle(CHANNELS.folderRename, (_event, token, path, from, to) =>
    folder.rename(token, path, from, to),
  );
  handle(CHANNELS.libraryLocation, () => describeLocation(libraryFolder));
  handle(CHANNELS.libraryChoose, async (event) => {
    const options: OpenDialogOptions = {
      title: "Choose a folder for your documents",
      buttonLabel: "Use Folder",
      defaultPath: libraryFolder,
      properties: ["openDirectory", "createDirectory"],
    };
    const owner = BrowserWindow.fromWebContents(event.sender);
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options);
    const picked = result.filePaths[0];
    if (result.canceled || !picked) return null;
    await useLibraryFolder(picked, true);
    return describeLocation(libraryFolder);
  });
  handle(CHANNELS.libraryReveal, async () => {
    await shell.openPath(libraryFolder);
  });
  handle(CHANNELS.libraryRevealFile, (_event, name) => {
    if (isSafeSegment(name)) shell.showItemInFolder(join(libraryFolder, name));
  });
  handle(CHANNELS.filesList, (_event, taken) => afterFileChange(openedFiles.list(taken)));
  handle(CHANNELS.filesTake, () => openedFiles.takeRequests());
  handle(CHANNELS.filesOpen, (_event, paths) =>
    openPaths(Array.isArray(paths) ? paths.filter((path) => typeof path === "string") : []),
  );
  handle(CHANNELS.filesSave, (_event, id, change) => afterFileChange(openedFiles.save(id, change)));
  handle(CHANNELS.filesClose, (_event, id) => afterFileChange(openedFiles.close(id)));
  handle(CHANNELS.filesReveal, (_event, id) => {
    const path = openedFiles.locate(id);
    if (path) shell.showItemInFolder(path);
  });
  ipcMain.on(CHANNELS.closeReady, (event) => {
    if (isTrusted(event)) guards.get(event.sender.id)?.release();
  });
}

function serveApp(): void {
  protocol.handle(APP_SCHEME, (request) =>
    appResponse(request.url, roots, (file) => readFile(file)),
  );
}

function lockDownSession(): void {
  const current = session.defaultSession;
  current.setPermissionRequestHandler((_contents, permission, callback) =>
    callback(isGrantedPermission(permission)),
  );
  current.setPermissionCheckHandler((_contents, permission) => isGrantedPermission(permission));
  current.webRequest.onBeforeRequest((details, callback) =>
    callback({ cancel: !isAllowedRequest(details.url, details.resourceType, devOrigin) }),
  );
  current.webRequest.onBeforeSendHeaders((details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    delete requestHeaders.Referer;
    callback({ requestHeaders });
  });
  current.setSpellCheckerDictionaryDownloadURL(`${APP_ORIGIN}${DICTIONARY_PREFIX}`);
}

async function prepareSpellcheck(): Promise<void> {
  if (process.platform === "darwin") return;
  const current = session.defaultSession;
  const bundled = await seedDictionaries(
    roots.dictionaries,
    join(app.getPath("userData"), "Dictionaries"),
  );
  const supported = new Set(current.availableSpellCheckerLanguages);
  const languages = pickSpellcheckLanguages(
    app.getPreferredSystemLanguages(),
    bundled.filter((language) => supported.has(language)),
  );
  if (languages.length === 0) {
    current.setSpellCheckerEnabled(false);
    return;
  }
  current.setSpellCheckerLanguages(languages);
}

function openExternally(url: string): void {
  if (isExternalUrl(url)) void shell.openExternal(url);
}

function sendCommand(command: string): void {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  window?.webContents.send(CHANNELS.menuCommand, command);
}

function zoomWindow(direction: ZoomDirection): void {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (!window) return;
  const contents = window.webContents;
  contents.setZoomLevel(nextZoomLevel(contents.getZoomLevel(), direction));
  if (process.platform === "darwin") syncTrafficLights(window);
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 420,
    minHeight: 360,
    show: false,
    title: "emdy",
    ...(development && process.platform !== "darwin"
      ? { icon: developmentIcon(appRoot, process.platform) }
      : {}),
    ...windowChrome(process.platform),
    webPreferences: {
      preload: join(appRoot, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
      navigateOnDragDrop: false,
      devTools: development,
    },
  });
  const contents = window.webContents;
  const id = contents.id;
  const guard = createCloseGuard(() => contents.send(CHANNELS.beforeClose));
  guards.set(id, guard);

  window.once("ready-to-show", () => window.show());
  if (process.platform === "darwin") {
    contents.on("did-finish-load", () => syncTrafficLights(window));
    window.on("leave-full-screen", () => syncTrafficLights(window));
  }
  window.on("close", (event) => {
    if (contents.isDestroyed() || contents.isCrashed()) return;
    const finish = () =>
      setImmediate(() => {
        if (quitting) app.quit();
        else window.close();
      });
    if (guard.intercept(finish)) event.preventDefault();
  });
  window.on("closed", () => guards.delete(id));

  contents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: "deny" };
  });
  contents.on("will-navigate", (event) => {
    if (isAppDocument(event.url, devOrigin)) return;
    event.preventDefault();
    openExternally(event.url);
  });
  contents.on("context-menu", (_event, params) => {
    const template = textContextMenu(params, {
      replaceMisspelling: (word) => contents.replaceMisspelling(word),
      addToDictionary: (word) => contents.session.addWordToSpellCheckerDictionary(word),
    });
    if (template.length > 0) Menu.buildFromTemplate(template).popup({ window });
  });

  void window.loadURL(devServerUrl ?? APP_URL);
  return window;
}

async function start(): Promise<void> {
  await app.whenReady();
  if (development && process.platform === "darwin")
    app.dock?.setIcon(developmentIcon(appRoot, process.platform));
  lockDownSession();
  serveApp();
  registerIpc();
  await loadLibraryFolder();
  await openedFiles.load();
  fileWatchers.sync(openedFiles.folders());
  await prepareSpellcheck();
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      applicationMenu(process.platform, development, {
        openFiles: () => void chooseFiles(),
        revealLibrary: () => void shell.openPath(libraryFolder),
        zoom: zoomWindow,
        command: sendCommand,
      }),
    ),
  );
  createWindow();
  started = true;
  await openPaths([
    ...markdownPathsFromArgv(process.argv, process.cwd()),
    ...waitingPaths.splice(0),
  ]);
}

app.on("web-contents-created", (_event, contents) => {
  contents.on("will-attach-webview", (event) => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv, workingDirectory) => {
    void openPaths(markdownPathsFromArgv(argv, workingDirectory));
    const [window] = BrowserWindow.getAllWindows();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  app.on("open-file", (event, path) => {
    event.preventDefault();
    void openPaths([path]);
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("activate", () => {
    if (app.isReady() && BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  app.on("before-quit", () => {
    quitting = true;
  });
  app.on("will-quit", () => {
    stopWatching();
    fileWatchers.stop();
  });
  start().catch((error: unknown) => {
    dialog.showErrorBox(
      "emdy couldn’t start",
      error instanceof Error ? error.message : String(error),
    );
    app.quit();
  });
}
