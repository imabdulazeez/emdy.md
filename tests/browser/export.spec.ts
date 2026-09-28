import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import { expect, seedLibrary, test, TEST_DOCUMENTS } from "./fixtures";

declare global {
  interface Window {
    __emdyPrinted?: number;
  }
}

async function openExportMenu(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByRole("menu", { name: "Export", exact: true })).toBeVisible();
}

test("exports the active document as Markdown with the latest unsaved keystrokes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedLibrary(page, TEST_DOCUMENTS.slice(0, 1));
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await editor.press("ControlOrMeta+End");
  await page.keyboard.type(" Fresh words.");
  await expect(editor).toContainText("Fresh words.");

  await openExportMenu(page);
  await expect(page.getByRole("menuitem")).toHaveText([
    "Markdown (.md)",
    "Word document (.docx)",
    "PDF…",
  ]);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Markdown (.md)", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("Welcome to emdy.md");
  const text = await readFile(await download.path(), "utf8");
  expect(text.startsWith("# Welcome to emdy")).toBe(true);
  expect(text.trimEnd().endsWith("Fresh words.")).toBe(true);
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("exports the active document as a Word file that keeps the title and formatting, even offline", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const loaded = (prefix: string) =>
    page.waitForResponse((response) => new URL(response.url()).pathname.startsWith(prefix));
  const renderer = loaded("/assets/render.worker-");
  await seedLibrary(page, TEST_DOCUMENTS.slice(0, 1));
  expect((await renderer).ok()).toBe(true);

  const builder = loaded("/assets/docx-");
  await page.getByRole("button", { name: "Export", exact: true }).hover();
  expect((await builder).ok()).toBe(true);
  await context.setOffline(true);

  await openExportMenu(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Word document (.docx)", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("Welcome to emdy.docx");
  const files = unzipSync(new Uint8Array(await readFile(await download.path())));
  const body = strFromU8(files["word/document.xml"]);
  expect(body).toContain('<w:pStyle w:val="Heading1"/>');
  expect(body).toContain(">Welcome to emdy<");
  expect(body).toContain("<w:tbl>");
  expect(body).toContain("<w:footnoteReference");
  expect(body).toContain("<w:hyperlink");
  expect(strFromU8(files["docProps/core.xml"])).toContain("<dc:title>Welcome to emdy</dc:title>");
  expect(strFromU8(files["word/footnotes.xml"])).toContain("countless design books");
  await expect(page.getByTestId("export-error")).toHaveCount(0);
  await context.setOffline(false);
});

test("PDF export prints the rendered document in the chosen system font, even offline", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("emdy:pref:font", '"serif"');
    window.print = () => {
      window.__emdyPrinted = (window.__emdyPrinted ?? 0) + 1;
    };
  });
  await page.setViewportSize({ width: 1600, height: 900 });
  const renderer = page.waitForResponse((response) =>
    new URL(response.url()).pathname.startsWith("/assets/render.worker-"),
  );
  await seedLibrary(page, TEST_DOCUMENTS.slice(0, 1));
  await expect(page.locator("html")).toHaveAttribute("data-font", "serif");
  expect((await renderer).ok()).toBe(true);
  await context.setOffline(true);

  await openExportMenu(page);
  await page.getByRole("menuitem", { name: "PDF…", exact: true }).click();

  const frame = page.frameLocator('iframe[title="Print preview"]');
  const heading = frame.locator("article.preview-content h1").first();
  await expect(heading).toHaveText("Welcome to emdy");
  await expect(frame.locator("article.preview-content table")).toHaveCount(1);
  const printFrame = page
    .frames()
    .find((candidate) => candidate.parentFrame() === page.mainFrame());
  expect(printFrame).toBeDefined();
  await expect.poll(() => printFrame!.evaluate(() => window.__emdyPrinted ?? 0)).toBe(1);
  expect(await printFrame!.evaluate(() => document.title)).toBe("Welcome to emdy");
  expect(await printFrame!.evaluate(() => document.documentElement.dataset.theme)).toBe("light");
  expect(await printFrame!.evaluate(() => document.documentElement.dataset.font)).toBe("serif");
  const family = await heading.evaluate((element) => getComputedStyle(element).fontFamily);
  expect(family).toMatch(/^Charter, "Iowan Old Style"/);
  expect(await page.evaluate(() => window.__emdyPrinted ?? 0)).toBe(0);
  await expect(page.getByTestId("export-error")).toHaveCount(0);
  await context.setOffline(false);
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await expect(editor).toContainText("# Welcome to emdy");
});
