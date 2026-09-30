import { expect, test } from "@playwright/test";
import { createSandbox, launchDesktop, type DesktopSandbox, type DesktopSession } from "./app";

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

test("the macOS title bar is part of the app and the window drags by its chrome", async () => {
  test.skip(process.platform !== "darwin", "The native frame is kept on Windows and Linux");
  session = await launchDesktop(sandbox);
  const { page, app } = session;

  await expect(page.locator("html")).toHaveAttribute("data-desktop", "darwin");
  const bounds = await app.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();
    return { content: window.getContentBounds(), frame: window.getBounds() };
  });
  expect(bounds.content.height).toBe(bounds.frame.height);

  const header = page.getByText("emdy.md", { exact: true }).locator("..");
  const logo = header.locator("svg[data-logo]");
  const logoBox = await logo.boundingBox();
  expect(logoBox!.x).toBeGreaterThanOrEqual(92);

  const toolbar = page.getByRole("banner", { name: "Toolbar" });
  const regionOf = (locator: typeof header) =>
    locator.evaluate((el) => getComputedStyle(el).getPropertyValue("-webkit-app-region"));
  expect(await regionOf(header)).toBe("drag");
  expect(await regionOf(toolbar)).toBe("drag");
  expect(
    await regionOf(page.getByRole("button", { name: "New document", exact: true }).first()),
  ).toBe("no-drag");

  await expect(page.getByRole("button", { name: /^(Hide|Show) sidebar$/ })).toHaveCount(0);
  await expect(logo).toBeVisible();
});
