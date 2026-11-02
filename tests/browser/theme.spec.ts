import type { Page } from "@playwright/test";
import { test, expect, seedLibrary } from "./fixtures";

declare global {
  interface Window {
    __themes: string[];
    __transitions: string[];
    __crossfades: number;
    __firstPaint?: { theme?: string; background: string };
    __firstText?: { background: string };
  }
}

const DARK = { canvas: "rgb(18, 18, 19)", surface: "rgb(27, 27, 29)" };
const LIGHT = { canvas: "rgb(233, 232, 227)" };

async function instrument(page: Page) {
  await page.addInitScript(() => {
    window.__themes = [];
    window.__transitions = [];
    window.__crossfades = 0;
    new MutationObserver(() => {
      const theme = document.documentElement?.dataset.theme;
      if (theme && window.__themes.at(-1) !== theme) window.__themes.push(theme);
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-theme"] });
    document.addEventListener(
      "transitionrun",
      (event) => {
        const target = event.target as Element;
        window.__transitions.push(`${event.propertyName} on ${target.className}`);
      },
      true,
    );
    const start = document.startViewTransition?.bind(document);
    if (start) {
      document.startViewTransition = ((update: () => void) => {
        window.__crossfades += 1;
        return start(update);
      }) as typeof document.startViewTransition;
    }
    requestAnimationFrame(() => {
      window.__firstPaint = {
        theme: document.documentElement.dataset.theme,
        background: getComputedStyle(document.documentElement).backgroundColor,
      };
    });
    new MutationObserver((_, observer) => {
      const app = document.getElementById("app");
      if (!app?.textContent) return;
      observer.disconnect();
      window.__firstText = {
        background: getComputedStyle(document.body).backgroundColor,
      };
    }).observe(document, { childList: true, subtree: true });
  });
}

const nextFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

async function settle(page: Page, theme: string) {
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", theme);
  await expect(html).not.toHaveAttribute("data-no-transitions");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (animation) =>
                animation.playState === "running" &&
                ((animation as CSSTransition).transitionProperty !== undefined ||
                  (animation.effect as KeyframeEffect | null)?.pseudoElement?.includes(
                    "view-transition",
                  )),
            ).length,
      ),
    )
    .toBe(0);
  await nextFrames(page);
}

const TRANSITIONING =
  ".icon-button, .segment, .outline-entry, [data-sidebar='menu-button'], [aria-label='Documents'] button";

const readColours = (page: Page) =>
  page.evaluate(
    (selector) =>
      [...document.querySelectorAll(selector), document.body].map((element) => {
        const style = getComputedStyle(element);
        return `${style.color} ${style.backgroundColor}`;
      }),
    TRANSITIONING,
  );

const coloursOnSwitch = (page: Page) =>
  page.evaluate(
    (selector) =>
      new Promise<string[]>((resolve) => {
        const observer = new MutationObserver(() => {
          observer.disconnect();
          requestAnimationFrame(() =>
            resolve(
              [...document.querySelectorAll(selector), document.body].map((element) => {
                const style = getComputedStyle(element);
                return `${style.color} ${style.backgroundColor}`;
              }),
            ),
          );
        });
        observer.observe(document.documentElement, { attributeFilter: ["data-theme"] });
      }),
    TRANSITIONING,
  );

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await instrument(page);
});

test("switching theme repaints every region at once without running CSS transitions", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await seedLibrary(page);
  await expect(page.getByRole("textbox", { name: "Markdown editor", exact: true })).toBeVisible();
  const dark = page.getByRole("button", { name: "Dark theme", exact: true });
  await dark.hover();
  await settle(page, "light");
  await page.evaluate(() => (window.__transitions = []));

  const before = await readColours(page);
  expect(before.length).toBeGreaterThan(20);
  const firstFrame = coloursOnSwitch(page);
  await dark.click();
  const switched = await firstFrame;
  await settle(page, "dark");
  expect(switched, "the first dark frame should already show the final colours").toEqual(
    await readColours(page),
  );
  expect(switched).not.toEqual(before);
  await expect(page.locator("body")).toHaveCSS("background-color", DARK.canvas);
  await expect(page.getByTestId("document-sheet")).toHaveCSS("background-color", DARK.surface);
  expect(await page.evaluate(() => window.__transitions)).toEqual([]);
  expect(await page.evaluate(() => window.__crossfades)).toBe(1);
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");

  const light = page.getByRole("button", { name: "Light theme", exact: true });
  await light.hover();
  await settle(page, "dark");
  await page.evaluate(() => (window.__transitions = []));
  await light.click();
  await settle(page, "light");
  expect(await page.evaluate(() => window.__transitions)).toEqual([]);
  expect(await page.evaluate(() => window.__crossfades)).toBe(2);
  await expect(page.locator("body")).toHaveCSS("background-color", LIGHT.canvas);

  const outlineEntry = page
    .getByRole("navigation", { name: "Outline", exact: true })
    .getByRole("button")
    .first();
  await outlineEntry.hover();
  await expect
    .poll(() => page.evaluate(() => window.__transitions.length), {
      message: "hover transitions must still run once the theme has settled",
    })
    .toBeGreaterThan(0);
});

test("reduced motion swaps the theme instantly without a crossfade", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await seedLibrary(page);
  await expect(page.getByRole("textbox", { name: "Markdown editor", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await settle(page, "dark");
  expect(await page.evaluate(() => window.__crossfades)).toBe(0);
  await expect(page.locator("body")).toHaveCSS("background-color", DARK.canvas);
});

test("following the system theme flips cleanly while the app is open", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await seedLibrary(page);
  await expect(page.getByRole("textbox", { name: "Markdown editor", exact: true })).toBeVisible();
  await settle(page, "light");
  await page.evaluate(() => (window.__transitions = []));

  await page.emulateMedia({ colorScheme: "dark" });
  await settle(page, "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", DARK.canvas);
  await page.emulateMedia({ colorScheme: "light" });
  await settle(page, "light");
  expect(await page.evaluate(() => window.__transitions)).toEqual([]);
  expect(await page.evaluate(() => window.__themes)).toEqual(["light", "dark", "light"]);
});

for (const { name, system, stored, expected } of [
  { name: "a dark system with no stored choice", system: "dark", stored: null, expected: "dark" },
  {
    name: "a stored dark choice on a light system",
    system: "light",
    stored: "dark",
    expected: "dark",
  },
  {
    name: "a stored light choice on a dark system",
    system: "dark",
    stored: "light",
    expected: "light",
  },
] as const) {
  test(`the first frame is already themed for ${name}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: system });
    await seedLibrary(page);
    await expect(page.getByRole("textbox", { name: "Markdown editor", exact: true })).toBeVisible();
    if (stored) {
      await page.evaluate((value) => {
        localStorage.setItem("emdy:pref:theme", JSON.stringify(value));
      }, stored);
    }
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Markdown editor", exact: true })).toBeVisible();
    await settle(page, expected);

    const canvas = expected === "dark" ? DARK.canvas : LIGHT.canvas;
    expect(await page.evaluate(() => window.__themes)).toEqual([expected]);
    expect(await page.evaluate(() => window.__firstPaint)).toEqual({
      theme: expected,
      background: canvas,
    });
    expect(await page.evaluate(() => window.__firstText?.background)).toBe(canvas);
    expect(await page.evaluate(() => window.__transitions)).toEqual([]);
  });
}

test("every face is a system font, so no font file is preloaded or requested", async ({
  page,
  requests,
}) => {
  await seedLibrary(page);
  await expect(page.getByRole("textbox", { name: "Markdown editor", exact: true })).toBeVisible();

  await expect(page.locator('link[rel="preload"][as="font"]')).toHaveCount(0);
  expect(requests.filter((request) => request.resourceType === "font")).toEqual([]);
  expect(await page.evaluate(() => document.fonts.size)).toBe(0);
});

for (const { scheme, selection } of [
  { scheme: "dark", selection: "rgb(43, 53, 102)" },
  { scheme: "light", selection: "rgb(216, 223, 250)" },
] as const) {
  test(`a focused ${scheme} selection uses the theme's selection colour`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await seedLibrary(page);
    const editor = page.getByRole("textbox", { name: "Markdown editor", exact: true });
    await expect(editor).toBeVisible();
    await settle(page, scheme);

    await editor.locator(".cm-line").first().click();
    await page.keyboard.press("End");
    await page.keyboard.press("Shift+Home");

    const highlight = page.locator(".cm-editor.cm-focused .cm-selectionBackground").first();
    await expect(highlight).toBeVisible();
    await expect(highlight).toHaveCSS("background-color", selection);
  });
}
