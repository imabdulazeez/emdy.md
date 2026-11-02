import type { Locator, Page } from "@playwright/test";
import { test, expect, readLibraryFile, seedLibrary } from "./fixtures";

const row = (page: Page, name: string) =>
  page
    .getByRole("list", { name: "Documents", exact: true })
    .getByRole("button", { name, exact: true });

const pane = (page: Page, title: string) =>
  page.getByRole("region", { name: `${title} pane`, exact: true });

const editorIn = (region: Locator) =>
  region.getByRole("textbox", { name: "Markdown editor", exact: true });

const editors = (page: Page) => page.getByRole("textbox", { name: "Markdown editor", exact: true });

async function expectSideBySide(page: Page, left: Locator, right: Locator) {
  const sheet = (await page.getByTestId("document-sheet").boundingBox())!;
  const a = (await left.boundingBox())!;
  const b = (await right.boundingBox())!;
  expect(a.width).toBeGreaterThan(300);
  expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(2);
  expect(a.x + a.width).toBeLessThanOrEqual(b.x + 1);
  expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(1);
  expect(a.x).toBeGreaterThanOrEqual(sheet.x - 1);
  expect(b.x + b.width).toBeLessThanOrEqual(sheet.x + sheet.width + 1);
}

test("a document opens beside another from the sidebar menu, edits stay apart, and the split survives a reload", async ({
  page,
  requests,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedLibrary(page);

  await row(page, "Welcome to emdy").click({ button: "right" });
  await expect(page.getByRole("menu", { name: "Welcome to emdy", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Open in split view", exact: true })).toHaveCount(
    0,
  );
  await page.keyboard.press("Escape");

  await row(page, "Reading list").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Open in split view", exact: true }).click();

  const left = pane(page, "Welcome to emdy");
  const right = pane(page, "Reading list");
  await expect(left).toBeVisible();
  await expect(right).toBeVisible();
  await expectSideBySide(page, left, right);
  await expect(editorIn(right)).toBeFocused();
  await expect(right).toHaveAttribute("data-pane-active", "true");
  await expect(page).toHaveURL(/#\/d\/reading-list-readng(\/|$)/);
  await expect(page.getByRole("button", { name: /^Document title: Reading list\./ })).toBeVisible();

  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\nWritten on the right.");
  await expect(editorIn(right)).toContainText("Written on the right.");

  await editorIn(left).click();
  await expect(left).toHaveAttribute("data-pane-active", "true");
  await expect(page).toHaveURL(/#\/d\/welcome-to-emdy-welcom(\/|$)/);
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\nWritten on the left.");
  await expect(editorIn(left)).toContainText("Written on the left.");
  await expect(editorIn(right)).not.toContainText("Written on the left.");
  await expect(editorIn(left)).not.toContainText("Written on the right.");

  await expect
    .poll(() => readLibraryFile(page, "Reading list.md"))
    .toContain("Written on the right.");
  await expect
    .poll(() => readLibraryFile(page, "Welcome to emdy.md"))
    .toContain("Written on the left.");

  await page.reload();
  await expect(left).toBeVisible();
  await expect(right).toBeVisible();
  await expectSideBySide(page, left, right);
  await expect(left).toHaveAttribute("data-pane-active", "true");
  await expect(page).toHaveURL(/#\/d\/welcome-to-emdy-welcom(\/|$)/);
  await expect(editorIn(left)).toContainText("Written on the left.");
  await expect(editorIn(right)).toContainText("Written on the right.");

  await editorIn(right).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" Still editable.");
  await expect(editorIn(right)).toContainText("Written on the right. Still editable.");
  await expect(page).toHaveURL(/#\/d\/reading-list-readng(\/|$)/);

  const navigations = requests.filter((request) => request.resourceType === "document");
  expect(new Set(navigations.map((request) => request.url))).toEqual(
    new Set([new URL("/", page.url()).href]),
  );
  const leaks = requests.filter((request) =>
    ["readng", "welcom", "reading-list", "written"].some((secret) =>
      `${request.url} ${request.referer ?? ""}`.toLowerCase().includes(secret),
    ),
  );
  expect(leaks).toEqual([]);
});

test("Cmd- or Ctrl-click opens a split that the keyboard switches and closes", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await seedLibrary(page);

  await row(page, "Project ideas").click({ modifiers: ["ControlOrMeta"] });
  const left = pane(page, "Welcome to emdy");
  const right = pane(page, "Project ideas");
  await expect(editorIn(right)).toBeFocused();
  await expectSideBySide(page, left, right);
  const entries = await page.evaluate(() => window.history.length);

  await page.keyboard.press("ControlOrMeta+Alt+s");
  await expect(editorIn(left)).toBeFocused();
  await expect(left).toHaveAttribute("data-pane-active", "true");
  await expect(page).toHaveURL(/#\/d\/welcome-to-emdy-welcom(\/|$)/);
  await expect(row(page, "Welcome to emdy")).toHaveAttribute("aria-current", "page");

  await page.keyboard.press("ControlOrMeta+Alt+s");
  await expect(editorIn(right)).toBeFocused();
  await expect(page).toHaveURL(/#\/d\/project-ideas-ideas0(\/|$)/);
  expect(await page.evaluate(() => window.history.length)).toBe(entries);

  await row(page, "Weekly sync — product").click();
  await expect(pane(page, "Weekly sync — product")).toHaveAttribute("data-pane-active", "true");
  await expect(left).toBeVisible();
  await expect(right).toHaveCount(0);
  await expect(editorIn(pane(page, "Weekly sync — product"))).toBeFocused();

  await page.keyboard.press("ControlOrMeta+Alt+Shift+s");
  await expect(editors(page)).toHaveCount(1);
  await expect(left).toHaveCount(0);
  await expect(page).toHaveURL(/#\/d\/weekly-sync-product-weekly(\/|$)/);
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" Typed after closing.");
  await expect(editors(page)).toContainText("Typed after closing.");

  await row(page, "Reading list").click({ modifiers: ["ControlOrMeta"] });
  await page.getByRole("button", { name: "Close Weekly sync — product pane", exact: true }).click();
  await expect(editors(page)).toHaveCount(1);
  await expect(editors(page)).toBeFocused();
  await expect(editors(page)).toContainText("# Reading list");
  const sheet = (await page.getByTestId("document-sheet").boundingBox())!;
  const lone = (await page.getByTestId("editor").boundingBox())!;
  expect(lone.width).toBeGreaterThan(sheet.width / 2);
});

test("each pane keeps its own undo history", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await seedLibrary(page);
  await row(page, "Reading list").click({ modifiers: ["ControlOrMeta"] });
  const left = editorIn(pane(page, "Welcome to emdy"));
  const right = editorIn(pane(page, "Reading list"));

  await left.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" Left words");
  await right.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" Right words");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(right).not.toContainText("Right words");
  await expect(left).toContainText("Left words");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(left).toContainText("Left words");

  await left.click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(left).not.toContainText("Left words");
  await expect(right).not.toContainText("Right words");
});

test("an edit in one pane is not lost or misplaced when focus moves before the debounce", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await seedLibrary(page);
  await row(page, "Reading list").click({ modifiers: ["ControlOrMeta"] });
  const left = editorIn(pane(page, "Welcome to emdy"));
  const right = editorIn(pane(page, "Reading list"));
  await expect(right).toBeFocused();

  const now = Date.now();
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now + 1000);

  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" Pending right.");
  await left.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" Pending left.");
  await page.clock.runFor(1500);

  await expect.poll(() => readLibraryFile(page, "Reading list.md")).toContain("Pending right.");
  await expect.poll(() => readLibraryFile(page, "Welcome to emdy.md")).toContain("Pending left.");
  expect(await readLibraryFile(page, "Reading list.md")).not.toContain("Pending left.");
  expect(await readLibraryFile(page, "Welcome to emdy.md")).not.toContain("Pending right.");
  await expect(right).toContainText("Pending right.");
  await expect(left).toContainText("Pending left.");
});

test("an edit made in a split pane is still there when another pane reopens the document", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedLibrary(page);

  await row(page, "Welcome to emdy").click();
  await expect(editors(page)).toContainText("Welcome to emdy");
  await row(page, "Reading list").click();
  await expect(editors(page)).toContainText("Reading list");

  await row(page, "Welcome to emdy").click({ modifiers: ["ControlOrMeta"] });
  const split = pane(page, "Welcome to emdy");
  await expect(split).toBeVisible();
  await editorIn(split).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" typed in the split pane");

  await page.getByRole("button", { name: "Close Welcome to emdy pane", exact: true }).click();
  await expect(split).toHaveCount(0);
  await row(page, "Welcome to emdy").click();
  await expect(editors(page)).toHaveCount(1);
  await expect(editors(page)).toContainText("typed in the split pane");

  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" and kept");
  await expect
    .poll(() => readLibraryFile(page, "Welcome to emdy.md"))
    .toContain("typed in the split pane and kept");
});

test("a split opened in one tab leaves another tab on the same library alone", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedLibrary(page);
  await row(page, "Welcome to emdy").click();
  await expect(editors(page)).toHaveCount(1);

  const other = await context.newPage();
  await other.setViewportSize({ width: 1600, height: 900 });
  await other.goto(page.url());
  await expect(editors(other)).toHaveCount(1);
  const heard = page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.addEventListener("storage", (event) => {
          if (event.key === "emdy:workspace:split") resolve();
        });
      }),
  );
  await row(other, "Reading list").click({ modifiers: ["ControlOrMeta"] });
  await expect(pane(other, "Welcome to emdy")).toBeVisible();
  await expect(pane(other, "Reading list")).toBeVisible();

  await expect(editors(other)).toHaveCount(2);
  await heard;
  await expect(editors(page)).toHaveCount(1);
  await expect(pane(page, "Welcome to emdy")).toHaveCount(0);

  await other.getByRole("button", { name: "Close Reading list pane", exact: true }).click();
  await expect(editors(other)).toHaveCount(1);
  await other.close();
  await expect(editors(page)).toHaveCount(1);
});

test("a narrow window shows only the focused pane", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await seedLibrary(page);
  await row(page, "Reading list").click({ modifiers: ["ControlOrMeta"] });
  await expect(editors(page)).toHaveCount(2);

  await page.setViewportSize({ width: 600, height: 800 });
  await expect(pane(page, "Welcome to emdy")).toBeHidden();
  const focused = pane(page, "Reading list");
  await expect(focused).toBeVisible();
  const sheet = (await page.getByTestId("document-sheet").boundingBox())!;
  const box = (await focused.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(sheet.width - 2);
  await editorIn(focused).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" On a phone.");
  await expect(editorIn(focused)).toContainText("On a phone.");
});

test("the divider resizes the panes by mouse and keyboard and keeps the width after a reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await seedLibrary(page);
  await row(page, "Reading list").click({ modifiers: ["ControlOrMeta"] });
  const left = pane(page, "Welcome to emdy");
  const right = pane(page, "Reading list");
  const divider = page.getByRole("separator", { name: "Resize panes", exact: true });
  await expect(divider).toBeVisible();
  await expect(divider).toHaveAttribute("aria-valuenow", "50");

  const handle = (await divider.boundingBox())!;
  const leftBox = (await left.boundingBox())!;
  const rightBox = (await right.boundingBox())!;
  expect(handle.x).toBeGreaterThanOrEqual(leftBox.x + leftBox.width - 1);
  expect(handle.x + handle.width).toBeLessThanOrEqual(rightBox.x + 1);

  const total = leftBox.width + handle.width + rightBox.width;
  const centre = handle.y + handle.height / 2;
  await page.mouse.move(handle.x + handle.width / 2, centre);
  await page.mouse.down();
  await page.mouse.move(leftBox.x + total * 0.3, centre, { steps: 8 });
  await page.mouse.up();
  await expect(divider).toHaveAttribute("aria-valuenow", "30");
  await expect.poll(async () => (await left.boundingBox())!.width).toBeLessThan(total * 0.32);
  await expect.poll(async () => (await right.boundingBox())!.width).toBeGreaterThan(total * 0.68);
  await expect(divider).not.toHaveAttribute("data-dragging");
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? "")).toBe("");

  await page.mouse.move(leftBox.x + 10, centre);
  await page.mouse.down();
  await page.mouse.move(leftBox.x + 12, centre);
  await page.mouse.up();
  await expect(divider).toHaveAttribute("aria-valuenow", "30");

  const dragged = (await divider.boundingBox())!;
  await page.mouse.move(dragged.x + dragged.width / 2, centre);
  await page.mouse.down();
  await page.mouse.move(leftBox.x - 400, centre, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await left.boundingBox())!.width).toBeGreaterThanOrEqual(279);
  await expect(left).toBeVisible();

  await divider.focus();
  await page.keyboard.press("End");
  await expect.poll(async () => (await right.boundingBox())!.width).toBeGreaterThanOrEqual(279);
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const share = Number(await divider.getAttribute("aria-valuenow"));
  expect(share).toBeGreaterThan(20);
  expect(share).toBeLessThan(50);

  await page.reload();
  await expect(divider).toHaveAttribute("aria-valuenow", String(share));
  const reloaded = (await left.boundingBox())!.width;
  const reloadedTotal = reloaded + (await right.boundingBox())!.width;
  expect(Math.abs(reloaded / reloadedTotal - share / 100)).toBeLessThan(0.02);
  await editorIn(left).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" Still editable.");
  await expect(editorIn(left)).toContainText("Still editable.");

  await divider.dblclick();
  await expect(divider).toHaveAttribute("aria-valuenow", "50");
  await expect
    .poll(async () => {
      const a = (await left.boundingBox())!.width;
      const b = (await right.boundingBox())!.width;
      return Math.abs(a - b);
    })
    .toBeLessThanOrEqual(2);

  await page.getByRole("button", { name: "Close Welcome to emdy pane", exact: true }).click();
  await expect(divider).toHaveCount(0);
});

test("focus mode keeps the split's pane controls apart and exits from the right pane", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await seedLibrary(page);

  await row(page, "Project ideas").click({ modifiers: ["ControlOrMeta"] });
  const left = pane(page, "Welcome to emdy");
  const right = pane(page, "Project ideas");
  await expect(editorIn(right)).toBeFocused();

  await page.keyboard.press("ControlOrMeta+Shift+KeyF");
  const exit = page.getByRole("button", { name: "Exit focus mode", exact: true });
  await expect(exit).toHaveCount(1);
  await expect(right.getByRole("button", { name: "Exit focus mode", exact: true })).toBeVisible();
  await expectSideBySide(page, left, right);

  const close = (await right
    .getByRole("button", { name: "Close Project ideas pane", exact: true })
    .boundingBox())!;
  const exitBox = (await exit.boundingBox())!;
  const header = (await right.locator("header").boundingBox())!;
  expect(close.x + close.width).toBeLessThanOrEqual(exitBox.x);
  expect(exitBox.y).toBeGreaterThanOrEqual(header.y);
  expect(exitBox.y + exitBox.height).toBeLessThanOrEqual(header.y + header.height);
  const sheet = (await page.getByTestId("document-sheet").boundingBox())!;
  expect(exitBox.x + exitBox.width).toBeLessThanOrEqual(sheet.x + sheet.width);

  await exit.click();
  await expect(exit).toHaveCount(0);
  await expect(page.getByRole("banner", { name: "Toolbar" })).toBeVisible();
  await expectSideBySide(page, left, right);
});
