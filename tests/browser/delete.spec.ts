import type { Page } from "@playwright/test";
import { test, expect, readLibraryFile, seedLibrary, TEST_DOCUMENTS } from "./fixtures";

interface Box {
  y: number;
  height: number;
}

interface RowSamples {
  full: number;
  heights: number[];
  removing: boolean;
  removed: boolean;
}

const TITLES = TEST_DOCUMENTS.map((doc) => doc.title);
const [WELCOME, WEEKLY, READING, IDEAS] = TITLES;

const documentList = (page: Page) => page.getByRole("list", { name: "Documents", exact: true });
const sidebarButton = (page: Page, name: string) =>
  documentList(page).getByRole("button", { name, exact: true });
const rows = (page: Page) => documentList(page).locator("[data-document-row]");

async function listedTitles(page: Page): Promise<(string | null)[]> {
  return documentList(page)
    .locator("[data-sidebar=menu-button]")
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));
}

async function rowBoxes(page: Page): Promise<Box[]> {
  return rows(page).evaluateAll((items) =>
    items.map((item) => {
      const { y, height } = item.getBoundingClientRect();
      return { y, height };
    }),
  );
}

/**
 * Records the row's real height every frame until it leaves the DOM, so a
 * test can tell a collapse from an instant removal without touching app state.
 */
async function sampleRow(page: Page, title: string): Promise<void> {
  await page.evaluate((name) => {
    const row = Array.from(document.querySelectorAll<HTMLElement>("[data-document-row]")).find(
      (item) =>
        item.querySelector("[data-sidebar=menu-button]")?.getAttribute("aria-label") === name,
    );
    if (!row) throw new Error(`No sidebar row for ${name}`);
    const samples: RowSamples = {
      full: row.getBoundingClientRect().height,
      heights: [],
      removing: false,
      removed: false,
    };
    (window as unknown as { rowSamples: RowSamples }).rowSamples = samples;
    const tick = () => {
      if (!row.isConnected) {
        samples.removed = true;
        return;
      }
      samples.heights.push(row.getBoundingClientRect().height);
      if (row.hasAttribute("data-removing")) samples.removing = true;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, title);
}

async function rowSamples(page: Page): Promise<RowSamples> {
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { rowSamples: RowSamples }).rowSamples))
    .toMatchObject({ removed: true });
  return page.evaluate(() => (window as unknown as { rowSamples: RowSamples }).rowSamples);
}

/** The remaining rows sit exactly where the first rows sat before, touching nothing. */
function expectClosedGap(before: readonly Box[], after: readonly Box[]): void {
  expect(after).toHaveLength(before.length - 1);
  after.forEach((box, index) => {
    expect(box.height).toBeGreaterThan(0);
    expect(box.height).toBeCloseTo(before[index].height, 0);
    expect(box.y).toBeCloseTo(before[index].y, 0);
    if (index > 0) {
      const previous = after[index - 1];
      expect(box.y).toBeGreaterThanOrEqual(previous.y + previous.height);
    }
  });
}

async function deleteWithMouse(page: Page, title: string): Promise<void> {
  await documentList(page)
    .getByRole("button", { name: `Delete ${title}`, exact: true })
    .click();
  await page
    .getByRole("group", { name: `Delete ${title}?`, exact: true })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
}

async function deleteWithKeyboard(page: Page, title: string): Promise<void> {
  await sidebarButton(page, title).focus();
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menuitem", { name: "Change icon…", exact: true })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("menuitem", { name: "Delete…", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  const confirm = page
    .getByRole("group", { name: `Delete ${title}?`, exact: true })
    .getByRole("button", { name: "Delete", exact: true });
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Enter");
}

test("a row deleted with the mouse collapses, the rows below close the gap, and the deletion survives a reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await seedLibrary(page);
  await expect.poll(() => listedTitles(page)).toEqual(TITLES);
  const before = await rowBoxes(page);

  await sampleRow(page, WEEKLY);
  await deleteWithMouse(page, WEEKLY);
  await expect(sidebarButton(page, READING)).toBeFocused();
  const samples = await rowSamples(page);
  expect(samples.removing).toBe(true);
  expect(
    samples.heights.some((height) => height > 1 && height < samples.full - 1),
    `the row should pass through intermediate heights while collapsing: ${samples.heights.join(", ")}`,
  ).toBe(true);

  await expect(rows(page)).toHaveCount(TITLES.length - 1);
  expect(await listedTitles(page)).toEqual([WELCOME, READING, IDEAS]);
  expectClosedGap(before, await rowBoxes(page));
  await expect(sidebarButton(page, READING)).toBeFocused();
  await expect(sidebarButton(page, WELCOME)).toHaveAttribute("aria-current", "page");
  await expect.poll(() => readLibraryFile(page, `${WEEKLY}.md`)).toBeNull();

  await page.reload();
  await expect.poll(() => listedTitles(page)).toEqual([WELCOME, READING, IDEAS]);
  await expect(sidebarButton(page, WEEKLY)).toHaveCount(0);
});

test("rows deleted from the keyboard menu hand focus to a neighbour and navigate away from the active one", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await seedLibrary(page);
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await expect.poll(() => listedTitles(page)).toEqual(TITLES);
  await expect(sidebarButton(page, WELCOME)).toHaveAttribute("aria-current", "page");
  let before = await rowBoxes(page);

  await sampleRow(page, WELCOME);
  await deleteWithKeyboard(page, WELCOME);
  await expect(sidebarButton(page, WEEKLY)).toBeFocused();
  expect((await rowSamples(page)).removing).toBe(true);
  await expect(rows(page)).toHaveCount(TITLES.length - 1);
  expectClosedGap(before, await rowBoxes(page));
  await expect(sidebarButton(page, WEEKLY)).toBeFocused();
  await expect(sidebarButton(page, WEEKLY)).toHaveAttribute("aria-current", "page");
  await expect(page).toHaveURL(/#\/d\/[a-z0-9-]*weekly(\/|$)/);
  await expect(editor).toContainText("# Weekly sync — product");

  before = await rowBoxes(page);
  await deleteWithKeyboard(page, IDEAS);
  await expect(sidebarButton(page, READING)).toBeFocused();
  await expect(rows(page)).toHaveCount(TITLES.length - 2);
  expectClosedGap(before, await rowBoxes(page));
  await expect(sidebarButton(page, READING)).toBeFocused();
  await expect.poll(() => readLibraryFile(page, `${WELCOME}.md`)).toBeNull();
  await expect.poll(() => readLibraryFile(page, `${IDEAS}.md`)).toBeNull();

  await page.reload();
  await expect.poll(() => listedTitles(page)).toEqual([WEEKLY, READING]);
  await expect(page).toHaveURL(/#\/d\/[a-z0-9-]*weekly(\/|$)/);
  await expect(editor).toContainText("# Weekly sync — product");
});

test("with reduced motion a deleted row is removed at once, without collapsing", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1400, height: 900 });
  await seedLibrary(page);
  await expect.poll(() => listedTitles(page)).toEqual(TITLES);
  const before = await rowBoxes(page);

  await sampleRow(page, READING);
  await deleteWithMouse(page, READING);
  const samples = await rowSamples(page);
  expect(samples.removing).toBe(false);
  expect(
    Math.min(...samples.heights),
    `the row should never shrink before it is removed: ${samples.heights.join(", ")}`,
  ).toBeGreaterThanOrEqual(samples.full - 1);

  expect(await listedTitles(page)).toEqual([WELCOME, WEEKLY, IDEAS]);
  expectClosedGap(before, await rowBoxes(page));
  await expect(sidebarButton(page, IDEAS)).toBeFocused();
  await expect.poll(() => readLibraryFile(page, `${READING}.md`)).toBeNull();

  await page.reload();
  await expect.poll(() => listedTitles(page)).toEqual([WELCOME, WEEKLY, IDEAS]);
});
