import type { BrowserContext, Page } from "@playwright/test";
import { TABLE_DOCUMENT, TABLE_DOCUMENT_COPIES } from "../../src/test-documents";
import { test, expect, seedLibrary, type ObservedRequest } from "./fixtures";

const SHORTCUT = "ControlOrMeta+Alt+Shift+KeyC";

async function openTableDocument(page: Page, context: BrowserContext): Promise<void> {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await seedLibrary(page, [TABLE_DOCUMENT]);
}

function readClipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}

function copyMenu(page: Page) {
  return page.getByRole("menu", { name: "Copy table", exact: true });
}

/** Copying is local: no request may carry any of the table's text. */
function expectNoTableTextSent(requests: ObservedRequest[]): void {
  for (const request of requests) {
    for (const text of ["Tea, green", "Pipe | cell", "Spring order", "Totals follow"]) {
      expect(`${request.url} ${request.referer ?? ""}`).not.toContain(encodeURIComponent(text));
      expect(`${request.url} ${request.referer ?? ""}`).not.toContain(text);
    }
  }
}

for (const mode of ["Raw Markdown", "Editable preview"]) {
  test(`copies the table being edited as Markdown and CSV from the grid in ${mode}`, async ({
    page,
    context,
    requests,
  }) => {
    await openTableDocument(page, context);
    const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
    await editor.press("ControlOrMeta+Home");
    if (mode === "Editable preview") {
      await page.keyboard.press("ControlOrMeta+2");
      await page.getByRole("columnheader", { name: "Item", exact: true }).click();
    } else {
      await editor.press("ArrowDown");
      await editor.press("ArrowDown");
    }
    const heading = page.getByRole("textbox", { name: "Column 1 heading", exact: true });
    await expect(heading).toBeFocused();
    const grid = page.getByRole("group", { name: "Table editor", exact: true });
    const menu = copyMenu(page);

    // Keyboard: the shortcut opens the menu from the focused cell, and the grid stays open.
    await page.keyboard.press(SHORTCUT);
    await expect(menu).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "Copy as Markdown", exact: true }),
    ).toBeFocused();
    await expect(grid).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(menu.getByRole("menuitem", { name: "Copied", exact: true })).toBeVisible();
    await expect.poll(() => readClipboard(page)).toBe(TABLE_DOCUMENT_COPIES.markdown);
    await expect(menu).toHaveCount(0);
    await expect(heading).toBeFocused();

    // Mouse: the grid's Copy action, which leaves focus in the cell until the menu takes it.
    const copy = grid.getByRole("button", { name: "Copy table as Markdown or CSV", exact: true });
    await copy.click();
    await expect(menu).toBeVisible();
    await expect(copy).toHaveAttribute("aria-expanded", "true");
    const copyBox = (await copy.boundingBox())!;
    const menuBox = (await menu.boundingBox())!;
    expect(menuBox.y).toBeGreaterThanOrEqual(copyBox.y + copyBox.height);
    await menu.getByRole("menuitem", { name: "Copy as CSV", exact: true }).click();
    await expect.poll(() => readClipboard(page)).toBe(TABLE_DOCUMENT_COPIES.csv);
    await expect(menu).toHaveCount(0);
    await expect(copy).toHaveAttribute("aria-expanded", "false");
    await expect(heading).toBeFocused();
    await expect(grid).toBeVisible();

    // Escape closes the menu without copying and hands the cell back for typing.
    await page.keyboard.press(SHORTCUT);
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(heading).toBeFocused();
    expect(await readClipboard(page)).toBe(TABLE_DOCUMENT_COPIES.csv);
    await page.keyboard.press("End");
    await page.keyboard.type(" name");
    await expect(heading).toHaveValue("Item name");

    expectNoTableTextSent(requests);
  });
}

test("copies a rendered table from its corner button in Editable preview", async ({
  page,
  context,
  requests,
}) => {
  await openTableDocument(page, context);
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await page.keyboard.press("ControlOrMeta+2");
  const table = editor.getByRole("table");
  await expect(table).toBeVisible();
  const trigger = editor.getByRole("button", { name: "Copy table", exact: true });
  const tools = editor.locator(".table-tools");
  const grid = page.getByRole("group", { name: "Table editor", exact: true });
  const menu = copyMenu(page);

  // The control stays out of the way until the pointer is over the table.
  await page.mouse.move(0, 0);
  await expect(tools).toHaveCSS("opacity", "0");
  await table.getByRole("columnheader", { name: "Note", exact: true }).hover();
  await expect(tools).toHaveCSS("opacity", "1");
  const tableBox = (await table.boundingBox())!;
  const triggerBox = (await trigger.boundingBox())!;
  expect(triggerBox.x + triggerBox.width).toBeLessThanOrEqual(tableBox.x + tableBox.width + 1);
  expect(triggerBox.y).toBeGreaterThanOrEqual(tableBox.y - 1);

  // Mouse: open the menu and copy CSV; the "Copied" confirmation shows, then the menu closes.
  await trigger.click();
  await expect(menu).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await menu.getByRole("menuitem", { name: "Copy as CSV", exact: true }).click();
  await expect(menu.getByRole("menuitem", { name: "Copied", exact: true })).toBeVisible();
  await expect.poll(() => readClipboard(page)).toBe(TABLE_DOCUMENT_COPIES.csv);
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(grid).toHaveCount(0);

  // Keyboard: Enter opens the menu on its first item, arrows move, Enter copies.
  await page.mouse.move(0, 0);
  await expect(tools).toHaveCSS("opacity", "1");
  await page.keyboard.press("Enter");
  await expect(menu.getByRole("menuitem", { name: "Copy as Markdown", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Copy as Markdown", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(() => readClipboard(page)).toBe(TABLE_DOCUMENT_COPIES.markdown);
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();

  // Copying never edits the document.
  await expect(grid).toHaveCount(0);
  await expect(editor).toContainText("Spring order");
  await expect(editor).not.toContainText("| Item");
  expectNoTableTextSent(requests);
});

test("copies a table in Read-only preview with the keyboard and the mouse", async ({
  page,
  context,
  requests,
}) => {
  await openTableDocument(page, context);
  await page.keyboard.press("ControlOrMeta+3");
  const preview = page.getByRole("document", { name: "Preview", exact: true });
  const table = preview.getByRole("table");
  await expect(table).toBeVisible();
  const trigger = preview.getByRole("button", { name: "Copy table", exact: true });
  const tools = preview.locator(".table-tools");
  const menu = copyMenu(page);

  // Keyboard: Tab from the paragraph above the table reaches the copy button.
  await page.mouse.move(0, 0);
  await expect(tools).toHaveCSS("opacity", "0");
  await preview.getByText("Spring order", { exact: true }).click();
  await page.mouse.move(0, 0);
  await page.keyboard.press("Tab");
  await expect(trigger).toBeFocused();
  await expect(tools).toHaveCSS("opacity", "1");
  await page.keyboard.press("Enter");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Copy as Markdown", exact: true })).toBeFocused();
  await page.keyboard.press("End");
  await expect(menu.getByRole("menuitem", { name: "Copy as CSV", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(() => readClipboard(page)).toBe(TABLE_DOCUMENT_COPIES.csv);
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();

  // Mouse: hover reveals the button; a click outside dismisses without copying.
  await table.getByRole("cell", { name: "Tea, green", exact: true }).hover();
  await expect(tools).toHaveCSS("opacity", "1");
  await trigger.click();
  await expect(menu).toBeVisible();
  await preview.getByText("Totals follow.", { exact: true }).click();
  await expect(menu).toHaveCount(0);
  expect(await readClipboard(page)).toBe(TABLE_DOCUMENT_COPIES.csv);

  await table.hover();
  await trigger.click();
  await menu.getByRole("menuitem", { name: "Copy as Markdown", exact: true }).click();
  await expect(menu.getByRole("menuitem", { name: "Copied", exact: true })).toBeVisible();
  await expect.poll(() => readClipboard(page)).toBe(TABLE_DOCUMENT_COPIES.markdown);
  await expect(menu).toHaveCount(0);
  expectNoTableTextSent(requests);
});

for (const mode of ["Raw Markdown", "Editable preview"]) {
  test(`selects and copies the whole document across a table in ${mode}`, async ({
    page,
    context,
  }) => {
    await openTableDocument(page, context);
    const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
    if (mode === "Editable preview") await page.keyboard.press("ControlOrMeta+2");
    await editor.getByText("Spring order", { exact: true }).click();
    await page.keyboard.press("ControlOrMeta+a");
    await expect(editor).toBeFocused();
    await expect(page.getByRole("group", { name: "Table editor", exact: true })).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+c");
    await expect.poll(() => readClipboard(page)).toBe(TABLE_DOCUMENT.text);
    await expect(editor).toBeFocused();
  });
}
