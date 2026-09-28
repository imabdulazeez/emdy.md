import type { Page } from "@playwright/test";

export async function readFile(page: Page, name: string): Promise<string | null> {
  return page.evaluate(async (fileName) => {
    const root = await navigator.storage.getDirectory();
    try {
      const handle = await root.getFileHandle(fileName);
      return await (await handle.getFile()).text();
    } catch {
      return null;
    }
  }, name);
}

export async function listFiles(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const [name, entry] of root.entries()) if (entry.kind === "file") names.push(name);
    return names.sort();
  });
}

export async function readCatalog(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    try {
      const dir = await root.getDirectoryHandle(".emdy");
      const handle = await dir.getFileHandle("index.json");
      return await (await handle.getFile()).text();
    } catch {
      return null;
    }
  });
}
