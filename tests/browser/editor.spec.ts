import { test, expect, seedLibrary } from "./fixtures";

test("reload keeps a new document and route, and an unknown route falls back to the last document", async ({
  page,
}) => {
  await seedLibrary(page);
  await page.getByRole("button", { name: "New document", exact: true }).click();
  await page
    .getByRole("button", { name: "Document title: Untitled. Click to rename", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Document title", exact: true }).fill("Reload draft");
  await page.getByRole("textbox", { name: "Document title", exact: true }).press("Enter");
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await editor.fill("This draft is persisted before reload.");
  await expect(page).toHaveURL(/\/#\/d\/reload-draft-[a-z0-9]{6}$/);
  const draftURL = page.url();

  await page.reload();

  await expect(page).toHaveURL(draftURL);
  await expect(page.getByRole("button", { name: "Reload draft", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(editor).toContainText("This draft is persisted before reload.");

  await page.goto("/#/d/gone-zzzzzz");
  await expect(page).toHaveURL(draftURL);
  await expect(page.getByRole("button", { name: "Reload draft", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(editor).toContainText("This draft is persisted before reload.");
  await page.getByRole("button", { name: "Reading list", exact: true }).click();
  await expect(editor).toContainText("# Reading list");
  await editor.press("ControlOrMeta+Home");
  await page.keyboard.insertText("Recovered editor\n\n");
  await expect(editor).toContainText("Recovered editor");
});

test("switching flushes pending edits to their original document", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await seedLibrary(page);
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await expect(editor).toBeVisible();
  await page.clock.pauseAt(new Date("2026-01-01T01:00:00Z"));
  await editor.fill("Pending first document edit");
  await page.getByRole("button", { name: "Reading list", exact: true }).click();
  await expect(editor).toContainText("# Reading list");
  await page.clock.runFor(500);
  await expect(editor).not.toContainText("Pending first document edit");
  await page.getByRole("button", { name: "Pending first document edit", exact: true }).click();
  await expect(editor).toHaveText("Pending first document edit");
  await page.clock.resume();
});

test("undo after switching cannot apply another document's history", async ({ page }) => {
  await seedLibrary(page);
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await editor.fill("First document replacement");
  await page.getByRole("button", { name: "Reading list", exact: true }).click();
  await expect(editor).toContainText("# Reading list");
  const original = await editor.innerText();
  await editor.press("ControlOrMeta+z");
  await expect(editor).toHaveText(original, { useInnerText: true });
  await editor.press("ControlOrMeta+Home");
  await page.keyboard.insertText("Temporary edit\n\n");
  await expect(editor).toContainText("Temporary edit");
  await editor.press("ControlOrMeta+z");
  await expect(editor).toHaveText(original, { useInnerText: true });
  await editor.press("ControlOrMeta+Shift+z");
  await expect(editor).toContainText("Temporary edit");
  await editor.press("ControlOrMeta+z");
  await expect(editor).toHaveText(original, { useInnerText: true });
  await page.getByRole("button", { name: "First document replacement", exact: true }).click();
  await expect(editor).toHaveText("First document replacement");
  await editor.press("ControlOrMeta+z");
  await expect(editor).toContainText("# Welcome to emdy");
  await expect(page.getByRole("button", { name: "Welcome to emdy", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reading list", exact: true }).click();
  await expect(editor).toHaveText(original, { useInnerText: true });
});

test("a document left long ago keeps its saved edit and starts a fresh history", async ({
  page,
}) => {
  const notes = Array.from({ length: 11 }, (_, index) => ({
    id: `note${String(index + 1).padStart(2, "0")}`,
    title: `Note ${index + 1}`,
    text: `# Note ${index + 1}\n\nBody ${index + 1}`,
  }));
  await seedLibrary(page, notes);
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await expect(editor).toContainText("Body 1");
  await editor.press("ControlOrMeta+End");
  await page.keyboard.insertText(" kept");
  await expect(editor).toContainText("Body 1 kept");
  for (const note of notes.slice(1)) {
    await page.getByRole("button", { name: note.title, exact: true }).click();
    await expect(editor).toContainText(note.text.split("\n").at(-1)!);
  }
  await page.getByRole("button", { name: "Note 1", exact: true }).click();
  await expect(editor).toContainText("Body 1 kept");
  await editor.press("ControlOrMeta+End");
  await page.keyboard.insertText(" again");
  await expect(editor).toContainText("Body 1 kept again");
  await editor.press("ControlOrMeta+z");
  await expect(editor).toContainText("Body 1 kept");
  await expect(editor).not.toContainText("again");
  await editor.press("ControlOrMeta+z");
  await expect(editor).toContainText("Body 1 kept");
  await page.getByRole("button", { name: "Note 11", exact: true }).click();
  await expect(editor).toContainText("Body 11");
  await editor.press("ControlOrMeta+z");
  await expect(editor).toContainText("Body 11");
});

for (const mode of ["Raw Markdown", "Editable preview"]) {
  test(`table keyboard navigation edits cells, adds a row, and returns focus to prose in ${mode}`, async ({
    page,
  }) => {
    await seedLibrary(page);
    await page.getByRole("button", { name: "New document", exact: true }).click();
    const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
    await editor.fill("Before\n\n| Name | Status |\n| --- | --- |\n| Alpha | Draft |\n\nAfter");
    await editor.press("ControlOrMeta+Home");
    if (mode === "Editable preview") {
      await page.keyboard.press("ControlOrMeta+2");
      await page.getByRole("columnheader", { name: "Name", exact: true }).click();
    } else {
      await editor.press("ArrowDown");
      await editor.press("ArrowDown");
    }
    const heading = page.getByRole("textbox", { name: "Column 1 heading", exact: true });
    await expect(heading).toBeFocused();
    const grid = page.getByRole("group", { name: "Table editor", exact: true });
    await expect(grid).toBeInViewport();
    await heading.press("Tab");
    const secondHeading = page.getByRole("textbox", { name: "Column 2 heading", exact: true });
    await expect(secondHeading).toBeFocused();
    await secondHeading.press("Shift+Tab");
    await expect(heading).toBeFocused();
    await heading.press("Enter");
    const firstCell = page.getByRole("textbox", { name: "Row 1, column 1", exact: true });
    await expect(firstCell).toBeFocused();
    await firstCell.fill("Beta");
    await firstCell.press("Tab");
    const lastCell = page.getByRole("textbox", { name: "Row 1, column 2", exact: true });
    await expect(lastCell).toBeFocused();
    await lastCell.press("Tab");
    const newCell = page.getByRole("textbox", { name: "Row 2, column 1", exact: true });
    await expect(newCell).toBeFocused();
    await expect(newCell).toBeInViewport();
    const rowBox = await lastCell.boundingBox();
    const newRowBox = await newCell.boundingBox();
    expect(newRowBox!.y).toBeGreaterThanOrEqual(rowBox!.y + rowBox!.height);
    await newCell.fill("Gamma");
    await newCell.press("Escape");
    await expect(grid).toHaveCount(0);
    await expect(editor).toBeFocused();
    await expect(editor).toContainText("Beta");
    await expect(editor).toContainText("Gamma");
    await page.getByRole("button", { name: "Reading list", exact: true }).click();
    await page.getByRole("button", { name: "Before", exact: true }).click();
    await expect(editor).toContainText("Beta");
    await expect(editor).toContainText("Gamma");
  });
}

test("outline navigation scrolls real editor geometry and tracks the visible heading", async ({
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
        `## Section ${index + 1}\n\n${"Paragraph with enough text to scroll.\n\n".repeat(12)}`,
    ).join("\n"),
  );
  await editor.press("ControlOrMeta+Home");
  const outline = page.getByRole("navigation", { name: "Outline", exact: true });
  const target = outline.getByRole("button", { name: "Section 10", exact: true });
  await target.click();
  await expect(editor.locator(".cm-line").filter({ hasText: /^## Section 10$/ })).toBeInViewport();
  const scroller = page.locator(".cm-scroller");
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(1000);
  await scroller.hover();
  await page.mouse.wheel(0, 120);
  await expect(target).toHaveAttribute("aria-current", "location");
  await page.mouse.wheel(0, -100_000);
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(0);
  await expect(outline.getByRole("button", { name: "Section 1", exact: true })).toHaveAttribute(
    "aria-current",
    "location",
  );
});

test("bundled images, fenced code, and editing work without unexpected network requests", async ({
  page,
  context,
}) => {
  await seedLibrary(page);
  await page.getByRole("button", { name: "New document", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await editor.fill(
    'Intro\n\n![Local logo](/logo.svg)\n\n```python\nprint("local")\n```\n\n```html\n<script>let local = 1</script>\n```\n\nPress <kbd>K</kbd> inline.\n\n[External link](https://example.com)\n\nAfter',
  );
  await editor.press("ControlOrMeta+Home");
  await page.keyboard.press("ControlOrMeta+2");
  const image = page.getByRole("img", { name: "Local logo", exact: true });
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(editor).toContainText('print("local")');
  await expect(editor.locator(".cm-live-code-header").first()).toContainText("python");
  const keyword = editor.locator("span", { hasText: /^let$/ });
  await expect
    .poll(() =>
      keyword.evaluate((element) => {
        const probe = document.createElement("span");
        probe.style.color = "var(--color-syntax-keyword)";
        document.body.append(probe);
        const expected = getComputedStyle(probe).color;
        probe.remove();
        return getComputedStyle(element).color === expected;
      }),
    )
    .toBe(true);
  await expect(editor).toContainText("Press <kbd>K</kbd> inline.");
  await context.setOffline(true);
  await page.getByRole("button", { name: "Reading list", exact: true }).click();
  await expect(editor).toContainText("Reading list");
  await page.getByRole("button", { name: "Intro", exact: true }).click();
  await expect(image).toBeVisible();
  await editor.press("ControlOrMeta+Home");
  await page.keyboard.insertText("Offline edit\n\n");
  await expect(editor).toContainText("Offline edit");
  await page.keyboard.press("ControlOrMeta+3");
  const reader = page.getByRole("document", { name: "Preview", exact: true });
  await expect(reader).toBeVisible();
  const line = (text: string) => reader.locator(".cm-line").filter({ hasText: text });
  await expect(line("Offline edit")).toBeVisible();
  await expect(reader.getByRole("img", { name: "Local logo", exact: true })).toBeVisible();
  await expect(line('print("local")')).toBeVisible();
  await page.getByRole("button", { name: "Reading list", exact: true }).click();
  await expect(line("Reading list").first()).toBeVisible();
  await expect(reader.getByRole("img", { name: "Local logo", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Offline edit", exact: true }).click();
  await expect(line("Offline edit")).toBeVisible();
  await expect(reader.getByRole("img", { name: "Local logo", exact: true })).toBeVisible();
});

test("typing three backticks opens a fence with exactly three backticks", async ({ page }) => {
  await seedLibrary(page);
  await page.getByRole("button", { name: "New document", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await editor.click();
  await page.keyboard.type("```");
  await page.keyboard.type("js");
  await expect(editor.locator(".cm-line").first()).toHaveText("```js");
});

test("typing a numbered list marker in editable preview keeps the caret after its space", async ({
  page,
}) => {
  await seedLibrary(page);
  await page.getByRole("button", { name: "New document", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await editor.click();
  await page.keyboard.press("ControlOrMeta+2");
  await page.keyboard.type("1. first");
  await expect(editor.locator(".cm-line").first()).toHaveText("1. first");
  await page.keyboard.press("Enter");
  await page.keyboard.type("second");
  await expect(editor.locator(".cm-line").nth(1)).toHaveText("2. second");
});
