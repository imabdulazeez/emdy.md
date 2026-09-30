import { expect, test, type ElectronApplication } from "@playwright/test";
import {
  createSandbox,
  launchDesktop,
  readFolderFile,
  type DesktopSandbox,
  type DesktopSession,
} from "./app";

let sandbox: DesktopSandbox;
let session: DesktopSession | undefined;

test.beforeEach(async () => {
  sandbox = await createSandbox();
});

test.afterEach(async () => {
  if (session) {
    expect(session.errors, "The app should not report uncaught errors").toEqual([]);
    await session.app.close().catch(() => undefined);
    session = undefined;
  }
  await sandbox.dispose();
});

function clickMenuItem(app: ElectronApplication, id: string): Promise<void> {
  return app.evaluate(({ Menu }, itemId) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(itemId);
    if (!item) throw new Error(`No menu item ${itemId}`);
    item.click();
  }, id);
}

function menuAccelerator(app: ElectronApplication, id: string): Promise<string | null | undefined> {
  return app.evaluate(
    ({ Menu }, itemId) => Menu.getApplicationMenu()?.getMenuItemById(itemId)?.accelerator,
    id,
  );
}

test("the menu bar lists the app's commands with their shortcuts and runs them", async () => {
  session = await launchDesktop(sandbox);
  const { app, page } = session;
  const rows = page.locator("[data-document-row]");
  const main = page.getByRole("main", { name: "Document", exact: true });

  await page.getByRole("button", { name: "New document", exact: true }).first().click();
  await expect(rows).toHaveCount(1);

  expect(await menuAccelerator(app, "new-document")).toBe("CmdOrCtrl+N");
  expect(await menuAccelerator(app, "save")).toBe("CmdOrCtrl+S");
  expect(await menuAccelerator(app, "settings")).toBe("CmdOrCtrl+,");
  expect(await menuAccelerator(app, "shortcuts")).toBe("CmdOrCtrl+/");

  await clickMenuItem(app, "new-document");
  await expect(rows).toHaveCount(2);

  await clickMenuItem(app, "layout-reader");
  await expect(main).toHaveAttribute("data-layout", "reader");
  await clickMenuItem(app, "layout-editor");
  await expect(main).toHaveAttribute("data-layout", "editor");

  await clickMenuItem(app, "shortcuts");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toHaveCount(0);

  await clickMenuItem(app, "settings");
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
});

test("a shortcut that is also in the menu bar runs its command once", async () => {
  session = await launchDesktop(sandbox);
  const { page } = session;
  await page.getByRole("button", { name: "New document", exact: true }).first().click();
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await expect(editor).toBeFocused();

  await page.keyboard.press("ControlOrMeta+Slash");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  const panel = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(panel.getByText("New document", { exact: true }).locator("..")).toContainText(
    process.platform === "darwin" ? "⌘N" : "Ctrl+N",
  );
  await page.keyboard.press("Escape");

  await editor.focus();
  await page.keyboard.press("ControlOrMeta+Shift+KeyF");
  await expect(page.getByRole("button", { name: "Exit focus mode", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Exit focus mode", exact: true })).toHaveCount(0);

  await editor.focus();
  await page.keyboard.type("Kept by Save");
  await page.keyboard.press("ControlOrMeta+KeyS");
  await expect.poll(() => readFolderFile(sandbox.folder, "Untitled.md")).toBe("Kept by Save");
  await expect(editor).toHaveText("Kept by Save");
  await expect(page.locator("[data-document-row]")).toHaveCount(1);
});
