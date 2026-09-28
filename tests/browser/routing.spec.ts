import { test, expect, seedLibrary } from "./fixtures";

const SECRETS = ["confidential", "merger", "memo", "deal", "terms", "payout", "schedule"] as const;

test("document titles, ids, and headings never leave the address bar", async ({
  page,
  requests,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedLibrary(page);
  await page.getByRole("button", { name: "New document", exact: true }).click();
  await page
    .getByRole("button", { name: "Document title: Untitled. Click to rename", exact: true })
    .click();
  const titleField = page.getByRole("textbox", { name: "Document title", exact: true });
  await titleField.fill("Confidential Merger Memo");
  await titleField.press("Enter");

  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  const filler = "Paragraph with enough text to push the next heading past the fold.\n\n".repeat(
    24,
  );
  await editor.fill(
    `## Deal Terms\n\n![Local logo](/logo.svg)\n\n${filler}## Payout Schedule\n\n${filler}`,
  );
  await editor.press("ControlOrMeta+Home");
  await page.keyboard.press("ControlOrMeta+2");
  await expect(page.getByRole("img", { name: "Local logo", exact: true })).toBeVisible();

  const outline = page.getByRole("navigation", { name: "Outline", exact: true });
  await outline.getByRole("button", { name: "Payout Schedule", exact: true }).click();
  await expect(page).toHaveURL(/#\/d\/confidential-merger-memo-[a-z0-9]{6}\/payout-schedule$/);

  const location = await page.evaluate(() => ({
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
  }));
  expect(location.pathname, "the host must only ever be asked for the app shell").toBe("/");
  expect(location.search, "document details must not be encoded in the query string").toBe("");
  expect(location.hash).toMatch(/^#\/d\/confidential-merger-memo-[a-z0-9]{6}\/payout-schedule$/);

  const documentId = location.hash.slice("#/d/confidential-merger-memo-".length).split("/")[0];
  await page.reload();
  await expect(editor).toBeVisible();

  const leaks = requests.filter((request) =>
    [...SECRETS, documentId].some((secret) =>
      `${request.url} ${request.referer ?? ""}`.toLowerCase().includes(secret),
    ),
  );
  expect(leaks, "no request line or Referer header may carry document details").toEqual([]);

  const navigations = requests.filter((request) => request.resourceType === "document");
  expect(navigations.length).toBeGreaterThanOrEqual(2);
  expect(new Set(navigations.map((request) => request.url))).toEqual(
    new Set([new URL("/", page.url()).href]),
  );
  expect(requests.every((request) => new URL(request.url).search === "")).toBe(true);
});

test("outline navigation scrolls read-only preview geometry and survives history back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedLibrary(page);
  await page.getByRole("button", { name: "New document", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await editor.fill(
    Array.from(
      { length: 12 },
      (_, index) =>
        `## Chapter ${index + 1}\n\n${"Paragraph with enough text to scroll.\n\n".repeat(12)}`,
    ).join("\n"),
  );
  await editor.press("ControlOrMeta+Home");
  await page.keyboard.press("ControlOrMeta+3");

  const reader = page.getByRole("document", { name: "Preview", exact: true });
  await expect(reader).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Markdown editor", exact: true })).toHaveCount(0);

  const outline = page.getByRole("navigation", { name: "Outline", exact: true });
  const target = outline.getByRole("button", { name: "Chapter 10", exact: true });
  await target.click();
  await expect(reader.getByRole("heading", { name: "Chapter 10", exact: true })).toBeInViewport();
  await expect
    .poll(() => page.locator(".cm-scroller").evaluate((element) => element.scrollTop))
    .toBeGreaterThan(1000);
  await expect(page).toHaveURL(/#\/d\/chapter-1-[a-z0-9]{6}\/chapter-10$/);

  const readerURL = page.url();
  await page.getByRole("button", { name: "Reading list", exact: true }).click();
  await expect(reader.getByRole("heading", { name: "Reading list", exact: true })).toBeVisible();
  await expect
    .poll(() => page.locator(".cm-scroller").evaluate((element) => element.scrollTop))
    .toBe(0);

  await page.goBack();
  await expect(page).toHaveURL(readerURL);
  await expect(reader.getByRole("heading", { name: "Chapter 10", exact: true })).toBeInViewport();
  await expect
    .poll(() => page.locator(".cm-scroller").evaluate((element) => element.scrollTop))
    .toBeGreaterThan(1000);
  await expect(target).toHaveAttribute("aria-current", "location");
});

test("clicking a sidebar document leaves settings and keeps editing", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedLibrary(page);
  const settingsHeading = page.getByRole("heading", { name: "Settings", level: 1, exact: true });
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(settingsHeading).toBeVisible();
  await expect(page).toHaveURL(/#\/settings$/);
  const documentsList = page.getByRole("list", { name: "Documents", exact: true });
  await expect(documentsList.locator("[aria-current]")).toHaveCount(0);

  const readingList = documentsList.getByRole("button", { name: "Reading list", exact: true });
  await readingList.click();
  await expect(settingsHeading).toBeHidden();
  await expect(readingList).toHaveAttribute("aria-current", "page");
  await expect(page).toHaveURL(/#\/d\/reading-list-[a-z0-9]{6}(\/[a-z0-9-]+)?$/);
  await editor.press("ControlOrMeta+End");
  await page.keyboard.type(" Back from settings.");
  await expect(editor).toContainText("Back from settings.");

  await page.keyboard.press("ControlOrMeta+,");
  await expect(settingsHeading).toBeVisible();
  await expect(readingList).not.toHaveAttribute("aria-current", "page");
  await readingList.click();
  await expect(settingsHeading).toBeHidden();
  await expect(readingList).toHaveAttribute("aria-current", "page");
  await expect(editor).toContainText("Back from settings.");
});
