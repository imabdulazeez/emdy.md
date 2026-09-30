import type { Page } from "@playwright/test";
import { test, expect, seedLibrary } from "./fixtures";

const group = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Main", exact: true })
    .getByRole("list", { name, exact: true });

const pinnedNames = (page: Page) =>
  group(page, "Pinned")
    .locator("[data-sidebar=menu-button]")
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));

const row = (page: Page, name: string) =>
  page
    .getByRole("list", { name: "Documents", exact: true })
    .getByRole("button", { name, exact: true });

test("a pinned document sits above the date groups and stays pinned after a reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await seedLibrary(page);
  await expect(group(page, "Pinned")).toHaveCount(0);

  await row(page, "Reading list").focus();
  await page.keyboard.press("Shift+F10");
  const menu = page.getByRole("menu", { name: "Reading list", exact: true });
  await expect(menu).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Change icon…", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Pin", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveCount(0);

  const pinned = group(page, "Pinned");
  await expect(pinned.getByRole("button", { name: "Reading list", exact: true })).toBeVisible();
  await expect(row(page, "Reading list")).toHaveCount(1);
  await expect(row(page, "Reading list")).toBeFocused();
  await expect(
    group(page, "Today").getByRole("button", { name: "Reading list", exact: true }),
  ).toHaveCount(0);

  await row(page, "Project ideas").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Pin", exact: true }).click();
  await expect.poll(() => pinnedNames(page)).toEqual(["Reading list", "Project ideas"]);

  const pinnedBox = (await row(page, "Project ideas").boundingBox())!;
  const firstUnpinned = (await row(page, "Welcome to emdy").boundingBox())!;
  expect(pinnedBox.y + pinnedBox.height).toBeLessThanOrEqual(firstUnpinned.y);

  await page.reload();
  await expect(group(page, "Pinned")).toBeVisible();
  await expect.poll(() => pinnedNames(page)).toEqual(["Reading list", "Project ideas"]);

  await row(page, "Reading list").click();
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await expect(editor).toBeFocused();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\nStill editable.");
  await expect(editor).toContainText("Still editable.");
  await expect(
    group(page, "Pinned").getByRole("button", { name: "Reading list", exact: true }),
  ).toBeVisible();

  await row(page, "Reading list").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Unpin", exact: true }).click();
  await expect(row(page, "Reading list")).toBeFocused();
  await row(page, "Project ideas").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Unpin", exact: true }).click();
  await expect(group(page, "Pinned")).toHaveCount(0);
  await expect(
    group(page, "Today").getByRole("button", { name: "Reading list", exact: true }),
  ).toBeVisible();

  await page.reload();
  await expect(row(page, "Reading list")).toBeVisible();
  await expect(group(page, "Pinned")).toHaveCount(0);
});

test("deleting a pinned document removes its pin", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await seedLibrary(page);
  await row(page, "Project ideas").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Pin", exact: true }).click();
  await expect(group(page, "Pinned")).toBeVisible();

  await row(page, "Project ideas").hover();
  await page.getByRole("button", { name: "Delete Project ideas", exact: true }).click();
  await page
    .getByRole("group", { name: "Delete Project ideas?", exact: true })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(row(page, "Project ideas")).toHaveCount(0);
  await expect(group(page, "Pinned")).toHaveCount(0);

  await page.reload();
  await expect(row(page, "Reading list")).toBeVisible();
  await expect(row(page, "Project ideas")).toHaveCount(0);
  await expect(group(page, "Pinned")).toHaveCount(0);
});
