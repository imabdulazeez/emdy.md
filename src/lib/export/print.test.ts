import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  buildPrintDocument,
  collectStyles,
  findPrintFrame,
  PRINT_FRAME_TITLE,
  PRINT_FONT_UI,
  PRINT_STYLES,
  printHtml,
} from "./print";

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("collectStyles", () => {
  it("copies stylesheet links and inline styles from the host document", () => {
    document.head.innerHTML =
      '<link rel="stylesheet" href="/assets/index.css"><style>.a{color:red}</style><link rel="icon" href="/favicon.ico">';
    const styles = collectStyles(document);
    expect(styles).toContain('<link rel="stylesheet" href="/assets/index.css">');
    expect(styles).toContain("<style>.a{color:red}</style>");
    expect(styles).not.toContain("favicon");
  });
});

describe("buildPrintDocument", () => {
  it("wraps the rendered html in a light-themed page with the title and print styles", () => {
    const html = buildPrintDocument("Notes & <plans>", "<h1>Hi</h1>", "<style>.x{}</style>", "fr");
    expect(html).toContain('<html lang="fr" data-theme="light" data-font="sans">');
    expect(html).toContain("<title>Notes &amp; &lt;plans&gt;</title>");
    expect(html).toContain("<style>.x{}</style>");
    expect(html).toContain(PRINT_STYLES);
    expect(html).toContain('<article class="preview-content"><h1>Hi</h1></article>');
    expect(html.indexOf("<style>.x{}</style>")).toBeLessThan(html.indexOf(PRINT_STYLES));
  });

  it("lets printed code wrap inside its block instead of growing to its longest line", () => {
    expect(PRINT_STYLES).toMatch(/\.preview-content pre code \{\s*width: auto;\s*\}/);
  });

  it("swaps the unembeddable system-ui face for one that prints as selectable text", () => {
    expect(PRINT_FONT_UI).not.toMatch(/system-ui|-apple-system/);
    expect(PRINT_STYLES).toContain(`:root { --font-ui: ${PRINT_FONT_UI}; }`);
  });

  it("carries the document font so the printed page uses the same system face", () => {
    expect(buildPrintDocument("T", "", "", "en", "handwriting")).toContain(
      '<html lang="en" data-theme="light" data-font="handwriting">',
    );
    expect(buildPrintDocument("T", "", "", "en", '"x')).toContain('data-font="&quot;x"');
  });
});

describe("printHtml", () => {
  afterEach(() => {
    delete document.documentElement.dataset.font;
  });

  it("uses the document font set on the host page", async () => {
    document.documentElement.dataset.font = "serif";
    void printHtml("Plan", "<p>Body</p>");
    expect(findPrintFrame(document)!.srcdoc).toContain('data-font="serif"');
  });

  it("prints the document from an off-screen frame once it has loaded", async () => {
    document.documentElement.lang = "en";
    const pending = printHtml("Plan", "<p>Body</p>");
    const frame = findPrintFrame(document)!;
    expect(frame).not.toBeNull();
    expect(frame.title).toBe(PRINT_FRAME_TITLE);
    expect(frame.getAttribute("aria-hidden")).toBe("true");
    expect(frame.tabIndex).toBe(-1);
    expect(frame.style.opacity).toBe("0");
    expect(frame.srcdoc).toContain("<title>Plan</title>");
    expect(frame.srcdoc).toContain('<article class="preview-content"><p>Body</p></article>');
    const print = vi.fn();
    Object.defineProperty(frame.contentWindow!, "print", { value: print, configurable: true });
    frame.dispatchEvent(new Event("load"));
    await expect(pending).resolves.toBe(frame);
    expect(print).toHaveBeenCalledTimes(1);
    expect(frame.isConnected).toBe(true);
    frame.contentWindow!.dispatchEvent(new Event("afterprint"));
    expect(frame.isConnected).toBe(false);
  });

  it("replaces a previous print frame instead of stacking them", async () => {
    const first = printHtml("One", "<p>1</p>");
    const firstFrame = findPrintFrame(document)!;
    Object.defineProperty(firstFrame.contentWindow!, "print", { value: vi.fn() });
    firstFrame.dispatchEvent(new Event("load"));
    await first;
    const second = printHtml("Two", "<p>2</p>");
    expect(firstFrame.isConnected).toBe(false);
    const secondFrame = findPrintFrame(document)!;
    Object.defineProperty(secondFrame.contentWindow!, "print", { value: vi.fn() });
    secondFrame.dispatchEvent(new Event("load"));
    await second;
    expect(document.querySelectorAll("iframe")).toHaveLength(1);
  });
});
