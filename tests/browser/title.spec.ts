import type { Page } from "@playwright/test";
import { test, expect, seedLibrary } from "./fixtures";
import { listFiles, readCatalog, readFile } from "./opfs";

const titleButton = (page: Page, name: string) =>
  page.getByRole("button", { name: `Document title: ${name}. Click to rename`, exact: true });

const documentIdFrom = (url: string) => /#\/d\/[a-z0-9-]*-([a-z0-9]{6})(?:\/|$)/.exec(url)![1];

test("a new document takes its title from the first line, keeps it across reload, and never sends it anywhere", async ({
  page,
  requests,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedLibrary(page);
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await expect(editor).toContainText("# Welcome to emdy");
  await page.getByRole("button", { name: "New document", exact: true }).click();
  await expect(editor).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Document title", exact: true })).toHaveCount(0);
  await expect(titleButton(page, "Untitled")).toBeVisible();
  await expect.poll(() => listFiles(page)).toContain("Untitled.md");

  await page.keyboard.type("# Zanzibar itinerary");
  await expect(titleButton(page, "Zanzibar itinerary")).toHaveAttribute(
    "title",
    "Title follows the first line. Click to rename",
  );
  const sidebar = page.getByRole("list", { name: "Documents", exact: true });
  await expect(
    sidebar.getByRole("button", { name: "Zanzibar itinerary", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page).toHaveURL(/\/#\/d\/zanzibar-itinerary-[a-z0-9]{6}(?:\/[a-z0-9-]+)?$/);
  await expect(page).toHaveTitle("Zanzibar itinerary · emdy.md");
  const id = documentIdFrom(page.url());

  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Day one: Stone Town.");
  await expect
    .poll(() => readFile(page, "Zanzibar itinerary.md"))
    .toBe("# Zanzibar itinerary\n\nDay one: Stone Town.");
  await expect.poll(() => readFile(page, "Untitled.md")).toBeNull();
  await expect.poll(() => readCatalog(page)).toContain(`"id": "${id}"`);
  await expect.poll(() => readCatalog(page)).toContain('"file": "Zanzibar itinerary.md"');

  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/#/d/zanzibar-itinerary-${id}(?:/[a-z0-9-]+)?$`));
  await expect(titleButton(page, "Zanzibar itinerary")).toBeVisible();
  await expect(page).toHaveTitle("Zanzibar itinerary · emdy.md");
  await expect(
    sidebar.getByRole("button", { name: "Zanzibar itinerary", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(editor).toContainText("Day one: Stone Town.");

  await editor.press("ControlOrMeta+Home");
  await page.keyboard.press("End");
  await page.keyboard.type(" and Pemba");
  await expect(titleButton(page, "Zanzibar itinerary and Pemba")).toBeVisible();
  await expect(page).toHaveTitle("Zanzibar itinerary and Pemba · emdy.md");
  await expect(page).toHaveURL(
    new RegExp(`/#/d/zanzibar-itinerary-and-pemba-${id}(?:/[a-z0-9-]+)?$`),
  );
  await expect
    .poll(() => readFile(page, "Zanzibar itinerary and Pemba.md"))
    .toBe("# Zanzibar itinerary and Pemba\n\nDay one: Stone Town.");
  await expect.poll(() => readFile(page, "Zanzibar itinerary.md")).toBeNull();
  await expect.poll(() => readCatalog(page)).toContain(`"id": "${id}"`);
  await expect(
    sidebar.getByRole("button", { name: "Zanzibar itinerary", exact: true }),
  ).toHaveCount(0);

  await page.reload();
  await expect(page).toHaveURL(
    new RegExp(`/#/d/zanzibar-itinerary-and-pemba-${id}(?:/[a-z0-9-]+)?$`),
  );
  await expect(titleButton(page, "Zanzibar itinerary and Pemba")).toBeVisible();
  await expect(page).toHaveTitle("Zanzibar itinerary and Pemba · emdy.md");
  await sidebar.getByRole("button", { name: "Welcome to emdy", exact: true }).click();
  await expect(page).toHaveTitle("Welcome to emdy · emdy.md");

  const leaks = requests.filter((request) =>
    ["zanzibar", "pemba", "stone town", id].some((secret) =>
      `${request.url} ${request.referer ?? ""}`.toLowerCase().includes(secret),
    ),
  );
  expect(leaks, "a derived title must never reach a request line or Referer").toEqual([]);
  const navigations = requests.filter((request) => request.resourceType === "document");
  expect(new Set(navigations.map((request) => request.url))).toEqual(
    new Set([new URL("/", page.url()).href]),
  );
});

test("a new document created in Read-only preview opens in Raw Markdown with the caret in the editor", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedLibrary(page);
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  const preview = page.getByRole("document", { name: "Preview", exact: true });
  await expect(editor).toContainText("# Welcome to emdy");
  await page.keyboard.press("ControlOrMeta+3");
  await expect(preview).toBeVisible();
  await expect(editor).toHaveCount(0);

  await page.getByRole("button", { name: "New document", exact: true }).click();
  await expect(preview).toHaveCount(0);
  await expect(editor).toBeVisible();
  await expect(editor).toBeFocused();
  await page.keyboard.type("# Written straight away");
  await expect(titleButton(page, "Written straight away")).toBeVisible();

  await page.reload();
  await expect(editor).toContainText("# Written straight away");
  await expect(preview).toHaveCount(0);
});

test("a new document puts the caret in the editor and a plain first line becomes its title", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedLibrary(page);
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await expect(editor).toContainText("# Welcome to emdy");
  await page.getByRole("button", { name: "New document", exact: true }).click();

  await expect(editor).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Document title", exact: true })).toHaveCount(0);
  await page.keyboard.type("Harbour walk from the lighthouse");
  await expect(editor).toHaveText("Harbour walk from the lighthouse");
  await expect(titleButton(page, "Harbour walk from the lighthouse")).toHaveAttribute(
    "title",
    "Title follows the first line. Click to rename",
  );
  await expect(page).toHaveURL(
    /\/#\/d\/harbour-walk-from-the-lighthouse-[a-z0-9]{6}(?:\/[a-z0-9-]+)?$/,
  );
  const url = page.url();
  await expect
    .poll(() => readFile(page, "Harbour walk from the lighthouse.md"))
    .toBe("Harbour walk from the lighthouse");

  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(titleButton(page, "Harbour walk from the lighthouse")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Document title", exact: true })).toHaveCount(0);
  await expect(editor).toHaveText("Harbour walk from the lighthouse");
  await editor.press("ControlOrMeta+End");
  await page.keyboard.type(" to the pier");
  await expect(titleButton(page, "Harbour walk from the lighthouse to the pier")).toBeVisible();
});

test("a title chosen by hand stays put through edits and reloads until it is cleared", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedLibrary(page);
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await expect(editor).toBeVisible();
  await page.getByRole("button", { name: "New document", exact: true }).click();
  await editor.click();
  await page.keyboard.type("# Draft heading");
  await expect(titleButton(page, "Draft heading")).toBeVisible();
  const id = documentIdFrom(page.url());

  await titleButton(page, "Draft heading").click();
  const titleField = page.getByRole("textbox", { name: "Document title", exact: true });
  await expect(titleField).toHaveAttribute("placeholder", "Blank uses the first line");
  await titleField.fill("Pinned name");
  await titleField.press("Enter");
  await expect(titleButton(page, "Pinned name")).toHaveAttribute("title", "Rename document");

  await editor.press("ControlOrMeta+Home");
  await page.keyboard.press("End");
  await page.keyboard.type(" revised");
  await expect.poll(() => readFile(page, "Pinned name.md")).toBe("# Draft heading revised");
  await expect(titleButton(page, "Pinned name")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/#/d/pinned-name-${id}(?:/[a-z0-9-]+)?$`));

  await page.reload();
  await expect(titleButton(page, "Pinned name")).toBeVisible();
  await editor.press("ControlOrMeta+Home");
  await page.keyboard.press("End");
  await page.keyboard.type(" again");
  await expect.poll(() => readFile(page, "Pinned name.md")).toBe("# Draft heading revised again");
  await expect(titleButton(page, "Pinned name")).toBeVisible();

  await titleButton(page, "Pinned name").click();
  await titleField.fill("");
  await titleField.press("Enter");
  await expect(titleButton(page, "Draft heading revised again")).toHaveAttribute(
    "title",
    "Title follows the first line. Click to rename",
  );
  await expect(page).toHaveURL(
    new RegExp(`/#/d/draft-heading-revised-again-${id}(?:/[a-z0-9-]+)?$`),
  );
  await expect
    .poll(() => readFile(page, "Draft heading revised again.md"))
    .toBe("# Draft heading revised again");
  await expect.poll(() => readFile(page, "Pinned name.md")).toBeNull();

  await editor.press("ControlOrMeta+Home");
  await page.keyboard.press("End");
  await page.keyboard.type("!");
  await expect(titleButton(page, "Draft heading revised again!")).toBeVisible();
});

test("a heading typed in one document retitles only that document when switching before the save", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedLibrary(page);
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await expect(editor).toContainText("# Welcome to emdy");
  await page.getByRole("button", { name: "New document", exact: true }).click();
  await expect(titleButton(page, "Untitled")).toBeVisible();
  await page.clock.pauseAt(new Date("2026-01-01T01:00:00Z"));

  await editor.click();
  await page.keyboard.type("# Alpha notes");
  const sidebar = page.getByRole("list", { name: "Documents", exact: true });
  await sidebar.getByRole("button", { name: "Reading list", exact: true }).click();
  await expect(editor).toContainText("# Reading list");
  await page.clock.runFor(1500);

  await expect(titleButton(page, "Reading list")).toBeVisible();
  await expect(editor).not.toContainText("Alpha notes");
  await expect(sidebar.getByRole("button", { name: "Alpha notes", exact: true })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Untitled", exact: true })).toHaveCount(0);
  await expect.poll(() => readFile(page, "Alpha notes.md")).toBe("# Alpha notes");
  await expect.poll(() => readFile(page, "Reading list.md")).toContain("# Reading list");

  await sidebar.getByRole("button", { name: "Alpha notes", exact: true }).click();
  await expect(editor).toHaveText("# Alpha notes");
  await expect(titleButton(page, "Alpha notes")).toBeVisible();
  await page.clock.resume();
});

test("typing a heading in Editable preview retitles the document", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedLibrary(page);
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await expect(editor).toBeVisible();
  await page.getByRole("button", { name: "New document", exact: true }).click();
  await editor.click();
  await page.keyboard.press("ControlOrMeta+2");
  await editor.click();
  await page.keyboard.type("# Preview typed title");
  await expect(titleButton(page, "Preview typed title")).toBeVisible();
  await expect(page).toHaveURL(/\/#\/d\/preview-typed-title-[a-z0-9]{6}(?:\/[a-z0-9-]+)?$/);
  await expect.poll(() => readFile(page, "Preview typed title.md")).toBe("# Preview typed title");
});

test("a document whose file name differs from its first line is never renamed by editing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedLibrary(page);
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await expect(editor).toContainText("# Welcome to emdy");
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle("notes from elsewhere.md", { create: true });
    const writable = await handle.createWritable();
    await writable.write("# Quarterly plan\n\nWritten by another program.");
    await writable.close();
  });
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const sidebar = page.getByRole("list", { name: "Documents", exact: true });
  await sidebar.getByRole("button", { name: "notes from elsewhere", exact: true }).click();
  await expect(editor).toContainText("Written by another program.");
  await expect(titleButton(page, "notes from elsewhere")).toHaveAttribute(
    "title",
    "Rename document",
  );
  await editor.press("ControlOrMeta+Home");
  await page.keyboard.press("End");
  await page.keyboard.type(" for Q4");
  await expect
    .poll(() => readFile(page, "notes from elsewhere.md"))
    .toBe("# Quarterly plan for Q4\n\nWritten by another program.");
  await expect(titleButton(page, "notes from elsewhere")).toBeVisible();
  await expect.poll(() => listFiles(page)).not.toContain("Quarterly plan for Q4.md");
});

test("the last-edited label sits beside a full title and gives way when the toolbar is cramped", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedLibrary(page);
  const title = titleButton(page, "Welcome to emdy");
  const edited = page.getByTestId("last-edited");
  await expect(edited).toBeVisible();
  await expect(edited).toHaveText("Edited just now");
  await expect(edited).toHaveAttribute("title", /^Last edited /);
  const titleBox = (await title.boundingBox())!;
  const editedBox = (await edited.boundingBox())!;
  expect(editedBox.x).toBeGreaterThanOrEqual(titleBox.x + titleBox.width);
  expect(
    Math.abs(editedBox.y + editedBox.height / 2 - (titleBox.y + titleBox.height / 2)),
  ).toBeLessThan(2);
  expect(await title.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

  await page.getByRole("button", { name: "New document", exact: true }).click();
  await page.keyboard.type("# A considerably longer document title that fills the toolbar");
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(edited).toBeHidden();
  const long = page.getByRole("button", { name: /^Document title: A considerably longer/ });
  const toolbar = page.getByRole("banner", { name: "Toolbar" });
  const view = toolbar.getByRole("button", { name: /^View: / });
  const longBox = (await long.boundingBox())!;
  expect(longBox.x + longBox.width).toBeLessThanOrEqual((await view.boundingBox())!.x);
});

test.describe("what a crawler sees on a fresh visit", () => {
  const HOME_TITLE = "emdy.md · Private Markdown editor that runs in your browser";

  test("the rendered welcome page keeps the descriptive title and a single top-level heading", async ({
    page,
    requests,
  }) => {
    await page.goto("/");
    const welcome = page.getByTestId("empty-library");
    await expect(
      welcome.getByRole("heading", { level: 1, name: "Welcome to emdy", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveTitle(HOME_TITLE);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.locator("noscript")).toBeHidden();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://emdy.md/");
    expect(requests.filter((request) => request.url.includes("og-image"))).toEqual([]);
  });

  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    test("the page still names and describes the app", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveTitle(HOME_TITLE);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "emdy.md: a private Markdown editor that runs in your browser",
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByRole("listitem").first()).toBeVisible();
    });
  });
});
