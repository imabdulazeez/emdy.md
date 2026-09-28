import { test, expect, seedLibrary } from "./fixtures";
import { listFiles, readCatalog, readFile } from "./opfs";

test("documents are stored as Markdown files and survive a reload with their identity", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedLibrary(page);
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await expect(editor).toContainText("# Welcome to emdy");
  await expect
    .poll(() => listFiles(page))
    .toEqual([
      "Project ideas.md",
      "Reading list.md",
      "Weekly sync — product.md",
      "Welcome to emdy.md",
    ]);

  await page.getByRole("button", { name: "New document", exact: true }).click();
  await page
    .getByRole("button", { name: "Document title: Untitled. Click to rename", exact: true })
    .click();
  const titleField = page.getByRole("textbox", { name: "Document title", exact: true });
  await titleField.fill("Reload draft");
  await titleField.press("Enter");
  await editor.fill("# Reload draft\n\nThis draft is written to a real file.");
  await expect(page).toHaveURL(/#\/d\/reload-draft-[a-z0-9]{6}/);
  const url = page.url();
  const id = url.slice(
    url.indexOf("reload-draft-") + "reload-draft-".length,
    url.indexOf("reload-draft-") + "reload-draft-".length + 6,
  );

  await expect
    .poll(() => readFile(page, "Reload draft.md"))
    .toBe("# Reload draft\n\nThis draft is written to a real file.");
  await expect.poll(() => readFile(page, "Untitled.md")).toBeNull();
  await expect.poll(() => readCatalog(page)).toContain(`"id": "${id}"`);
  await expect.poll(() => readCatalog(page)).toContain('"file": "Reload draft.md"');

  await page.reload();
  await expect(page).toHaveURL(new RegExp(`#/d/reload-draft-${id}`));
  const sidebar = page.getByRole("list", { name: "Documents", exact: true });
  await expect(sidebar.getByRole("button", { name: "Reload draft", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(editor).toContainText("This draft is written to a real file.");
  await editor.press("ControlOrMeta+End");
  await page.keyboard.type(" Still editable.");
  await expect
    .poll(() => readFile(page, "Reload draft.md"))
    .toBe("# Reload draft\n\nThis draft is written to a real file. Still editable.");

  await sidebar.getByRole("button", { name: "Delete Reading list", exact: true }).click();
  await page
    .getByRole("group", { name: /Reading list/ })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(sidebar.getByRole("button", { name: "Reading list", exact: true })).toHaveCount(0);
  await expect.poll(() => readFile(page, "Reading list.md")).toBeNull();

  await page.reload();
  await expect(editor).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Reading list", exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole("button", { name: "Reload draft", exact: true })).toBeVisible();
  await expect
    .poll(() => listFiles(page))
    .toEqual([
      "Project ideas.md",
      "Reload draft.md",
      "Weekly sync — product.md",
      "Welcome to emdy.md",
    ]);
});

test("files added or edited outside the app appear when the tab regains focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedLibrary(page);
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await expect(editor).toContainText("# Welcome to emdy");
  await expect.poll(() => readFile(page, "Reading list.md")).not.toBeNull();

  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const write = async (name: string, text: string) => {
      const handle = await root.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
    };
    await write("Reading list.md", "# Reading list\n\nEdited by another program.");
    await write("Dropped in.md", "# Dropped in\n\nA file copied in from outside.");
  });

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expect(page.getByRole("button", { name: "Dropped in", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reading list", exact: true }).click();
  await expect(editor).toContainText("Edited by another program.");
  await page.getByRole("button", { name: "Dropped in", exact: true }).click();
  await expect(editor).toContainText("A file copied in from outside.");
  await editor.press("ControlOrMeta+End");
  await page.keyboard.type(" Now edited here.");
  await expect
    .poll(() => readFile(page, "Dropped in.md"))
    .toBe("# Dropped in\n\nA file copied in from outside. Now edited here.");
});

test("several files removed outside the app at once stay removed", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedLibrary(page);
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  const sidebar = page.getByRole("list", { name: "Documents", exact: true });
  await expect(editor).toContainText("# Welcome to emdy");
  await expect.poll(() => readFile(page, "Project ideas.md")).not.toBeNull();

  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry("Reading list.md");
    await root.removeEntry("Project ideas.md");
  });

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expect(sidebar.getByRole("button", { name: "Reading list", exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole("button", { name: "Project ideas", exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/#\/d\/welcome-to-emdy-welcom/);

  await editor.press("ControlOrMeta+End");
  await page.keyboard.type(" Saved after the removal.");
  await expect
    .poll(() => readFile(page, "Welcome to emdy.md"))
    .toContain("Saved after the removal.");
  await expect
    .poll(() => listFiles(page))
    .toEqual(["Weekly sync — product.md", "Welcome to emdy.md"]);
  await expect.poll(() => readCatalog(page)).not.toContain("Reading list.md");
  await expect.poll(() => readCatalog(page)).not.toContain("Project ideas.md");

  await page.reload();
  await expect(editor).toContainText("Saved after the removal.");
  await expect(
    sidebar.getByRole("button", { name: "Weekly sync — product", exact: true }),
  ).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Reading list", exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole("button", { name: "Project ideas", exact: true })).toHaveCount(0);
  await expect
    .poll(() => listFiles(page))
    .toEqual(["Weekly sync — product.md", "Welcome to emdy.md"]);
});

test("the settings page lists preferences and storage and keeps the URL private", async ({
  page,
  requests,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.emulateMedia({ colorScheme: "light" });
  await seedLibrary(page);
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await expect(editor).toBeVisible();
  await expect(page).toHaveURL(/#\/d\/welcome-to-emdy-welcom\/welcome-to-emdy$/);
  const documentUrl = page.url();

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL(/\/#\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await expect(editor).toHaveCount(0);
  await expect(page.getByTestId("storage-location")).toHaveText("This browser");
  await expect(page.getByTestId("storage-usage")).toContainText("used");
  await expect(page.getByRole("button", { name: /folder/i })).toHaveCount(0);

  const themeGroup = page.getByRole("radiogroup", { name: "Appearance", exact: true });
  await themeGroup.getByRole("radio", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("radiogroup", { name: "View", exact: true })
    .getByRole("radio", { name: "Read-only preview", exact: true })
    .click();

  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(documentUrl);
  await expect(page.getByRole("document", { name: "Preview", exact: true })).toBeVisible();

  await page.goto("/#/settings");
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(themeGroup.getByRole("radio", { name: "Dark", exact: true })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByRole("button", { name: "Back to document", exact: true }).click();
  await expect(page).toHaveURL(/#\/d\//);
  await expect(page.getByRole("main", { name: "Document", exact: true })).toHaveAttribute(
    "data-layout",
    "reader",
  );

  const navigations = requests.filter((request) => request.resourceType === "document");
  expect(new Set(navigations.map((request) => request.url))).toEqual(
    new Set([new URL("/", page.url()).href]),
  );
  expect(requests.some((request) => request.url.includes("settings"))).toBe(false);
});

test("failed saves remain editable and the retry writes the latest content", async ({ page }) => {
  await seedLibrary(page);
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await expect(editor).toBeVisible();
  await page.evaluate(() => {
    const original = Object.getOwnPropertyDescriptor(
      FileSystemFileHandle.prototype,
      "createWritable",
    )!.value as FileSystemFileHandle["createWritable"];
    Object.defineProperty(window, "restoreStorageWrites", {
      value: () => {
        FileSystemFileHandle.prototype.createWritable = original;
      },
    });
    FileSystemFileHandle.prototype.createWritable = function (options) {
      if (this.name === "Welcome to emdy.md")
        return Promise.reject(new DOMException("Storage write failed", "QuotaExceededError"));
      return original.call(this, options);
    };
  });
  await editor.fill("# Welcome to emdy\n\nFirst unsaved edit");
  await expect(page.getByRole("alert")).toContainText("Couldn’t save your changes");
  await editor.fill("# Welcome to emdy\n\nLatest unsaved edit");
  await page.evaluate(() =>
    (window as unknown as { restoreStorageWrites(): void }).restoreStorageWrites(),
  );
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect
    .poll(() => readFile(page, "Welcome to emdy.md"))
    .toBe("# Welcome to emdy\n\nLatest unsaved edit");
  const url = page.url();
  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(editor).toContainText("Latest unsaved edit");
  await editor.press("ControlOrMeta+End");
  await page.keyboard.type(" After reload.");
  await expect
    .poll(() => readFile(page, "Welcome to emdy.md"))
    .toBe("# Welcome to emdy\n\nLatest unsaved edit After reload.");
});

test("an interrupted rename and edit recovers its identity without an unload journal", async ({
  page,
}) => {
  await seedLibrary(page);
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await expect(editor).toBeVisible();
  const now = Date.now();
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now + 1000);
  await page.evaluate(() => {
    const original = Object.getOwnPropertyDescriptor(
      FileSystemFileHandle.prototype,
      "createWritable",
    )!.value as FileSystemFileHandle["createWritable"];
    FileSystemFileHandle.prototype.createWritable = function (options) {
      if (this.name === "Recovered rename.md")
        return Promise.reject(new Error("Interrupted file write"));
      return original.call(this, options);
    };
  });
  await page
    .getByRole("button", { name: "Document title: Welcome to emdy. Click to rename" })
    .click();
  const title = page.getByRole("textbox", { name: "Document title", exact: true });
  await title.fill("Recovered rename");
  await title.press("Enter");
  await editor.fill("The renamed document's new content.");
  await page.clock.runFor(1500);
  await expect(page.getByRole("alert")).toContainText("Interrupted file write");
  const url = page.url();
  await expect(page).toHaveURL(/#\/d\/recovered-rename-welcom$/);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const root = await navigator.storage.getDirectory();
        const metadata = await root.getDirectoryHandle(".emdy");
        return (await (await metadata.getFileHandle("pending.json")).getFile()).text();
      }),
    )
    .toContain("The renamed document's new content.");
  await page.addInitScript(() => {
    for (const key of Object.keys(localStorage))
      if (key.startsWith("emdy:workspace:pending:")) localStorage.removeItem(key);
  });
  await page.reload();
  await expect(editor).toHaveText("The renamed document's new content.");
  await expect(page).toHaveURL(url);
  await expect(page.getByRole("button", { name: "Recovered rename", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect.poll(() => readFile(page, "Welcome to emdy.md")).toBeNull();
  await expect
    .poll(() => readFile(page, "Recovered rename.md"))
    .toBe("The renamed document's new content.");
  await editor.press("ControlOrMeta+End");
  await page.keyboard.type(" Still editable.");
  await page.clock.runFor(1500);
  await expect
    .poll(() => readFile(page, "Recovered rename.md"))
    .toBe("The renamed document's new content. Still editable.");
});

const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);

test("a catalog written before synced existed keeps its ids across a reload", async ({ page }) => {
  await seedLibrary(page);
  const sidebar = page.getByRole("list", { name: "Documents", exact: true });
  await sidebar.getByRole("button", { name: "Reading list", exact: true }).click();
  const route = /#\/d\/reading-list-readng(\/|$)/;
  await expect(page).toHaveURL(route);
  await expect.poll(() => readCatalog(page)).toContain('"synced"');
  const before = JSON.parse((await readCatalog(page))!) as {
    documents: { id: string; created: number }[];
  };
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const metadata = await root.getDirectoryHandle(".emdy");
    const handle = await metadata.getFileHandle("index.json");
    const catalog = JSON.parse(await (await handle.getFile()).text()) as {
      documents: Record<string, unknown>[];
    };
    for (const entry of catalog.documents) delete entry.synced;
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(catalog));
    await writable.close();
  });
  expect(await readCatalog(page)).not.toContain('"synced"');

  await page.reload();
  await expect(page).toHaveURL(route);
  await expect(sidebar.getByRole("button", { name: "Reading list", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await expect(editor).toContainText("# Reading list");
  await editor.press("ControlOrMeta+End");
  await page.keyboard.type(" Still editable.");
  await expect.poll(() => readFile(page, "Reading list.md")).toContain(" Still editable.");
  const after = JSON.parse((await readCatalog(page))!) as {
    documents: { id: string; created: number; synced?: number }[];
  };
  expect(after.documents.map(({ id, created }) => ({ id, created })).sort(byId)).toEqual(
    before.documents.map(({ id, created }) => ({ id, created })).sort(byId),
  );
  expect(after.documents.every((entry) => typeof entry.synced === "number")).toBe(true);
});

test("two stale tabs preserve both edits and share document identities", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedLibrary(page);
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await expect(editor).toBeVisible();
  const second = await context.newPage();
  await second.setViewportSize({ width: 1600, height: 900 });
  await second.goto("/");
  const otherEditor = second.getByRole("textbox", { name: "Markdown editor", exact: true });
  await expect(otherEditor).toBeVisible();
  const now = Date.now();
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now + 1000);
  await editor.fill("# Welcome to emdy\n\nEdit from the first tab");
  await otherEditor.fill("# Welcome to emdy\n\nEdit from the second tab");
  await page.clock.runFor(1500);
  await expect
    .poll(async () =>
      (
        await Promise.all([
          readFile(page, "Welcome to emdy.md"),
          readFile(page, "Welcome to emdy (conflict).md"),
        ])
      ).sort((a, b) => (a ?? "").localeCompare(b ?? "")),
    )
    .toEqual([
      "# Welcome to emdy\n\nEdit from the first tab",
      "# Welcome to emdy\n\nEdit from the second tab",
    ]);
  await second.getByRole("button", { name: "New document", exact: true }).click();
  await otherEditor.fill("From another tab\n\nA document from another tab");
  await second.clock.runFor(1500);
  await expect(second).toHaveURL(/#\/d\/from-another-tab-[a-z0-9]{6}$/);
  const newUrl = second.url();
  await expect
    .poll(() => readFile(second, "From another tab.md"))
    .toBe("From another tab\n\nA document from another tab");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByRole("button", { name: "From another tab", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "From another tab", exact: true }).click();
  await expect(page).toHaveURL(newUrl);
  await expect(editor).toContainText("A document from another tab");
  await page.reload();
  await expect(page).toHaveURL(newUrl);
  await expect(editor).toContainText("A document from another tab");
  await editor.press("ControlOrMeta+End");
  await page.keyboard.type(" Edited here.");
  await page.clock.runFor(1500);
  await expect
    .poll(() => readFile(page, "From another tab.md"))
    .toBe("From another tab\n\nA document from another tab Edited here.");
});

test("an idle tab cannot erase another tab's journal while its save waits for the lock", async ({
  page,
  context,
}) => {
  await seedLibrary(page);
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await expect(editor).toBeVisible();
  const url = new URL("/#/d/welcome-to-emdy-welcom", page.url()).href;
  const idle = await context.newPage();
  await idle.goto("/");
  await expect(idle.getByRole("textbox", { name: "Markdown editor", exact: true })).toBeVisible();
  await idle.evaluate(() => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    Object.defineProperty(window, "releaseStorageLock", { value: release });
    return new Promise<void>((resolve) => {
      void navigator.locks.request("emdy:library", async () => {
        resolve();
        await gate;
      });
    });
  });
  await editor.fill("Welcome to emdy\n\nRecovered from the owning tab's journal");
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await idle.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage)
          .filter((key) => key.startsWith("emdy:workspace:pending:"))
          .map((key) => localStorage.getItem(key))
          .join("\n"),
      ),
    )
    .toContain("Recovered from the owning tab's journal");
  await page.reload({ waitUntil: "domcontentloaded" });
  await idle.evaluate(() =>
    (window as unknown as { releaseStorageLock(): void }).releaseStorageLock(),
  );
  await expect(page).toHaveURL(url);
  await expect(editor).toContainText("Recovered from the owning tab's journal");
  await expect
    .poll(() => readFile(page, "Welcome to emdy.md"))
    .toBe("Welcome to emdy\n\nRecovered from the owning tab's journal");
  await editor.press("ControlOrMeta+End");
  await page.keyboard.type(" Still editable.");
  await expect
    .poll(() => readFile(page, "Welcome to emdy.md"))
    .toBe("Welcome to emdy\n\nRecovered from the owning tab's journal Still editable.");
});

test("the sidebar groups documents by their file timestamps and regroups them as days pass", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedLibrary(page);
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await expect(editor).toContainText("# Welcome to emdy");

  const today = page.getByRole("list", { name: "Today", exact: true });
  await expect(today.getByRole("button", { name: "Welcome to emdy", exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Older", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "New document", exact: true }).click();
  await page
    .getByRole("button", { name: "Document title: Untitled. Click to rename", exact: true })
    .click();
  const titleField = page.getByRole("textbox", { name: "Document title", exact: true });
  await titleField.fill("Dated draft");
  await titleField.press("Enter");
  await editor.fill("# Dated draft\n\nWritten today.");
  await expect.poll(() => readFile(page, "Dated draft.md")).toBe("# Dated draft\n\nWritten today.");
  await expect(today.getByRole("button", { name: "Dated draft", exact: true })).toBeVisible();

  const day = 24 * 60 * 60 * 1000;
  await page.clock.setFixedTime(Date.now() + 3 * day);
  await page.reload();
  await expect(editor).toContainText("Written today.");
  const lastWeek = page.getByRole("list", { name: "Last 7 days", exact: true });
  await expect(lastWeek.getByRole("button", { name: "Dated draft", exact: true })).toBeVisible();
  await expect(
    lastWeek.getByRole("button", { name: "Welcome to emdy", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("list", { name: "Today", exact: true })).toHaveCount(0);

  await editor.press("ControlOrMeta+End");
  await page.keyboard.type(" Edited three days later.");
  await expect(today.getByRole("button", { name: "Dated draft", exact: true })).toBeVisible();
  await expect(lastWeek.getByRole("button", { name: "Dated draft", exact: true })).toHaveCount(0);
  await expect(
    lastWeek.getByRole("button", { name: "Welcome to emdy", exact: true }),
  ).toBeVisible();
});

test("sidebar search finds text inside documents, opens results from the keyboard, and stays local", async ({
  page,
  requests,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await seedLibrary(page);
  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await expect(editor).toContainText("# Welcome to emdy");
  await expect(page.getByTestId("import-status")).toHaveCount(0);

  const search = page.getByRole("searchbox", { name: "Search documents", exact: true });
  await search.click();
  await page.keyboard.type("Ousterhout");
  const contents = page.getByRole("list", { name: "Contents", exact: true });
  const result = contents.getByRole("button", { name: "Reading list", exact: true });
  await expect(result).toBeVisible();
  await expect(result.locator("mark")).toHaveText("Ousterhout");
  await expect(page.getByRole("list", { name: "Documents", exact: true })).toHaveCount(0);

  await page.keyboard.press("Enter");
  await expect(editor).toContainText("A Philosophy of Software Design");
  await expect(editor).toBeFocused();
  await expect(result).toHaveAttribute("aria-current", "page");
  await expect(page).toHaveURL(/#\/d\/reading-list-readng\/reading-list$/);

  await search.click();
  await page.keyboard.press("Escape");
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  await expect(
    page
      .getByRole("list", { name: "Today", exact: true })
      .getByRole("button", { name: "Reading list", exact: true }),
  ).toBeVisible();

  await page.keyboard.type("no such phrase anywhere");
  await expect(
    page.getByRole("complementary", { name: "Sidebar", exact: true }).getByRole("status"),
  ).toHaveText("No documents match “no such phrase anywhere”.");

  await editor.click();
  await expect(editor).toBeFocused();
  await page.keyboard.press("ControlOrMeta+p");
  await expect(search).toBeFocused();
  await page.keyboard.type("Ousterhout");
  await expect(search).toHaveValue("Ousterhout");
  await expect(result).toBeVisible();

  await editor.click();
  await page.keyboard.press("ControlOrMeta+Shift+f");
  await expect(search).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+p");
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("");
  await expect(page.getByRole("button", { name: "Exit focus mode", exact: true })).toHaveCount(0);
  await page.keyboard.type("Ousterhout");
  await expect(result).toBeVisible();

  const leaks = requests.filter((request) =>
    ["ousterhout", "no such phrase", "no%20such%20phrase"].some((secret) =>
      `${request.url} ${request.referer ?? ""}`.toLowerCase().includes(secret),
    ),
  );
  expect(leaks, "search queries must never leave the browser").toEqual([]);
});
