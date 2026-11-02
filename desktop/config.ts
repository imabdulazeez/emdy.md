import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";
import type { LibraryLocation } from "../src/lib/desktop/bridge";

export interface DesktopConfig {
  libraryFolder: string;
}

export const LIBRARY_FOLDER_NAME = "emdy";
export const DEV_LIBRARY_FOLDER_NAME = "emdy-dev";

export function isDesktopConfig(value: unknown): value is DesktopConfig {
  if (typeof value !== "object" || value === null) return false;
  const folder = (value as Record<string, unknown>).libraryFolder;
  return typeof folder === "string" && folder.length > 0 && isAbsolute(folder);
}

export function defaultLibraryFolder(documents: string, development: boolean): string {
  return join(documents, development ? DEV_LIBRARY_FOLDER_NAME : LIBRARY_FOLDER_NAME);
}

export async function readDesktopConfig(
  file: string,
  fallback: DesktopConfig,
): Promise<DesktopConfig> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
    return isDesktopConfig(parsed) ? { libraryFolder: parsed.libraryFolder } : fallback;
  } catch {
    return fallback;
  }
}

export async function writeDesktopConfig(file: string, config: DesktopConfig): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const staged = `${file}.tmp`;
  await writeFile(staged, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await rename(staged, file);
}

export function describeLocation(folder: string): LibraryLocation {
  return { path: folder, name: basename(folder) || folder };
}
