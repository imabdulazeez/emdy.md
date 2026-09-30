import type { Locator, Page } from "@playwright/test";
import { test, expect, seedLibrary } from "./fixtures";
import { readCatalog } from "./opfs";

const sidebarButton = (page: Page, name: string) =>
  page
    .getByRole("list", { name: "Documents", exact: true })
    .getByRole("button", { name, exact: true });

async function readCatalogEntry(page: Page, id: string): Promise<Record<string, unknown> | null> {
  const raw = await readCatalog(page);
  if (raw === null) return null;
  const catalog = JSON.parse(raw) as { documents: { id: string }[] };
  return catalog.documents.find((entry) => entry.id === id) ?? null;
}

async function expectInsideViewport(page: Page, target: Locator): Promise<void> {
  const box = (await target.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

test("an icon chosen from the right-click menu is saved beside the files and survives a reload", async ({
  page,
  context,
  requests,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await seedLibrary(page);
  const reading = () => sidebarButton(page, "Reading list");
  await expect(reading().locator("[data-document-icon=automatic] text")).toHaveText("RL");

  await reading().click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Reading list", exact: true });
  await expect(menu).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Change icon…", exact: true })).toBeFocused();
  await expectInsideViewport(page, menu);

  const registry = page.waitForResponse((response) =>
    new URL(response.url()).pathname.startsWith("/assets/lucide-registry-"),
  );
  await page.getByRole("menuitem", { name: "Change icon…", exact: true }).click();
  await expect(menu).toHaveCount(0);
  const dialog = page.getByRole("dialog", { name: "Document icon", exact: true });
  await expect(dialog).toBeVisible();
  expect((await registry).ok()).toBe(true);
  await expect(dialog.getByRole("group", { name: "Icons", exact: true })).toBeVisible();

  await context.setOffline(true);
  const search = dialog.getByRole("searchbox", { name: "Search icons", exact: true });
  await expect(search).toBeFocused();
  await search.fill("map pin");
  await dialog.getByRole("button", { name: "Map pin", exact: true }).click();
  await dialog.getByRole("radio", { name: "Violet", exact: true }).click();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(reading()).toBeFocused();
  const glyph = reading().locator("[data-document-icon=lucide] svg");
  await expect(glyph).toBeVisible();
  await context.setOffline(false);

  await expect
    .poll(() => readCatalogEntry(page, "readng"))
    .toMatchObject({ icon: { kind: "lucide", name: "map-pin", color: "violet" } });

  await reading().click();
  await expect(page).toHaveURL(/#\/d\/reading-list-readng/);
  const beforeReload = requests.length;
  await page.reload();
  await expect(page).toHaveURL(/#\/d\/reading-list-readng/);
  await expect(glyph).toBeVisible();
  const lucideChunks = requests
    .slice(beforeReload)
    .map((request) => new URL(request.url).pathname.match(/^\/assets\/(lucide-[a-z0-9]+)-/)?.[1])
    .filter((name) => name !== undefined);
  expect(new Set(lucideChunks)).toEqual(new Set(["lucide-registry", "lucide-m"]));
  const box = (await glyph.boundingBox())!;
  expect(box.width).toBeGreaterThan(8);
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await expect(editor).toContainText("# Reading list");
  await editor.press("ControlOrMeta+End");
  await page.keyboard.type(" Still editable.");
  await expect(editor).toContainText("Still editable.");

  await page.getByRole("button", { name: "Hide sidebar", exact: true }).click();
  const collapsed = reading().locator("[data-document-icon=lucide]");
  await expect(collapsed).toBeVisible();
  const collapsedBox = (await collapsed.boundingBox())!;
  expect(collapsedBox.width).toBeGreaterThan(8);

  await reading().focus();
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menuitem", { name: "Change icon…", exact: true })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("menuitem", { name: "Pin", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(
    page.getByRole("menuitem", { name: "Use automatic icon", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(reading().locator("[data-document-icon=automatic] text")).toHaveText("RL");
  await expect(reading()).toBeFocused();
  await expect.poll(() => readCatalogEntry(page, "readng")).not.toHaveProperty("icon");
});

test("context menus stay on screen, open from the keyboard, and hand focus back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 520 });
  await seedLibrary(page);
  const content = page.locator("[data-sidebar=content]");
  const area = (await content.boundingBox())!;
  await page.mouse.click(area.x + area.width - 4, area.y + area.height - 4, { button: "right" });
  const library = page.getByRole("menu", { name: "Library", exact: true });
  await expect(library).toBeVisible();
  await expectInsideViewport(page, library);
  const libraryBox = (await library.boundingBox())!;
  expect(libraryBox.y + libraryBox.height).toBeLessThanOrEqual(area.y + area.height);
  await expect(page.getByRole("menu")).toHaveCount(1);

  const weekly = sidebarButton(page, "Weekly sync — product");
  await weekly.click({ button: "right" });
  await expect(library).toHaveCount(0);
  await expect(
    page.getByRole("menu", { name: "Weekly sync — product", exact: true }),
  ).toBeVisible();
  await page.mouse.click(area.x + area.width / 2, area.y + area.height - 4);
  await expect(page.getByRole("menu")).toHaveCount(0);

  await weekly.focus();
  await page.keyboard.press("Shift+F10");
  const menu = page.getByRole("menu", { name: "Weekly sync — product", exact: true });
  await expect(menu).toBeVisible();
  const anchor = (await weekly.boundingBox())!;
  const menuBox = (await menu.boundingBox())!;
  expect(menuBox.y).toBeGreaterThanOrEqual(anchor.y);
  expect(Math.abs(menuBox.x - anchor.x)).toBeLessThan(anchor.width);
  await expect(page.getByRole("menuitem", { name: "Change icon…", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Pin", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Delete…", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(weekly).toBeFocused();

  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menuitem", { name: "Change icon…", exact: true })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("menuitem", { name: "Delete…", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  const confirm = page.getByRole("group", { name: "Delete Weekly sync — product?", exact: true });
  await expect(confirm.getByRole("button", { name: "Delete", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirm).toHaveCount(0);
});

test("an emoji icon keeps its place in the list without moving the document to today", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await seedLibrary(page);
  const ideas = () => sidebarButton(page, "Project ideas");
  const before = await readCatalogEntry(page, "ideas0");
  await ideas().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Change icon…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Document icon", exact: true });
  await dialog.getByRole("radio", { name: "Emoji", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Custom emoji", exact: true }).fill("🦊 fox");
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(ideas().locator("[data-document-icon=emoji]")).toHaveText("🦊");
  await expect
    .poll(() => readCatalogEntry(page, "ideas0"))
    .toMatchObject({ icon: { kind: "emoji", emoji: "🦊" }, modified: before!.modified });
  await page.reload();
  await expect(ideas().locator("[data-document-icon=emoji]")).toHaveText("🦊");
});
