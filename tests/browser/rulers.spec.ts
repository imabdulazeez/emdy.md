import { test, expect, seedLibrary } from "./fixtures";

test("the ruler toggle shows aligned line numbers and a column ruler that survive reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedLibrary(page);
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  const toggle = page.getByRole("button", { name: "Line and column rulers", exact: true });
  const host = page.getByTestId("editor");
  const numbers = host.locator(".cm-lineNumbers .cm-gutterElement:not([style*='visibility'])");
  const ruler = page.getByTestId("column-ruler");

  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(host.locator(".cm-lineNumbers")).toHaveCount(0);
  await expect(ruler).toHaveCount(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(numbers.filter({ hasText: /^1$/ })).toBeVisible();
  await expect(ruler).toBeVisible();
  await expect(ruler.locator(".cm-column-ruler-label").first()).toHaveText("10");

  await editor.press("ControlOrMeta+Home");
  await page.keyboard.insertText("Rulers line one\nabcdefghij\n");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("End");
  const secondNumber = numbers.filter({ hasText: /^2$/ });
  await expect(secondNumber).toHaveClass(/cm-activeLineGutter/);

  const line = editor.locator(".cm-line").nth(1);
  const [numberBox, lineBox] = [await secondNumber.boundingBox(), await line.boundingBox()];
  expect(Math.abs(numberBox!.y - lineBox!.y)).toBeLessThan(2);
  expect(numberBox!.x + numberBox!.width).toBeLessThanOrEqual(lineBox!.x);

  const scale = ruler.locator(".cm-column-ruler-scale");
  const marker = ruler.locator(".cm-column-ruler-marker");
  await expect(marker).toBeVisible();
  const cursor = page.locator(".cm-cursor-primary");
  const [scaleBox, markerBox, cursorBox] = [
    await scale.boundingBox(),
    await marker.boundingBox(),
    await cursor.boundingBox(),
  ];
  expect(Math.abs(scaleBox!.x - lineBox!.x)).toBeLessThan(1.5);
  expect(Math.abs(markerBox!.x - cursorBox!.x)).toBeLessThan(2);
  const tenth = ruler.locator(".cm-column-ruler-label").first();
  const tenthBox = await tenth.boundingBox();
  const cellCentre = markerBox!.x - markerBox!.width / 2;
  expect(Math.abs(tenthBox!.x + tenthBox!.width / 2 - cellCentre)).toBeLessThan(2);

  await page.reload();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(numbers.filter({ hasText: /^1$/ })).toBeVisible();
  await expect(ruler).toBeVisible();

  await page.getByRole("button", { name: "Reading list", exact: true }).click();
  await expect(editor).toContainText("# Reading list");
  await expect(numbers.filter({ hasText: /^1$/ })).toBeVisible();
  await expect(ruler).toBeVisible();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(host.locator(".cm-lineNumbers")).toHaveCount(0);
  await expect(ruler).toHaveCount(0);
  await page.getByRole("button", { name: "Rulers line one", exact: true }).click();
  await expect(editor).toContainText("Rulers line one");
  await expect(host.locator(".cm-lineNumbers")).toHaveCount(0);
  await editor.press("ControlOrMeta+End");
  await page.keyboard.insertText("still editable");
  await expect(editor).toContainText("still editable");
});

test("editable preview keeps line numbers but drops the monospace column ruler", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedLibrary(page);
  await page.getByRole("button", { name: "Line and column rulers", exact: true }).click();
  const host = page.getByTestId("editor");
  await expect(page.getByTestId("column-ruler")).toBeVisible();

  await page.getByTestId("editor").click();
  await page.keyboard.press("ControlOrMeta+2");
  await expect(host).toHaveAttribute("data-editor-mode", "preview");
  await expect(
    host.locator(".cm-lineNumbers .cm-gutterElement").filter({ hasText: /^1$/ }),
  ).toBeVisible();
  await expect(page.getByTestId("column-ruler")).toHaveCount(0);

  // Each number must sit on the first baseline of its line, including padded, larger headings.
  const baselines = await host.evaluate((element) => {
    const context = document.createElement("canvas").getContext("2d")!;
    const baseline = (node: Node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const top = range.getClientRects()[0].top;
      const style = getComputedStyle(node.parentElement!);
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      return top + context.measureText("0").fontBoundingBoxAscent;
    };
    const firstText = (root: Element) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, (node) =>
        node.textContent!.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
      );
      return walker.nextNode()!;
    };
    const lines = Array.from(element.querySelectorAll(".cm-content > .cm-line"));
    const numbers = Array.from(element.querySelectorAll(".cm-lineNumbers .cm-gutterElement"));
    return [1, 3, 5, 13].map((number) => {
      const gutter = numbers.find((row) => row.textContent === String(number))!;
      const line = lines[number - 1];
      return {
        number,
        heading: line.classList.contains("cm-live-heading"),
        gutter: baseline(firstText(gutter)),
        text: baseline(firstText(line)),
      };
    });
  });
  expect(baselines.map(({ number, heading }) => [number, heading])).toEqual([
    [1, true],
    [3, false],
    [5, true],
    [13, true],
  ]);
  for (const { gutter, text } of baselines) expect(Math.abs(gutter - text)).toBeLessThan(2);

  await page.keyboard.press("ControlOrMeta+1");
  await expect(page.getByTestId("column-ruler")).toBeVisible();
});
