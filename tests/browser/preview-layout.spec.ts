import type { Locator, Page } from "@playwright/test";
import { test, expect, seedLibrary } from "./fixtures";

const LETTER = [
  "Dear Joshua and Joleen,",
  "Thank you once again for sending over the samples.",
  "**Singapore data**",
  "1. From the samples you shared, we noticed `Other revenue`.\n2. Further, we only need 8 fields.\n3. A third point.",
  "- A bullet\n- Another bullet",
].join("\n\n");

test("read-only preview numbers ordered lists and draws text where the editable preview does", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedLibrary(page);
  await page.getByRole("button", { name: "New document", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await editor.fill(LETTER);
  await editor.press("ControlOrMeta+Home");
  await page.keyboard.press("ControlOrMeta+2");

  const probes = ["Dear Joshua", "Thank you once again", "From the samples"];
  const editable = [];
  for (const text of probes) {
    const line = editor.locator(".cm-line").filter({ hasText: text });
    await expect(line).toBeVisible();
    editable.push((await line.boundingBox())!);
  }

  await page.keyboard.press("ControlOrMeta+3");
  const reader = page.getByRole("document", { name: "Preview", exact: true });
  await expect(reader).toBeVisible();
  await expect(reader).toHaveAttribute("aria-readonly", "true");
  for (const [index, text] of probes.entries()) {
    const line = reader.locator(".cm-line").filter({ hasText: text });
    await expect(line).toBeVisible();
    const box = (await line.boundingBox())!;
    expect(Math.abs(box.y - editable[index].y), `${text} y`).toBeLessThanOrEqual(1);
    expect(Math.abs(box.x - editable[index].x), `${text} x`).toBeLessThanOrEqual(1);
  }
  await expect
    .poll(() => page.locator(".cm-scroller").evaluate((element) => element.scrollTop))
    .toBe(0);

  const numbers = reader.locator(".cm-live-list-number");
  await expect(numbers).toHaveText(["1.", "2.", "3."]);
  await expect(reader.locator(".cm-line").filter({ hasText: "**Singapore data**" })).toHaveCount(0);
});

test("switching to read-only preview keeps a scrolled reading position in place", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedLibrary(page);
  await page.getByRole("button", { name: "New document", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await editor.fill(
    Array.from(
      { length: 8 },
      (_, section) =>
        `## Section ${section + 1}\n\n${Array.from(
          { length: 4 },
          (_, index) => `Paragraph ${section + 1}.${index + 1} of the reading position test.`,
        ).join("\n\n")}`,
    ).join("\n\n"),
  );
  await editor.press("ControlOrMeta+Home");
  await page.keyboard.press("ControlOrMeta+2");

  const scroller = page.locator(".cm-scroller");
  await page
    .getByRole("navigation", { name: "Outline", exact: true })
    .getByRole("button", { name: "Section 5", exact: true })
    .click();
  const heading = editor.locator(".cm-line").filter({ hasText: "Section 5" });
  await expect(heading).toBeInViewport();
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(600);
  const paragraph = editor.locator(".cm-line").filter({ hasText: "Paragraph 5.2" });
  const editableBoxes = [(await heading.boundingBox())!, (await paragraph.boundingBox())!];

  await page.keyboard.press("ControlOrMeta+3");
  const reader = page.getByRole("document", { name: "Preview", exact: true });
  const blocks = [
    reader.locator(".cm-line").filter({ hasText: "Section 5" }),
    reader.locator(".cm-line").filter({ hasText: "Paragraph 5.2" }),
  ];
  await expect(blocks[0]).toBeInViewport();
  for (const [index, block] of blocks.entries()) {
    await expect
      .poll(async () => {
        const box = (await block.boundingBox())!;
        return Math.max(
          Math.abs(box.x - editableBoxes[index].x),
          Math.abs(box.y - editableBoxes[index].y),
        );
      })
      .toBeLessThanOrEqual(2);
  }
});

test("editable preview hangs list text from the same marker gutter as read-only preview", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await seedLibrary(page);
  await page.getByRole("button", { name: "New document", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  const wrapping = `Wrapping bullet ${"that keeps going across the sheet ".repeat(4)}end.`;
  await editor.fill(
    [
      "Lists",
      "1. Numbered one\n2. Numbered two",
      `- ${wrapping}\n- Plain bullet\n  - Nested bullet`,
      "* [ ] Open task",
      "8. Eight\n9. Nine\n10. Ten",
    ].join("\n\n"),
  );
  await editor.press("ControlOrMeta+Home");
  await page.keyboard.press("ControlOrMeta+2");

  const probes = [
    "Numbered one",
    "Numbered two",
    "Wrapping bullet",
    "Plain bullet",
    "Open task",
    "Eight",
    "Ten",
    "Nested bullet",
  ];
  const textStarts = (root: string) =>
    page.evaluate(
      ({ probes, root }) =>
        probes.map((probe) => {
          const walker = document.createTreeWalker(
            document.querySelector(root)!,
            NodeFilter.SHOW_TEXT,
          );
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const index = node.textContent!.indexOf(probe);
            if (index < 0) continue;
            const range = document.createRange();
            range.setStart(node, index);
            range.setEnd(node, index + 1);
            return range.getBoundingClientRect().x;
          }
          return Number.NaN;
        }),
      { probes, root },
    );
  const wrappedLines = (root: string) =>
    page.evaluate(
      ({ probe, root }) => {
        const walker = document.createTreeWalker(
          document.querySelector(root)!,
          NodeFilter.SHOW_TEXT,
        );
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.textContent!.includes(probe)) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          const rows = new Map<number, number>();
          for (const rect of range.getClientRects()) {
            const row = Math.round(rect.y);
            rows.set(row, Math.min(rows.get(row) ?? Number.POSITIVE_INFINITY, rect.x));
          }
          return [...rows.values()];
        }
        return [];
      },
      { probe: "Wrapping bullet", root },
    );

  await expect(editor.locator(".cm-live-list-number").first()).toBeVisible();
  const editable = await textStarts(".cm-content");
  const editableWrap = await wrappedLines(".cm-content");
  const top = editable.slice(0, 7);
  for (const x of top) expect(Math.abs(x - top[0])).toBeLessThanOrEqual(1);
  expect(editable[7] - top[0]).toBeGreaterThan(10);
  expect(editableWrap.length).toBeGreaterThan(1);
  for (const x of editableWrap) expect(Math.abs(x - top[0])).toBeLessThanOrEqual(1);

  await page.keyboard.press("ControlOrMeta+3");
  const reader = page.getByRole("document", { name: "Preview", exact: true });
  await expect(reader.locator(".cm-line").filter({ hasText: "Numbered one" })).toBeVisible();
  const readOnly = await textStarts(".cm-content");
  for (const [index, x] of readOnly.entries()) {
    expect(Math.abs(x - editable[index]), probes[index]).toBeLessThanOrEqual(1);
  }
});

const FULL_LETTER = [
  "Dear Joshua and Joleen,",
  "Thank you once again for sending over the samples. We have reviewed them internally and are sharing our findings ahead of the meeting.",
  "**Singapore data**",
  [
    "1. From the samples you shared, we noticed `Other revenue` and `Cash and cash equivalents` are not available. Would it be possible to provide these two fields?",
    "2. Further, please note that of the 43 financial fields provided to us, we only require 8 fields. The fields we mandatorily require are listed in the attached document.",
    "3. Similarly, for firmographics, we only require the registration number and company name.",
    "4. We are also okay with the Management and Shareholder data. However, please note that we will need an `Update date` for both datasets.",
  ].join("\n"),
  "Considering points 2 and 3 above, please see if the pricing can be adjusted, since our required coverage for Singapore is significantly lower than what is currently available.",
  "**Malaysia**",
  "Unfortunately, the gap we see in this data is quite wide. As Mifnaz mentioned in a previous communication, we require **13** additional financial fields on top of what has been provided, as well as **8** additional firmographic fields. These details are also included in the attached document for your reference.",
  "We can discuss this further in detail during our call tomorrow.",
  "Best,\nAzeez",
  ...Array.from(
    { length: 12 },
    (_, index) => `Follow-up note ${index + 1} keeps the letter taller than the window.`,
  ),
].join("\n\n");

const LETTER_PROBES = [
  "Dear Joshua",
  "Thank you once again",
  "Singapore data",
  "From the samples",
  "Further, please note",
  "We are also okay",
  "Considering points",
  "Unfortunately, the gap",
  "We can discuss",
  "Best,",
  "Azeez",
  "Follow-up note 3 ",
];

function textTops(page: Page, root: string) {
  return page.evaluate(
    ({ probes, root }) =>
      probes.map((probe) => {
        const walker = document.createTreeWalker(
          document.querySelector(root)!,
          NodeFilter.SHOW_TEXT,
        );
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const index = node.textContent!.indexOf(probe);
          if (index < 0) continue;
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + 1);
          return range.getBoundingClientRect().y;
        }
        return Number.NaN;
      }),
    { probes: LETTER_PROBES, root },
  );
}

async function scrollToTop(page: Page, scroller: Locator) {
  await scroller.hover();
  await page.mouse.wheel(0, -100_000);
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(0);
}

async function settledScrollTop(scroller: Locator): Promise<number> {
  let last = Number.NaN;
  await expect
    .poll(async () => {
      const now = await scroller.evaluate((element) => element.scrollTop);
      const settled = now === last;
      last = now;
      return settled;
    })
    .toBe(true);
  return last;
}

async function expectSameTops(actual: number[], expected: number[]) {
  for (const [index, y] of actual.entries()) {
    expect(Math.abs(y - expected[index]), LETTER_PROBES[index]).toBeLessThanOrEqual(1);
  }
}

test("switching between editable and read-only preview keeps a slightly scrolled page still", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedLibrary(page);
  await page.getByRole("button", { name: "New document", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await editor.fill(FULL_LETTER);
  await editor.press("ControlOrMeta+Home");
  await page.keyboard.press("ControlOrMeta+2");
  await expect(editor.locator(".cm-live-list-number").first()).toBeVisible();

  const scroller = page.locator(".cm-scroller");
  await scrollToTop(page, scroller);
  await page.mouse.wheel(0, 14);
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const editorTop = await settledScrollTop(scroller);
  const editable = await textTops(page, ".cm-content");

  await page.keyboard.press("ControlOrMeta+3");
  const reader = page.getByRole("document", { name: "Preview", exact: true });
  await expect(reader.getByText("Dear Joshua and Joleen,", { exact: true })).toBeVisible();
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(editorTop);
  await expectSameTops(await textTops(page, ".cm-content"), editable);

  await reader.hover();
  await page.mouse.wheel(0, 250);
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(editorTop);
  await settledScrollTop(scroller);
  const readOnly = await textTops(page, ".cm-content");

  await page.keyboard.press("ControlOrMeta+2");
  await expect(editor).toBeVisible();
  await expect
    .poll(async () => {
      const tops = await textTops(page, ".cm-content");
      return Math.max(...tops.map((y, index) => Math.abs(y - readOnly[index])));
    })
    .toBeLessThanOrEqual(1);
});

test("editable preview wraps and spaces lines exactly like read-only preview", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedLibrary(page);
  await page.getByRole("button", { name: "New document", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await editor.fill(FULL_LETTER);
  await editor.press("ControlOrMeta+End");
  await page.keyboard.press("ControlOrMeta+2");
  await expect(editor.locator(".cm-live-list-number").first()).toBeVisible();
  await editor.press("ControlOrMeta+Home");

  const scroller = page.locator(".cm-scroller");
  const reader = page.getByRole("document", { name: "Preview", exact: true });
  for (const width of [800, 900, 1051, 1064, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.keyboard.press("ControlOrMeta+2");
    await expect(editor).toBeVisible();
    await scrollToTop(page, scroller);
    const editable = await textTops(page, ".cm-content");
    await page.keyboard.press("ControlOrMeta+3");
    await expect(reader.getByText("Dear Joshua and Joleen,", { exact: true })).toBeVisible();
    await scrollToTop(page, scroller);
    const readOnly = await textTops(page, ".cm-content");
    for (const [index, y] of readOnly.entries()) {
      expect(
        Math.abs(y - editable[index]),
        `${LETTER_PROBES[index]} at ${width}px`,
      ).toBeLessThanOrEqual(1);
    }
  }
});

test("read-only preview renders code blocks like the editable preview, with a language header, highlighting, and copy", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedLibrary(page);
  await page.getByRole("button", { name: "New document", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await editor.fill('Intro\n\n```json\n{"test": 42}\n```\n\nAfter');
  await editor.press("ControlOrMeta+Home");
  await page.keyboard.press("ControlOrMeta+2");
  const label = editor.locator(".cm-live-language");
  await expect(label).toHaveText("json");
  const editableLabel = (await label.boundingBox())!;

  await page.keyboard.press("ControlOrMeta+3");
  const reader = page.getByRole("document", { name: "Preview", exact: true });
  const header = reader.locator(".cm-live-language");
  await expect(header).toHaveText("json");
  expect(await header.evaluate((element) => getComputedStyle(element).textTransform)).toBe(
    "uppercase",
  );
  const readerLabel = (await header.boundingBox())!;
  expect(Math.abs(readerLabel.x - editableLabel.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(readerLabel.y - editableLabel.y)).toBeLessThanOrEqual(1);
  await expect(reader.getByText("```json")).toHaveCount(0);
  await expect(reader.getByRole("button", { name: "Copy code", exact: true })).toBeVisible();

  const number = reader.locator("span", { hasText: /^42$/ });
  await expect
    .poll(() =>
      number.evaluate((element) => {
        const probe = document.createElement("span");
        probe.style.color = "var(--color-syntax-number)";
        document.body.append(probe);
        const expected = getComputedStyle(probe).color;
        probe.remove();
        return getComputedStyle(element).color === expected;
      }),
    )
    .toBe(true);

  await reader.locator(".cm-line").filter({ hasText: "Intro" }).click();
  await page.keyboard.type("typed");
  await expect(reader.locator(".cm-line").filter({ hasText: "typed" })).toHaveCount(0);
  await expect(reader.getByText("```json")).toHaveCount(0);
});
