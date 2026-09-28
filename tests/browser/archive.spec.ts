import { readFile } from "node:fs/promises";
import { archiveOf, test, expect, readLibraryFile, seedLibrary, TEST_DOCUMENTS } from "./fixtures";

const rootOf = (url: string) => new URL("/", url).href;

test("a fresh library shows the welcome sheet until the first document, and again after the last is deleted", async ({
  page,
  requests,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/");
  const welcome = page.getByTestId("empty-library");
  await expect(
    welcome.getByRole("heading", { name: "Welcome to emdy", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(rootOf(page.url()));
  const list = page.getByRole("list", { name: "Documents", exact: true });
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await expect(list.locator("[data-sidebar=menu-button]")).toHaveCount(0);
  await expect(editor).toHaveCount(0);

  await welcome.getByRole("button", { name: "New document", exact: true }).click();
  await expect(editor).toBeVisible();
  await expect(editor).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Document title", exact: true })).toHaveCount(0);
  await expect(welcome).toHaveCount(0);
  await expect(page).toHaveURL(/#\/d\/untitled-[a-z0-9]{6}$/);
  await page.keyboard.type("# First words");
  await expect(editor).toContainText("# First words");
  await expect.poll(() => readLibraryFile(page, "First words.md")).toBe("# First words");

  await page.reload();
  await expect(editor).toContainText("# First words");
  await expect(welcome).toHaveCount(0);

  await list.getByRole("button", { name: "Delete First words", exact: true }).click();
  await page
    .getByRole("group", { name: /First words/ })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(welcome).toBeVisible();
  await expect(editor).toHaveCount(0);
  await expect(page).toHaveURL(rootOf(page.url()));
  await expect.poll(() => readLibraryFile(page, "First words.md")).toBeNull();

  await page.reload();
  await expect(welcome).toBeVisible();
  await expect(list.locator("[data-sidebar=menu-button]")).toHaveCount(0);
  const navigations = requests.filter((request) => request.resourceType === "document");
  expect(new Set(navigations.map((request) => request.url))).toEqual(new Set([rootOf(page.url())]));
});

test("export downloads every document as JSON and import adds only what is missing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const seeds = TEST_DOCUMENTS.slice(0, 2);
  await seedLibrary(page, seeds);
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  const sidebar = page.getByRole("complementary", { name: "Sidebar", exact: true });
  const list = page.getByRole("list", { name: "Documents", exact: true });

  const settings = page.getByTestId("settings-page");
  const back = page.getByRole("button", { name: "Back to document", exact: true });

  await sidebar.getByRole("button", { name: "Settings", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    settings.getByRole("button", { name: "Export all documents", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^emdy-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  const archive = JSON.parse(await readFile(path, "utf8")) as {
    format: string;
    version: number;
    exportedAt: number;
    documents: { id: string; title: string; text: string; created: number; modified: number }[];
  };
  expect(archive.format).toBe("emdy-library");
  expect(archive.version).toBe(1);
  expect(archive.exportedAt).toBeGreaterThan(0);
  expect(archive.documents.map((doc) => [doc.id, doc.title, doc.text])).toEqual(
    seeds.map((doc) => [doc.id, doc.title, doc.text]),
  );
  for (const doc of archive.documents) {
    expect(doc.created).toBeGreaterThan(0);
    expect(doc.modified).toBeGreaterThanOrEqual(doc.created);
  }

  await back.click();
  await editor.press("ControlOrMeta+A");
  await page.keyboard.type("# Welcome to emdy\n\nChanged after the export.");
  await expect
    .poll(() => readLibraryFile(page, "Welcome to emdy.md"))
    .toBe("# Welcome to emdy\n\nChanged after the export.");

  await sidebar.getByRole("button", { name: "Settings", exact: true }).click();
  await settings.getByLabel("Import documents file").setInputFiles(path);
  await expect(settings.getByRole("status")).toHaveText("Imported 1 document, 1 already here.");
  await expect(list.getByRole("button", { name: "Welcome to emdy", exact: true })).toHaveCount(2);
  await expect(
    list.getByRole("button", { name: "Weekly sync — product", exact: true }),
  ).toHaveCount(1);
  await back.click();
  await expect(editor).toContainText("Changed after the export.");
  await expect(page).toHaveURL(/#\/d\/welcome-to-emdy-welcom\/welcome-to-emdy$/);
  await expect.poll(() => readLibraryFile(page, "Welcome to emdy 2.md")).toBe(seeds[0].text);
  await expect
    .poll(() => readLibraryFile(page, "Welcome to emdy.md"))
    .toBe("# Welcome to emdy\n\nChanged after the export.");

  await page.reload();
  await expect(list.getByRole("button", { name: "Welcome to emdy", exact: true })).toHaveCount(2);
  await expect(editor).toContainText("Changed after the export.");
  await list
    .getByRole("button", { name: "Welcome to emdy", exact: true })
    .and(page.locator(':not([aria-current="page"])'))
    .click();
  await expect(editor).toContainText("# Welcome to emdy");
  await expect(page).toHaveURL(/#\/d\/welcome-to-emdy-(?!welcom)[a-z0-9]{6}/);
  await editor.press("ControlOrMeta+End");
  await page.keyboard.type(" Editable copy.");
  await expect
    .poll(() => readLibraryFile(page, "Welcome to emdy 2.md"))
    .toContain("Editable copy.");
});

test("a file that is not an emdy export is rejected and changes nothing", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedLibrary(page, TEST_DOCUMENTS.slice(0, 1));
  const list = page.getByRole("list", { name: "Documents", exact: true });
  const settings = page.getByTestId("settings-page");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    settings.getByRole("button", { name: "Import documents…", exact: true }),
  ).toBeVisible();
  await expect(settings.getByTestId("import-status")).toHaveCount(0);
  await settings.getByLabel("Import documents file").setInputFiles({
    name: "notes.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"documents":[{"title":"Sneaky"}]}'),
  });
  await expect(settings.getByRole("alert")).toHaveText(
    "Couldn’t import documents. This file isn’t an emdy export.",
  );
  await expect(list.locator("[data-sidebar=menu-button]")).toHaveCount(1);
  await expect(list.getByRole("button", { name: "Welcome to emdy", exact: true })).toBeVisible();
  await settings.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(settings.getByRole("alert")).toHaveCount(0);
  await expect.poll(() => readLibraryFile(page, "Sneaky.md")).toBeNull();
});

test("imported documents keep their last-written date and regroup once edited here", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedLibrary(page, TEST_DOCUMENTS.slice(0, 1));
  const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByTestId("settings-page")
    .getByLabel("Import documents file")
    .setInputFiles({
      name: "old.json",
      mimeType: "application/json",
      buffer: Buffer.from(archiveOf([TEST_DOCUMENTS[2]], tenDaysAgo)),
    });
  const lastMonth = page.getByRole("list", { name: "Last 30 days", exact: true });
  await expect(lastMonth.getByRole("button", { name: "Reading list", exact: true })).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Today", exact: true }).getByRole("button", {
      name: "Welcome to emdy",
      exact: true,
    }),
  ).toBeVisible();

  await page.reload();
  await expect(lastMonth.getByRole("button", { name: "Reading list", exact: true })).toBeVisible();
  await lastMonth.getByRole("button", { name: "Reading list", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await expect(editor).toContainText("# Reading list");
  await editor.press("ControlOrMeta+End");
  await page.keyboard.type(" Edited today.");
  await expect(
    page
      .getByRole("list", { name: "Today", exact: true })
      .getByRole("button", { name: "Reading list", exact: true }),
  ).toBeVisible();
  await expect(lastMonth).toHaveCount(0);
});
