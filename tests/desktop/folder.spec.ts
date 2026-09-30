import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  createSandbox,
  isLocalRequest,
  launchDesktop,
  readFolderFile,
  type DesktopSandbox,
  type DesktopSession,
} from "./app";

let sandbox: DesktopSandbox;
const sessions: DesktopSession[] = [];

test.beforeEach(async () => {
  sandbox = await createSandbox();
});

test.afterEach(async () => {
  for (const session of sessions.splice(0)) {
    expect(session.errors, "The app should not report uncaught errors").toEqual([]);
    await session.app.close().catch(() => undefined);
  }
  await sandbox.dispose();
});

async function open(): Promise<DesktopSession> {
  const session = await launchDesktop(sandbox);
  sessions.push(session);
  return session;
}

async function createDocument(page: Page, title: string, text: string): Promise<void> {
  await page.getByRole("button", { name: "New document", exact: true }).first().click();
  await page
    .getByRole("button", { name: "Document title: Untitled. Click to rename", exact: true })
    .click();
  const titleField = page.getByRole("textbox", { name: "Document title", exact: true });
  await titleField.fill(title);
  await titleField.press("Enter");
  await page.getByRole("textbox", { name: "Markdown editor", exact: true }).fill(text);
}

test("documents are plain files in the folder and reopen after a relaunch", async () => {
  const first = await open();
  await expect(
    first.page.getByRole("heading", { name: "Welcome to emdy", level: 1 }),
  ).toBeVisible();
  await expect(first.page.getByTestId("empty-library-folder")).toContainText(
    `plain Markdown files in the ${basename(sandbox.folder)} folder`,
  );

  await createDocument(first.page, "Desktop draft", "# Desktop draft\n\nWritten to disk.");
  await expect(first.page).toHaveURL(/#\/d\/desktop-draft-[a-z0-9]{6}/);
  const id = /desktop-draft-([a-z0-9]{6})/.exec(first.page.url())![1];
  await expect
    .poll(() => readFolderFile(sandbox.folder, "Desktop draft.md"))
    .toBe("# Desktop draft\n\nWritten to disk.");
  await expect.poll(() => readFolderFile(sandbox.folder, "Untitled.md")).toBeNull();
  await expect
    .poll(() => readFolderFile(join(sandbox.folder, ".emdy"), "index.json"))
    .toContain(`"id": "${id}"`);
  expect(first.requests.filter((url) => !isLocalRequest(url))).toEqual([]);
  await first.app.close();
  sessions.splice(sessions.indexOf(first), 1);

  const second = await open();
  const editor = second.page.getByRole("textbox", { name: "Markdown editor", exact: true });
  const sidebar = second.page.getByRole("list", { name: "Documents", exact: true });
  await expect(sidebar.getByRole("button", { name: "Desktop draft", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(second.page).toHaveURL(new RegExp(`#/d/desktop-draft-${id}`));
  await expect(editor).toContainText("Written to disk.");
  await editor.press("ControlOrMeta+End");
  await second.page.keyboard.type(" Still editable.");
  await expect
    .poll(() => readFolderFile(sandbox.folder, "Desktop draft.md"))
    .toBe("# Desktop draft\n\nWritten to disk. Still editable.");
  expect(second.requests.filter((url) => !isLocalRequest(url))).toEqual([]);
});

test("files another app writes into the folder appear without a restart", async () => {
  const { page } = await open();
  await createDocument(page, "Mine", "# Mine");
  await expect.poll(() => readFolderFile(sandbox.folder, "Mine.md")).toBe("# Mine");

  await writeFile(join(sandbox.folder, "Outside.md"), "# Outside\n\nfrom another app");
  const sidebar = page.getByRole("list", { name: "Documents", exact: true });
  const outside = sidebar.getByRole("button", { name: "Outside", exact: true });
  await expect(outside).toBeVisible();
  await outside.click();
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await expect(editor).toContainText("from another app");

  await writeFile(join(sandbox.folder, "Outside.md"), "# Outside\n\nedited elsewhere");
  await expect(editor).toContainText("edited elsewhere");
  await expect(editor).not.toContainText("from another app");
});

test("the last edit is saved when the app quits straight after typing", async () => {
  const session = await open();
  await createDocument(session.page, "Quick note", "# Quick note");
  await expect.poll(() => readFolderFile(sandbox.folder, "Quick note.md")).toBe("# Quick note");
  const editor = session.page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await editor.press("ControlOrMeta+End");
  await session.page.keyboard.type("\n\nTyped just before quitting.");
  await session.app.close();
  sessions.splice(sessions.indexOf(session), 1);
  expect(await readFolderFile(sandbox.folder, "Quick note.md")).toBe(
    "# Quick note\n\nTyped just before quitting.",
  );
});

test("settings name the documents folder instead of browser storage", async () => {
  const { page } = await open();
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await expect(page.getByTestId("storage-location")).toHaveText(basename(sandbox.folder));
  await expect(page.getByTestId("storage-path")).toHaveText(sandbox.folder);
  await expect(page.getByRole("button", { name: "Change folder…", exact: true })).toBeVisible();
  await expect(page.getByText("This browser", { exact: true })).toHaveCount(0);
});

test("Mod-N creates a document in the desktop app, where the browser needs Mod-Alt-N", async () => {
  const { page } = await open();
  await createDocument(page, "First page", "# First page");
  await expect.poll(() => readFolderFile(sandbox.folder, "First page.md")).toBe("# First page");
  const rows = page.locator("[data-document-row]");
  await expect(rows).toHaveCount(1);
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });

  await editor.focus();
  await page.keyboard.press("ControlOrMeta+Alt+KeyN");
  await expect(rows).toHaveCount(1);
  await expect(editor).toContainText("# First page");

  const before = page.url();
  await page.keyboard.press("ControlOrMeta+KeyN");
  await expect(rows).toHaveCount(2);
  await expect(page).not.toHaveURL(before);
  await expect(editor).toBeFocused();
  await page.keyboard.type("Made with the shortcut");
  await expect
    .poll(() => readFolderFile(sandbox.folder, "Untitled.md"))
    .toBe("Made with the shortcut");
  expect(await readFolderFile(sandbox.folder, "First page.md")).toBe("# First page");
  expect(page.context().pages()).toHaveLength(1);
});
