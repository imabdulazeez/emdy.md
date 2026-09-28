import type { Page } from "@playwright/test";
import { BUILT_IN_THEMES, DEFAULT_THEME } from "../../src/lib/themes/palettes";
import { test, expect, seedLibrary } from "./fixtures";

declare global {
  interface Window {
    __firstCanvas?: string;
    __themeFrames: string[];
  }
}

const sage = BUILT_IN_THEMES.find((theme) => theme.id === "sage")!;

const rgb = (hex: string) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
};

const bodyBackground = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

const rootColor = (page: Page, role: string) =>
  page.evaluate(
    (name) => getComputedStyle(document.documentElement).getPropertyValue(name),
    `--color-${role}`,
  );

async function recordFirstPaint(page: Page) {
  await page.addInitScript(() => {
    new MutationObserver(() => {
      window.__firstCanvas ??=
        document.documentElement?.style.getPropertyValue("--color-canvas") || undefined;
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ["style"] });
  });
}

async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByTestId("settings-page")).toBeVisible();
}

test("a built-in theme paints the app and survives a reload from first paint", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.emulateMedia({ colorScheme: "light" });
  await recordFirstPaint(page);
  await page.goto("/");
  await expect.poll(() => bodyBackground(page)).toBe(rgb(DEFAULT_THEME.light.canvas));

  await openSettings(page);
  const gallery = page.getByRole("radiogroup", { name: "Theme", exact: true });
  await gallery.getByRole("radio", { name: "Sage", exact: true }).click();
  await expect(gallery.getByRole("radio", { name: "Sage", exact: true })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect.poll(() => bodyBackground(page)).toBe(rgb(sage.light.canvas));
  const sheet = page.getByTestId("document-sheet");
  await expect(sheet).toHaveCSS("background-color", rgb(sage.light.surface));

  await page.reload();
  await expect(page.getByTestId("settings-page")).toBeVisible();
  expect(
    await page.evaluate(() => window.__firstCanvas),
    "the first-paint script must apply the stored theme before the app boots",
  ).toBe(sage.light.canvas);
  await expect(page.getByRole("radio", { name: "Sage", exact: true })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  await expect(page.locator("html")).not.toHaveAttribute("data-no-transitions");
  await page.evaluate(() => {
    window.__themeFrames = [];
    new MutationObserver(() => {
      const root = document.documentElement;
      window.__themeFrames.push(
        `${root.dataset.theme} ${root.style.getPropertyValue("--color-canvas")}`,
      );
    }).observe(document.documentElement, { attributeFilter: ["style", "data-theme"] });
  });
  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => bodyBackground(page)).toBe(rgb(sage.dark.canvas));
  await expect(sheet).toHaveCSS("background-color", rgb(sage.dark.surface));
  const expected = new Set([`light ${sage.light.canvas}`, `dark ${sage.dark.canvas}`]);
  const frames = await page.evaluate(() => window.__themeFrames);
  expect(frames.length).toBeGreaterThan(0);
  expect(
    frames.filter((frame) => !expected.has(frame)),
    "palette colours must change together with the appearance so the crossfade starts from the old palette",
  ).toEqual([]);
});

test("a custom theme previews live, persists, and can be deleted", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.emulateMedia({ colorScheme: "light" });
  await recordFirstPaint(page);
  await page.goto("/");
  await openSettings(page);
  const html = page.locator("html");

  await page.getByRole("button", { name: "Create theme", exact: true }).click();
  const editor = page.getByRole("form", { name: "New theme", exact: true });
  const name = editor.getByRole("textbox", { name: "Name", exact: true });
  await expect(name).toBeFocused();
  await name.fill("Night Ink");

  await editor.getByRole("radio", { name: "Dark", exact: true }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => bodyBackground(page)).toBe(rgb(DEFAULT_THEME.dark.canvas));
  const canvas = editor.getByRole("textbox", { name: "Canvas hex value", exact: true });
  await canvas.fill("#0b0d12");
  await canvas.press("Enter");
  const accent = editor.getByRole("textbox", { name: "Accent hex value", exact: true });
  await accent.fill("#ff8844");
  await accent.press("Enter");
  await expect.poll(() => bodyBackground(page)).toBe(rgb("#0b0d12"));
  await expect.poll(() => rootColor(page, "accent")).toBe("#ff8844");

  await editor.getByRole("button", { name: "Save theme", exact: true }).click();
  const card = page.getByRole("radio", { name: "Night Ink", exact: true });
  await expect(card).toHaveAttribute("aria-checked", "true");
  await expect(card).toBeFocused();
  await expect(html).toHaveAttribute("data-theme", "light");
  await expect.poll(() => bodyBackground(page)).toBe(rgb(DEFAULT_THEME.light.canvas));

  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await expect.poll(() => bodyBackground(page)).toBe(rgb("#0b0d12"));

  await page.reload();
  expect(await page.evaluate(() => window.__firstCanvas)).toBe("#0b0d12");
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => rootColor(page, "accent")).toBe("#ff8844");
  await expect(card).toHaveAttribute("aria-checked", "true");

  await page.getByRole("button", { name: "Edit Night Ink", exact: true }).click();
  const edit = page.getByRole("form", { name: "Edit theme", exact: true });
  const editAccent = edit.getByRole("textbox", { name: "Accent hex value", exact: true });
  await editAccent.fill("#33cc99");
  await editAccent.press("Enter");
  await expect.poll(() => rootColor(page, "accent")).toBe("#33cc99");
  await edit.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect.poll(() => rootColor(page, "accent")).toBe("#ff8844");
  await expect(page.getByRole("button", { name: "Create theme", exact: true })).toBeFocused();

  await page.getByRole("button", { name: "Delete Night Ink", exact: true }).click();
  const confirm = page.getByRole("group", { name: "Delete Night Ink?", exact: true });
  await expect(confirm.getByRole("button", { name: "Delete", exact: true })).toBeFocused();
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "Paper", exact: true })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect.poll(() => bodyBackground(page)).toBe(rgb(DEFAULT_THEME.dark.canvas));

  await page.reload();
  await expect(page.getByRole("radio", { name: "Night Ink", exact: true })).toHaveCount(0);
  await expect.poll(() => rootColor(page, "accent")).toBe(DEFAULT_THEME.dark.accent);
});

test("leaving settings mid-edit drops the preview", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.emulateMedia({ colorScheme: "light" });
  await seedLibrary(page);
  await openSettings(page);
  await page.getByRole("button", { name: "Duplicate Tide", exact: true }).click();
  const editor = page.getByRole("form", { name: "New theme", exact: true });
  await editor.getByRole("radio", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("textbox", { name: "Markdown editor", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect.poll(() => bodyBackground(page)).toBe(rgb(DEFAULT_THEME.light.canvas));
  await openSettings(page);
  await expect(page.getByRole("radio", { name: "Tide copy", exact: true })).toHaveCount(0);
});
