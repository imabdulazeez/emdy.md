import type { Locator } from "@playwright/test";
import { test, expect, seedLibrary } from "./fixtures";

declare global {
  interface Window {
    __firstTheme?: string;
    __firstFont?: string;
  }
}

const offsetWithin = (target: Locator, scroller: Locator) =>
  Promise.all([target.boundingBox(), scroller.boundingBox()]).then(([a, b]) => a!.y - b!.y);

test("theme, view, sidebar, and last document survive a fresh visit", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    new MutationObserver(() => {
      window.__firstTheme ??= document.documentElement?.dataset.theme;
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-theme"] });
  });
  await seedLibrary(page);
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "light");

  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Reading list", exact: true }).click();
  await expect(page).toHaveURL(/#\/d\/reading-list-readng/);
  await page.keyboard.press("ControlOrMeta+3");
  await expect(page.getByRole("document", { name: "Preview", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hide sidebar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Show sidebar", exact: true })).toBeVisible();

  await page.goto("/");
  await expect(html).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(() => window.__firstTheme),
    "the first-paint script must apply the stored theme before the app boots",
  ).toBe("dark");
  await expect(page.getByRole("main", { name: "Document", exact: true })).toHaveAttribute(
    "data-layout",
    "reader",
  );
  await expect(page.getByRole("button", { name: "Show sidebar", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#\/d\/reading-list-readng/);
  await expect(
    page
      .getByRole("document", { name: "Preview", exact: true })
      .getByRole("heading", { name: "Reading list", exact: true }),
  ).toBeVisible();
});

test("the cursor and reading spot of a document survive a reload", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedLibrary(page);
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await expect(editor).toContainText("# Welcome to emdy");
  const outline = page.getByRole("navigation", { name: "Outline", exact: true });
  await outline.getByRole("button", { name: "Footnotes", exact: true }).click();
  const heading = editor.locator(".cm-line").filter({ hasText: /^## Footnotes$/ });
  await expect(heading).toBeInViewport();
  const scroller = page.locator(".cm-scroller");
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(500);
  await editor.press("End");
  await expect(page).toHaveURL(/#\/d\/welcome-to-emdy-welcom\/footnotes$/);
  const before = await offsetWithin(heading, scroller);

  await page.reload();
  await expect(editor).toContainText("## Footnotes");
  await expect(heading).toBeInViewport();
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(500);
  await expect
    .poll(async () => Math.abs((await offsetWithin(heading, scroller)) - before))
    .toBeLessThan(4);
  await expect(page).toHaveURL(/#\/d\/welcome-to-emdy-welcom\/footnotes$/);
  await expect(outline.getByRole("button", { name: "Footnotes", exact: true })).toHaveAttribute(
    "aria-current",
    "location",
  );
  await editor.focus();
  await page.keyboard.type(" marker");
  await expect(
    editor.locator(".cm-line").filter({ hasText: /^## Footnotes marker$/ }),
  ).toBeVisible();
});

test("the read-only preview returns to its reading spot after a reload", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedLibrary(page);
  await page.keyboard.press("ControlOrMeta+3");
  const reader = page.getByRole("document", { name: "Preview", exact: true });
  await expect(reader).toBeVisible();
  const outline = page.getByRole("navigation", { name: "Outline", exact: true });
  await outline.getByRole("button", { name: "Footnotes", exact: true }).click();
  const heading = reader.getByRole("heading", { name: "Footnotes", exact: true });
  await expect(heading).toBeInViewport();
  await expect
    .poll(() => page.locator(".cm-scroller").evaluate((element) => element.scrollTop))
    .toBeGreaterThan(500);
  await expect(page).toHaveURL(/#\/d\/welcome-to-emdy-welcom\/footnotes$/);
  const before = await offsetWithin(heading, page.locator(".cm-scroller"));

  await page.reload();
  await expect(reader).toBeVisible();
  await expect(heading).toBeInViewport();
  await expect
    .poll(() => page.locator(".cm-scroller").evaluate((element) => element.scrollTop))
    .toBeGreaterThan(500);
  await expect
    .poll(async () =>
      Math.abs((await offsetWithin(heading, page.locator(".cm-scroller"))) - before),
    )
    .toBeLessThan(4);
  await expect(page).toHaveURL(/#\/d\/welcome-to-emdy-welcom\/footnotes$/);
  await expect(outline.getByRole("button", { name: "Footnotes", exact: true })).toHaveAttribute(
    "aria-current",
    "location",
  );
});

test("the reader shows the last document chosen when switching faster than it renders", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedLibrary(page);
  await page.keyboard.press("ControlOrMeta+3");
  const reader = page.getByRole("document", { name: "Preview", exact: true });
  await expect(
    reader.getByRole("heading", { level: 1, name: "Welcome to emdy", exact: true }),
  ).toBeVisible();
  const sidebar = page.getByRole("list", { name: "Documents", exact: true });
  for (const title of ["Reading list", "Weekly sync — product", "Project ideas"])
    await sidebar.getByRole("button", { name: title, exact: true }).click();
  const heading = reader.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText("Project ideas");
  await expect(page).toHaveURL(/#\/d\/project-ideas-ideas0/);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 300))),
  );
  await expect(heading).toHaveText("Project ideas");
  await expect(reader.getByRole("heading", { name: "Reading list" })).toHaveCount(0);

  await sidebar.getByRole("button", { name: "Reading list", exact: true }).click();
  await expect(heading).toHaveText("Reading list");
});

test("the document font setting applies system fonts before first paint and survives reload", async ({
  page,
  requests,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.addInitScript(() => {
    new MutationObserver(() => {
      window.__firstFont ??= document.documentElement?.dataset.font;
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-font"] });
  });
  await seedLibrary(page);
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-font", "sans");
  await page.keyboard.press("ControlOrMeta+2");
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  const family = () =>
    editor.evaluate((element) => getComputedStyle(element.closest(".cm-editor")!).fontFamily);
  await expect.poll(family).toMatch(/^system-ui, -apple-system, "Segoe UI"/);

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("radiogroup", { name: "Document font", exact: true })
    .getByRole("radio", { name: "Handwriting", exact: true })
    .click();
  await expect(html).toHaveAttribute("data-font", "handwriting");
  await page.keyboard.press("Escape");
  await expect.poll(family).toMatch(/^"Segoe Print", "Bradley Hand"/);

  await page.goto("/");
  await expect(html).toHaveAttribute("data-font", "handwriting");
  expect(
    await page.evaluate(() => window.__firstFont),
    "the first-paint script must apply the stored font before the app boots",
  ).toBe("handwriting");
  await expect.poll(family).toMatch(/^"Segoe Print", "Bradley Hand"/);
  await editor.press("ControlOrMeta+End");
  await page.keyboard.type(" Still typing.");
  await expect(editor).toContainText("Still typing.");
  expect(requests.filter((request) => request.resourceType === "font")).toEqual([]);
});

test("corrupt stored settings fall back to defaults without errors", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    localStorage.setItem("emdy:pref:theme", '"purple"');
    localStorage.setItem("emdy:pref:layout", "{not json");
    localStorage.setItem("emdy:pref:font", '"papyrus"');
    localStorage.setItem("emdy:workspace:last-document", '"nope"');
    localStorage.setItem("emdy:workspace:positions", '{"welcom":{"anchor":"x"}}');
    localStorage.setItem("emdy:workspace:sidebar", "42");
  });
  await seedLibrary(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-font", "sans");
  await expect(page.getByRole("main", { name: "Document", exact: true })).toHaveAttribute(
    "data-layout",
    "editor",
  );
  await expect(page).toHaveURL(/#\/d\/welcome-to-emdy-welcom/);
  await expect(page.getByRole("button", { name: "Hide sidebar", exact: true })).toBeVisible();
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await expect(editor).toContainText("# Welcome to emdy");
  await editor.press("ControlOrMeta+Home");
  await page.keyboard.insertText("Still editable\n\n");
  await expect(editor).toContainText("Still editable");
});

test("an outline jump remains anchored when a bundled image finishes loading", async ({ page }) => {
  const imageReady = Promise.withResolvers<void>();
  await page.route("**/logo.svg", async (route) => {
    await imageReady.promise;
    await route.fallback();
  });
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedLibrary(page);
  await expect(page.getByRole("textbox", { name: "Markdown editor", exact: true })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+3");
  const reader = page.getByRole("document", { name: "Preview", exact: true });
  const outline = page.getByRole("navigation", { name: "Outline", exact: true });
  await outline.getByRole("button", { name: "Footnotes", exact: true }).click();
  const heading = reader.getByRole("heading", { name: "Footnotes", exact: true });
  await expect(heading).toBeInViewport();
  await expect(page).toHaveURL(/#\/d\/welcome-to-emdy-welcom\/footnotes$/);
  const before = await offsetWithin(heading, page.locator(".cm-scroller"));
  imageReady.resolve();
  await expect
    .poll(() =>
      reader
        .getByRole("img", { name: "The emdy logo", exact: true })
        .evaluate(
          (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
        ),
    )
    .toBe(true);
  await expect
    .poll(async () =>
      Math.abs((await offsetWithin(heading, page.locator(".cm-scroller"))) - before),
    )
    .toBeLessThan(4);
  await expect(page).toHaveURL(/#\/d\/welcome-to-emdy-welcom\/footnotes$/);
  await expect(outline.getByRole("button", { name: "Footnotes", exact: true })).toHaveAttribute(
    "aria-current",
    "location",
  );
  const anchoredScroll = await page
    .locator(".cm-scroller")
    .evaluate((element) => element.scrollTop);
  await reader.hover();
  await page.mouse.wheel(0, -700);
  await expect
    .poll(() => page.locator(".cm-scroller").evaluate((element) => element.scrollTop))
    .toBeLessThan(anchoredScroll - 300);
  await expect(outline.getByRole("button", { name: "Footnotes", exact: true })).not.toHaveAttribute(
    "aria-current",
    "location",
  );
});
