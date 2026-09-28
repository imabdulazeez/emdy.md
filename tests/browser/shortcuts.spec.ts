import { test, expect, seedLibrary } from "./fixtures";

test("global shortcuts act from inside the editor without typing into the document", async ({
  page,
}) => {
  await seedLibrary(page);
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  const sidebar = page.getByRole("complementary", { name: "Sidebar" });
  const toolbar = page.getByRole("banner", { name: "Toolbar" });
  await expect(editor).toContainText("# Welcome to emdy");
  await editor.press("ControlOrMeta+Home");
  const original = await editor.innerText();

  await expect(sidebar).toHaveAttribute("data-state", "expanded");
  await page.keyboard.press("ControlOrMeta+Backslash");
  await expect(sidebar).toHaveAttribute("data-state", "collapsed");
  await page.keyboard.press("ControlOrMeta+Backslash");
  await expect(sidebar).toHaveAttribute("data-state", "expanded");

  await editor.focus();
  await page.keyboard.press("ControlOrMeta+Shift+F");
  await expect(page.getByRole("button", { name: "Exit focus mode", exact: true })).toBeVisible();
  await expect(toolbar).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Exit focus mode", exact: true })).toHaveCount(0);
  await expect(toolbar).toBeVisible();

  await editor.focus();
  await page.keyboard.press("ControlOrMeta+P");
  const search = sidebar.getByRole("searchbox", { name: "Search documents", exact: true });
  await expect(search).toBeFocused();

  await sidebar
    .getByRole("button", { name: "Reading list", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Change icon…", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Document icon", exact: true });
  await expect(picker).toBeVisible();
  await page.keyboard.press("ControlOrMeta+P");
  await expect(picker).toHaveCount(0);
  await expect(search).toBeFocused();

  await editor.focus();
  await page.keyboard.press("ControlOrMeta+Slash");
  const panel = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Open context menu", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(editor).toBeFocused();

  await expect(editor).toHaveText(original, { useInnerText: true });

  const rows = sidebar.locator("[data-document-row]");
  const count = await rows.count();
  const before = page.url();
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+Alt+KeyN");
  await expect(rows).toHaveCount(count + 1);
  await expect(page).not.toHaveURL(before);
  await expect(editor).toBeFocused();
  await page.keyboard.type("Fresh page");
  await expect(editor).toContainText("Fresh page");
  await expect(editor).not.toContainText("# Welcome to emdy");
});
