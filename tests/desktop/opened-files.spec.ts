import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  createSandbox,
  isLocalRequest,
  launchDesktop,
  launchSecondInstance,
  readFolderFile,
  type DesktopSandbox,
  type DesktopSession,
} from "./app";

let sandbox: DesktopSandbox;
let outside: string;
const sessions: DesktopSession[] = [];

const REVEAL_LABEL =
  process.platform === "darwin"
    ? "Reveal in Finder"
    : process.platform === "win32"
      ? "Reveal in File Explorer"
      : "Open containing folder";

test.beforeEach(async () => {
  sandbox = await createSandbox();
  outside = await mkdtemp(join(tmpdir(), "emdy-desktop-outside-"));
});

test.afterEach(async () => {
  for (const session of sessions.splice(0)) {
    expect(session.errors, "The app should not report uncaught errors").toEqual([]);
    await session.app.close().catch(() => undefined);
  }
  await sandbox.dispose();
  await rm(outside, { recursive: true, force: true });
});

async function open(files: readonly string[] = []): Promise<DesktopSession> {
  const session = await launchDesktop(sandbox, files);
  sessions.push(session);
  return session;
}

async function quit(session: DesktopSession): Promise<void> {
  await session.app.close();
  sessions.splice(sessions.indexOf(session), 1);
}

const otherFolders = (page: Page) => page.getByRole("list", { name: "Other folders", exact: true });
const editorOf = (page: Page) =>
  page.getByRole("textbox", { name: "Markdown editor", exact: true });

test("a file opened from another folder is edited in place and never copied into the library", async () => {
  const path = join(outside, "Road map.md");
  await writeFile(path, "# Road map\n\nFrom elsewhere.");

  const first = await open([path]);
  const row = otherFolders(first.page).getByRole("button", { name: "Road map", exact: true });
  await expect(row).toHaveAttribute("aria-current", "page");
  const editor = editorOf(first.page);
  await expect(editor).toContainText("From elsewhere.");

  await editor.press("ControlOrMeta+End");
  await first.page.keyboard.type(" Edited in emdy.");
  await expect
    .poll(() => readFolderFile(outside, "Road map.md"))
    .toBe("# Road map\n\nFrom elsewhere. Edited in emdy.");
  expect(await readFolderFile(sandbox.folder, "Road map.md")).toBeNull();

  await row.click({ button: "right" });
  await expect(first.page.getByRole("menuitem", { name: REVEAL_LABEL, exact: true })).toBeVisible();
  await expect(first.page.getByRole("menuitem", { name: "Close", exact: true })).toBeVisible();
  await expect(first.page.getByRole("menuitem", { name: "Delete…", exact: true })).toHaveCount(0);
  await first.page.keyboard.press("Escape");
  expect(first.requests.filter((url) => !isLocalRequest(url))).toEqual([]);
  await quit(first);

  const second = await open();
  const reopened = otherFolders(second.page).getByRole("button", { name: "Road map", exact: true });
  await reopened.click();
  await expect(editorOf(second.page)).toContainText("From elsewhere. Edited in emdy.");

  await otherFolders(second.page)
    .getByRole("button", { name: "Close Road map", exact: true })
    .click();
  await expect(otherFolders(second.page)).toHaveCount(0);
  expect(await readFolderFile(outside, "Road map.md")).toBe(
    "# Road map\n\nFrom elsewhere. Edited in emdy.",
  );
  await quit(second);

  const third = await open();
  await expect(
    third.page.getByRole("heading", { name: "Welcome to emdy", level: 1 }),
  ).toBeVisible();
  await expect(otherFolders(third.page)).toHaveCount(0);
});

test("closing with an opened file that cannot be written asks first and keeps the edits", async () => {
  const folder = join(outside, "Project");
  const moved = join(outside, "Project moved");
  await mkdir(folder);
  const path = join(folder, "Notes.md");
  await writeFile(path, "# Notes");

  const session = await open([path]);
  const { app, page } = session;
  const editor = editorOf(page);
  await expect(editor).toContainText("# Notes");
  await app.evaluate(({ dialog }) => {
    const answers = { asked: 0 };
    Object.assign(globalThis, { closeDialogAnswers: answers });
    dialog.showMessageBox = (async () => {
      answers.asked++;
      return { response: 0, checkboxChecked: false };
    }) as typeof dialog.showMessageBox;
  });
  const asked = () =>
    app.evaluate(
      () =>
        (globalThis as unknown as { closeDialogAnswers: { asked: number } }).closeDialogAnswers
          .asked,
    );

  await editor.press("ControlOrMeta+End");
  await page.keyboard.type(" kept");
  await rename(folder, moved);

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await expect.poll(asked).toBe(1);
  await expect(editor).toContainText("# Notes kept");
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);

  await rename(moved, folder);
  await quit(session);
  expect(await readFolderFile(folder, "Notes.md")).toBe("# Notes kept");
});

test("opening a file while the app runs hands it to the open window", async () => {
  const session = await open();
  await expect(
    session.page.getByRole("heading", { name: "Welcome to emdy", level: 1 }),
  ).toBeVisible();

  const path = join(outside, "Handed over.md");
  await writeFile(path, "# Handed over\n\nfrom a second launch");
  expect(await launchSecondInstance(sandbox, [path])).toBe(0);

  await expect(
    otherFolders(session.page).getByRole("button", { name: "Handed over", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(editorOf(session.page)).toContainText("from a second launch");
});

test("a Markdown file dropped on the window opens where it is", async () => {
  const { page } = await open();
  await expect(page.getByRole("heading", { name: "Welcome to emdy", level: 1 })).toBeVisible();
  const path = join(outside, "Dropped.md");
  await writeFile(path, "# Dropped\n\nvia drag and drop");

  await page.evaluate(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.id = "drop-source";
    document.body.append(input);
  });
  await page.locator("#drop-source").setInputFiles(path);
  const handled = await page.evaluate(() => {
    const input = document.getElementById("drop-source") as HTMLInputElement;
    const transfer = new DataTransfer();
    for (const file of Array.from(input.files ?? [])) transfer.items.add(file);
    input.remove();
    const target = document.querySelector("[data-testid=document-sheet]") ?? document.body;
    const init = { dataTransfer: transfer, bubbles: true, cancelable: true };
    target.dispatchEvent(new DragEvent("dragover", init));
    return !target.dispatchEvent(new DragEvent("drop", init));
  });
  expect(handled).toBe(true);

  await expect(
    otherFolders(page).getByRole("button", { name: "Dropped", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(editorOf(page)).toContainText("via drag and drop");
  expect(await readFolderFile(sandbox.folder, "Dropped.md")).toBeNull();
});

test("opening a file that already lives in the library shows that document once", async () => {
  await writeFile(join(sandbox.folder, "Library note.md"), "# Library note\n\nalready here");
  await writeFile(join(sandbox.folder, "Other.md"), "# Other");

  const { page } = await open([join(sandbox.folder, "Library note.md")]);
  const library = page.getByRole("list", { name: "Documents", exact: true });
  await expect(library.getByRole("button", { name: "Library note", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(library.getByRole("button", { name: "Library note", exact: true })).toHaveCount(1);
  await expect(otherFolders(page)).toHaveCount(0);
  await expect(editorOf(page)).toContainText("already here");
});

test("the other folders shelf stays above the footer while the library scrolls behind it", async () => {
  for (let index = 1; index <= 40; index += 1)
    await writeFile(join(sandbox.folder, `Library note ${index}.md`), `# Library note ${index}`);
  const files: string[] = [];
  for (let index = 1; index <= 12; index += 1) {
    const path = join(outside, `Elsewhere ${index}.md`);
    await writeFile(path, `# Elsewhere ${index}`);
    files.push(path);
  }

  const { page } = await open(files);
  const content = page.locator("[data-sidebar=content]");
  const shelf = page.getByRole("region", { name: "Other folders", exact: true });
  const shelfList = otherFolders(page);
  const footer = page.locator("[data-sidebar=footer]");
  await expect(shelfList.getByRole("button", { name: "Elsewhere 1", exact: true })).toBeVisible();

  const box = async (locator: typeof shelf) => (await locator.boundingBox())!;
  const shelfBox = await box(shelf);
  const contentBox = await box(content);
  const footerBox = await box(footer);
  expect(Math.abs(shelfBox.y + shelfBox.height - footerBox.y)).toBeLessThanOrEqual(1);
  expect(contentBox.y + contentBox.height).toBeLessThanOrEqual(shelfBox.y + 1);
  const navBox = await box(page.getByRole("navigation", { name: "Main", exact: true }));
  expect(shelfBox.height).toBeLessThanOrEqual(navBox.height * 0.4 + 1);

  const overflow = (locator: typeof shelf) =>
    locator.evaluate((element) => element.scrollHeight - element.clientHeight);
  expect(await overflow(content)).toBeGreaterThan(0);
  expect(await overflow(shelfList)).toBeGreaterThan(0);

  await page.mouse.move(contentBox.x + contentBox.width / 2, contentBox.y + contentBox.height / 2);
  await page.mouse.wheel(0, 2000);
  await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await box(shelf)).toEqual(shelfBox);
  expect(await shelfList.evaluate((element) => element.scrollTop)).toBe(0);
});

test("the other folders shelf stays collapsed across launches and keeps the open file in view", async () => {
  await writeFile(join(sandbox.folder, "Library note.md"), "# Library note\n\nin the library");
  const path = join(outside, "Elsewhere.md");
  await writeFile(path, "# Elsewhere\n\nfrom another folder");

  const first = await open([path]);
  const toggle = first.page.getByRole("button", { name: "Other folders", exact: true });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await first.page
    .getByRole("list", { name: "Documents", exact: true })
    .getByRole("button", { name: "Library note", exact: true })
    .click();
  await expect(editorOf(first.page)).toContainText("in the library");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toContainText("(1)");
  await expect(otherFolders(first.page)).toHaveCount(0);
  await quit(first);

  const second = await open();
  const reopened = second.page.getByRole("button", { name: "Other folders", exact: true });
  await expect(reopened).toHaveAttribute("aria-expanded", "false");
  await expect(otherFolders(second.page)).toHaveCount(0);
  await expect(editorOf(second.page)).toContainText("in the library");

  await reopened.focus();
  await second.page.keyboard.press("Enter");
  await expect(reopened).toHaveAttribute("aria-expanded", "true");
  await expect(
    otherFolders(second.page).getByRole("button", { name: "Elsewhere", exact: true }),
  ).toBeVisible();
  await reopened.press("Enter");
  await expect(otherFolders(second.page)).toHaveCount(0);

  const handed = join(outside, "Handed over.md");
  await writeFile(handed, "# Handed over\n\nwhile collapsed");
  expect(await launchSecondInstance(sandbox, [handed])).toBe(0);
  await expect(
    otherFolders(second.page).getByRole("button", { name: "Handed over", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(reopened).toHaveAttribute("aria-expanded", "false");
  await expect(reopened).toContainText("(2)");
  await expect(
    otherFolders(second.page).getByRole("button", { name: "Elsewhere", exact: true }),
  ).toHaveCount(0);
});
