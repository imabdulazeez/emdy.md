import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";

export const APP_DIR = resolve("out", "desktop", "app");

export interface DesktopSandbox {
  folder: string;
  userData: string;
  dispose: () => Promise<void>;
}

export interface DesktopSession {
  app: ElectronApplication;
  page: Page;
  requests: string[];
  errors: string[];
}

export async function createSandbox(): Promise<DesktopSandbox> {
  const folder = await mkdtemp(join(tmpdir(), "emdy-desktop-folder-"));
  const userData = await mkdtemp(join(tmpdir(), "emdy-desktop-data-"));
  return {
    folder,
    userData,
    async dispose() {
      await rm(folder, { recursive: true, force: true });
      await rm(userData, { recursive: true, force: true });
    },
  };
}

function sandboxEnv(sandbox: DesktopSandbox): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    EMDY_USER_DATA_DIR: sandbox.userData,
    EMDY_LIBRARY_FOLDER: sandbox.folder,
  };
}

export async function launchDesktop(
  sandbox: DesktopSandbox,
  files: readonly string[] = [],
): Promise<DesktopSession> {
  const app = await electron.launch({ args: [APP_DIR, ...files], env: sandboxEnv(sandbox) });
  const page = await app.firstWindow();
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  return { app, page, requests, errors };
}

/** Starts the app again, as a file manager's "Open with" does, and waits for it to hand off. */
export async function launchSecondInstance(
  sandbox: DesktopSandbox,
  files: readonly string[],
): Promise<number | null> {
  const binary = createRequire(import.meta.url)("electron") as string;
  const child = spawn(binary, [APP_DIR, ...files], { env: sandboxEnv(sandbox), stdio: "ignore" });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code));
  });
}

export async function readFolderFile(folder: string, name: string): Promise<string | null> {
  try {
    return await readFile(join(folder, name), "utf8");
  } catch {
    return null;
  }
}

export function isLocalRequest(url: string): boolean {
  return (
    url.startsWith("app://emdy/") ||
    url.startsWith("data:") ||
    url.startsWith("blob:") ||
    url.startsWith("devtools:")
  );
}
