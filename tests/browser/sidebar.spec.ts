import type { Page } from "@playwright/test";
import { test, expect, seedLibrary } from "./fixtures";

interface SidebarFrame {
  rail: boolean;
  width: number | null;
  sheetLeft: number | null;
}

declare global {
  interface Window {
    __sidebarFrames?: SidebarFrame[];
  }
}

const SAMPLED_FRAMES = 120;

// Samples the layout once per animation frame from the very first frame of the next load,
// so a sidebar that renders in the wrong state and then corrects itself is caught even if
// it only showed for a single frame.
async function recordFrames(page: Page): Promise<void> {
  await page.addInitScript((limit) => {
    const frames: SidebarFrame[] = [];
    window.__sidebarFrames = frames;
    const sample = () => {
      const rail = document.querySelector<HTMLElement>('aside[data-sidebar="sidebar"]');
      const sheet = document.querySelector('[data-testid="document-sheet"]');
      if (rail || sheet) {
        frames.push({
          rail: rail !== null,
          width: rail ? rail.getBoundingClientRect().width : null,
          sheetLeft: sheet ? sheet.getBoundingClientRect().left : null,
        });
      }
      if (frames.length < limit) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, SAMPLED_FRAMES);
}

const recordedFrames = async (page: Page) => {
  await expect
    .poll(() => page.evaluate(() => window.__sidebarFrames?.length ?? 0))
    .toBe(SAMPLED_FRAMES);
  return page.evaluate(() => window.__sidebarFrames ?? []);
};

test("the desktop sidebar cannot collapse and paints at full width from the first frame", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedLibrary(page);
  const sidebar = page.getByRole("complementary", { name: "Sidebar", exact: true });
  const sheet = page.getByTestId("document-sheet");
  const widthOf = async () => (await sidebar.boundingBox())!.width;
  const expanded = await widthOf();
  expect(expanded).toBeGreaterThan(200);
  const sheetLeft = (await sheet.boundingBox())!.x;
  await expect(page.getByRole("button", { name: /^(Hide|Show) sidebar$/ })).toHaveCount(0);

  await page.getByRole("textbox", { name: "Markdown editor", exact: true }).focus();
  await page.keyboard.press("ControlOrMeta+Backslash");
  await expect(sidebar).toBeVisible();
  expect(await widthOf()).toBeCloseTo(expanded, 0);

  await recordFrames(page);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Markdown editor", exact: true })).toBeVisible();

  const frames = await recordedFrames(page);
  const painted = frames.filter((frame) => frame.rail);
  expect(painted.length, "the sidebar must be sampled while the app boots").toBeGreaterThan(0);
  expect(frames[0].rail, "the sidebar must exist in the first frame the sheet does").toBe(true);
  for (const [index, frame] of frames.entries()) {
    expect(frame.width!, `frame ${index} sidebar width`).toBeCloseTo(expanded, 0);
    expect(frame.sheetLeft!, `frame ${index} sheet edge`).toBeCloseTo(sheetLeft, 0);
  }
  await expect(page.getByRole("button", { name: /^(Hide|Show) sidebar$/ })).toHaveCount(0);
});

test("the narrow-screen drawer opens with Mod-\\ and shuts when the window widens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedLibrary(page);
  const drawer = page.getByRole("dialog", { name: "Sidebar", exact: true });
  const aside = page.getByRole("complementary", { name: "Sidebar", exact: true });
  await expect(aside).toHaveCount(0);

  await page.getByRole("textbox", { name: "Markdown editor", exact: true }).focus();
  await page.keyboard.press("ControlOrMeta+Backslash");
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);

  await page.getByRole("button", { name: "Show sidebar", exact: true }).click();
  await expect(drawer).toBeVisible();
  await page.setViewportSize({ width: 1600, height: 900 });
  await expect(drawer).toHaveCount(0);
  await expect(aside).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(aside).toHaveCount(0);
  await expect(drawer).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show sidebar", exact: true })).toBeVisible();
});

test("a phone never paints the desktop sidebar rail while booting", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedLibrary(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("complementary", { name: "Sidebar", exact: true })).toHaveCount(0);

  await recordFrames(page);
  await page.reload();
  await expect(page.getByRole("button", { name: "Show sidebar", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Markdown editor", exact: true })).toBeVisible();

  const frames = await recordedFrames(page);
  for (const [index, frame] of frames.entries()) {
    expect(frame.rail, `frame ${index} must not lay out the desktop rail`).toBe(false);
    expect(frame.sheetLeft!, `frame ${index} sheet edge`).toBeCloseTo(0, 0);
  }
  await expect(page.getByRole("dialog", { name: "Sidebar", exact: true })).toHaveCount(0);
});
