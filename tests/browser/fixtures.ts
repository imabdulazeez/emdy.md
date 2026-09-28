import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import { TEST_DOCUMENTS, type TestDocument } from "../../src/test-documents";

export { TEST_DOCUMENTS };

export interface ObservedRequest {
  method: string;
  resourceType: string;
  url: string;
  referer: string | null;
}

const observed = new WeakMap<BrowserContext, ObservedRequest[]>();

export const test = base.extend<{ requests: ObservedRequest[] }>({
  requests: async ({ context }, use) => {
    await use(observed.get(context)!);
  },
  context: async ({ context, baseURL }, use) => {
    const origin = new URL(baseURL!).origin;
    const requests: ObservedRequest[] = [];
    observed.set(context, requests);
    const assets = new Set(
      readdirSync("dist", { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map(
          (entry) =>
            `/${relative("dist", join(entry.parentPath, entry.name)).split(sep).join("/")}`,
        ),
    );
    const unexpected: string[] = [];
    const errors: string[] = [];

    context.on("weberror", (error) => errors.push(error.error().message));
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const headers = await request.allHeaders();
      requests.push({
        method: request.method(),
        resourceType: request.resourceType(),
        url: request.url(),
        referer: headers.referer ?? null,
      });
      const navigation = request.isNavigationRequest() && url.pathname === "/";
      const asset =
        assets.has(url.pathname) &&
        ["script", "stylesheet", "font", "image", "other"].includes(request.resourceType());
      if (
        url.origin === origin &&
        request.method() === "GET" &&
        !url.search &&
        (navigation || asset)
      ) {
        await route.continue();
        return;
      }
      unexpected.push(`${request.method()} ${request.resourceType()} ${request.url()}`);
      await route.abort("blockedbyclient");
    });
    await context.routeWebSocket("**/*", async (socket) => {
      unexpected.push(`WebSocket ${socket.url()}`);
      await socket.close();
    });

    await use(context);

    expect(
      unexpected,
      "Only root document navigations and bundled static assets may use the network",
    ).toEqual([]);
    expect(errors, "The browser should not report uncaught application errors").toEqual([]);
  },
});

export { expect } from "@playwright/test";

export function archiveOf(documents: readonly TestDocument[], exportedAt = Date.now()): string {
  return JSON.stringify({
    format: "emdy-library",
    version: 1,
    exportedAt,
    documents: documents.map((doc, index) => ({
      ...doc,
      created: exportedAt - (documents.length - index) * 60_000,
      modified: exportedAt,
    })),
  });
}

export async function seedLibrary(
  page: Page,
  documents: readonly TestDocument[] = TEST_DOCUMENTS,
): Promise<void> {
  await page.goto("/");
  const welcome = page.getByTestId("empty-library");
  await expect(
    welcome.getByRole("heading", { name: "Welcome to emdy", exact: true }),
  ).toBeVisible();
  await welcome.getByLabel("Import documents file").setInputFiles({
    name: "emdy.json",
    mimeType: "application/json",
    buffer: Buffer.from(archiveOf(documents)),
  });
  const list = page.getByRole("list", { name: "Documents", exact: true });
  for (const doc of documents)
    await expect(list.getByRole("button", { name: doc.title, exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`#/d/[a-z0-9-]*${documents[0].id}`));
  await expect(welcome).toHaveCount(0);
}

export async function readLibraryFile(page: Page, name: string): Promise<string | null> {
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
