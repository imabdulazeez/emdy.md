import { test, expect, readLibraryFile, seedLibrary } from "./fixtures";

test.describe("in a time zone far ahead of UTC", () => {
  test.use({ timezoneId: "Pacific/Kiritimati" });

  test("@ and / insert local dates, links, and blocks from the keyboard in both editing layouts", async ({
    page,
  }) => {
    // 11:30 UTC on 28 September is 01:30 on 29 September in Kiritimati (UTC+14).
    await page.clock.install({ time: new Date("2026-09-28T11:30:00Z") });
    await seedLibrary(page);
    await page.getByRole("button", { name: "New document", exact: true }).click();
    const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
    await editor.click();
    await page.clock.pauseAt(new Date("2026-09-28T11:31:00Z"));

    const menu = page.getByRole("listbox", { name: "Completions" });
    // The menu opens after a short typing pause and ignores Enter for a moment once open,
    // so the clock runs past both before the key is pressed.
    const choose = async (typed: string, option: RegExp) => {
      await page.keyboard.type(typed);
      await page.clock.runFor(300);
      await expect(menu.getByRole("option", { name: option })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await page.keyboard.press("Enter");
      await expect(menu).toHaveCount(0);
    };

    await choose("Due @tod", /^Today/);
    await expect(editor).toContainText("Due 2026-09-29");

    await choose(" with @read", /^Reading list/);
    await expect(editor).toContainText("Due 2026-09-29 with [Reading list](Reading%20list.md)");

    await page.keyboard.type("\n\n## Plan\n\n");
    await choose("See @#pla", /^Plan/);
    await expect(editor).toContainText("See [Plan](#plan)");

    await page.keyboard.type("\n\n");
    await choose("/heading 2", /^Heading 2/);
    await page.keyboard.type("Wrap-up");
    await expect(editor).toContainText("## Wrap-up");

    await page.keyboard.type("\n\n@");
    await page.clock.runFor(300);
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await page.keyboard.press("Backspace");

    await page.keyboard.press("ControlOrMeta+2");
    await expect(page.getByTestId("editor")).toHaveAttribute("data-editor-mode", "preview");
    await editor.press("ControlOrMeta+End");
    await choose("Ship @tom", /^Tomorrow/);
    await expect(editor).toContainText("Ship 2026-09-30");
    await page.keyboard.type("\n\n");
    await choose("/bullet", /^Bullet list/);
    await page.keyboard.type("Last item");

    await page.keyboard.press("ControlOrMeta+1");
    await expect(editor).toContainText("Ship 2026-09-30");
    await expect(editor).toContainText("- Last item");
    await page.clock.resume();
  });

  test("@ in the document title inserts the local date where the caret is", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-09-28T11:30:00Z") });
    await seedLibrary(page);
    await page
      .getByRole("button", {
        name: "Document title: Welcome to emdy. Click to rename",
        exact: true,
      })
      .click();
    const titleBox = page.getByRole("textbox", { name: "Document title", exact: true });
    await titleBox.fill("Journal review");
    await titleBox.press("Home");
    for (let step = 0; step < "Journal ".length; step++) await titleBox.press("ArrowRight");
    await page.keyboard.type("@tod");

    const dates = page.getByRole("listbox", { name: "Dates", exact: true });
    const today = dates.getByRole("option", { name: /^Today/ });
    await expect(today).toContainText("2026-09-29");
    await expect(today).toHaveAttribute("aria-selected", "true");
    await expect(titleBox).toHaveAttribute(
      "aria-activedescendant",
      (await today.getAttribute("id"))!,
    );
    const field = await titleBox.boundingBox();
    const menu = await dates.boundingBox();
    expect(menu!.y).toBeGreaterThanOrEqual(field!.y + field!.height);

    await page.keyboard.press("Enter");
    await expect(dates).toHaveCount(0);
    await expect(titleBox).toBeFocused();
    await expect(titleBox).toHaveValue("Journal 2026-09-29review");
    await page.keyboard.type(" ");
    await expect(titleBox).toHaveValue("Journal 2026-09-29 review");

    await page.keyboard.type("@");
    await expect(dates).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dates).toHaveCount(0);
    await expect(titleBox).toHaveValue("Journal 2026-09-29 @review");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("button", {
        name: "Document title: Journal 2026-09-29 review. Click to rename",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("list", { name: "Documents", exact: true })
        .getByRole("button", { name: "Journal 2026-09-29 review", exact: true }),
    ).toHaveAttribute("aria-current", "page");
  });
});

test("document links open from the read-only preview without a request and follow a rename", async ({
  page,
  requests,
}) => {
  await page.setViewportSize({ width: 1400, height: 800 });
  await seedLibrary(page);
  await page.getByRole("button", { name: "New document", exact: true }).click();
  await page
    .getByRole("button", { name: "Document title: Untitled. Click to rename", exact: true })
    .click();
  const titleBox = page.getByRole("textbox", { name: "Document title", exact: true });
  await titleBox.fill("Zebra links hub");
  await titleBox.press("Enter");

  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  const menu = page.getByRole("listbox", { name: "Completions" });
  await editor.click();
  await page.keyboard.insertText(
    `\n\n${"A paragraph that pushes the section below the fold.\n\n".repeat(60)}## Quokka details\n\nThe end.`,
  );
  await editor.press("ControlOrMeta+Home");
  await page.keyboard.type("Next: @read");
  await menu.getByRole("option", { name: /^Reading list/ }).click();
  await page.keyboard.type(" and @#quok");
  await menu.getByRole("option", { name: /^Quokka details/ }).click();
  await expect(editor).toContainText(
    "Next: [Reading list](Reading%20list.md) and [Quokka details](#quokka-details)",
  );

  await page.keyboard.press("ControlOrMeta+3");
  const preview = page.getByRole("document", { name: "Preview", exact: true });
  const heading = preview.getByRole("heading", { name: "Quokka details", exact: true });
  await expect(heading).not.toBeInViewport();
  await preview.getByRole("link", { name: "Quokka details", exact: true }).click();
  await expect(page).toHaveURL(/\/#\/d\/zebra-links-hub-[a-z0-9]{6}\/quokka-details$/);
  await expect(heading).toBeInViewport();

  const documentsList = page.getByRole("list", { name: "Documents", exact: true });
  await preview.hover();
  await expect(async () => {
    await page.mouse.wheel(0, -2_000);
    expect(await page.locator(".cm-scroller").evaluate((element) => element.scrollTop)).toBe(0);
  }).toPass();
  await preview.getByRole("link", { name: "Reading list", exact: true }).click();
  await expect(page).toHaveURL(/\/#\/d\/reading-list-readng(?:\/[a-z0-9-]+)?$/);
  await expect(
    documentsList.getByRole("button", { name: "Reading list", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    preview.getByRole("heading", { level: 1, name: "Reading list", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/#\/d\/zebra-links-hub-[a-z0-9]{6}(?:\/[a-z0-9-]+)?$/);
  await expect(
    documentsList.getByRole("button", { name: "Zebra links hub", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  const secrets = ["zebra", "quokka", "reading", "readng"];
  const leaks = requests.filter((request) =>
    secrets.some((secret) =>
      `${request.url} ${request.referer ?? ""}`.toLowerCase().includes(secret),
    ),
  );
  expect(leaks, "no request line or Referer header may carry a linked document").toEqual([]);
  const navigations = requests.filter((request) => request.resourceType === "document");
  expect(new Set(navigations.map((request) => request.url))).toEqual(
    new Set([new URL("/", page.url()).href]),
  );

  await page.keyboard.press("ControlOrMeta+1");
  await documentsList.getByRole("button", { name: "Reading list", exact: true }).click();
  await page
    .getByRole("button", { name: "Document title: Reading list. Click to rename", exact: true })
    .click();
  await titleBox.fill("Books to read (2026)");
  await titleBox.press("Enter");
  await documentsList.getByRole("button", { name: "Zebra links hub", exact: true }).click();
  await expect(editor).toContainText(
    "Next: [Books to read (2026)](Books%20to%20read%20%282026%29.md) and [Quokka details](#quokka-details)",
  );
  await expect
    .poll(() => readLibraryFile(page, "Zebra links hub.md"))
    .toContain("[Books to read (2026)](Books%20to%20read%20%282026%29.md)");

  await page.keyboard.press("ControlOrMeta+3");
  await preview.getByRole("link", { name: "Books to read (2026)", exact: true }).click();
  await expect(page).toHaveURL(/\/#\/d\/books-to-read-2026-readng(?:\/[a-z0-9-]+)?$/);
  await expect(
    preview.getByRole("heading", { level: 1, name: "Reading list", exact: true }),
  ).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/#\/d\/zebra-links-hub-[a-z0-9]{6}(?:\/[a-z0-9-]+)?$/);
  const books = preview.getByRole("link", { name: "Books to read (2026)", exact: true });
  await books.focus();
  await expect(books).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/#\/d\/books-to-read-2026-readng(?:\/[a-z0-9-]+)?$/);
  await expect(
    preview.getByRole("heading", { level: 1, name: "Reading list", exact: true }),
  ).toBeVisible();
  await expect(editor).toHaveCount(0);
});

test("a relative link in a table cell opens in the app from the editable preview without a request", async ({
  page,
  context,
  requests,
}) => {
  await page.setViewportSize({ width: 1400, height: 800 });
  await seedLibrary(page);
  await page.getByRole("button", { name: "New document", exact: true }).click();
  await page
    .getByRole("button", { name: "Document title: Untitled. Click to rename", exact: true })
    .click();
  const titleBox = page.getByRole("textbox", { name: "Document title", exact: true });
  await titleBox.fill("Yak table hub");
  await titleBox.press("Enter");

  const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
  await editor.click();
  await page.keyboard.insertText(
    "Intro\n\n| Doc | Site |\n| - | - |\n| [Reading list](Reading%20list.md) | [Site](https://example.com) |\n\nAfter",
  );
  await page.keyboard.press("ControlOrMeta+2");
  const table = editor.getByRole("table");
  await expect(table).toBeVisible();
  const link = table.getByRole("link", { name: "Reading list", exact: true });
  await expect(link).not.toHaveAttribute("href");
  await expect(table.getByRole("link", { name: "Site", exact: true })).toHaveAttribute(
    "href",
    "https://example.com",
  );
  const hubURL = page.url();

  const pages = context.pages().length;
  await link.click({ button: "middle" });
  await expect(page).toHaveURL(hubURL);
  expect(context.pages()).toHaveLength(pages);

  await link.click();
  await expect(page).toHaveURL(/\/#\/d\/reading-list-readng(?:\/[a-z0-9-]+)?$/);
  const documentsList = page.getByRole("list", { name: "Documents", exact: true });
  await expect(
    documentsList.getByRole("button", { name: "Reading list", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(editor.locator(".cm-live-h1")).toHaveText("Reading list");
  await expect(page.getByRole("grid")).toHaveCount(0);

  await page.goBack();
  await expect(page).toHaveURL(hubURL);
  await expect(link).toBeVisible();

  const secrets = ["yak", "reading", "readng", "%20list"];
  const leaks = requests.filter((request) =>
    secrets.some((secret) =>
      `${request.url} ${request.referer ?? ""}`.toLowerCase().includes(secret),
    ),
  );
  expect(leaks, "no request line or Referer header may carry a linked document").toEqual([]);
  const navigations = requests.filter((request) => request.resourceType === "document");
  expect(new Set(navigations.map((request) => request.url))).toEqual(
    new Set([new URL("/", page.url()).href]),
  );
});
