import "~/components/preview.css";

export const PRINT_FRAME_TITLE = "Print preview";

export const PRINT_FONT_UI =
  '"Helvetica Neue", Helvetica, "Segoe UI", Roboto, Arial, "Noto Sans", sans-serif';

export const PRINT_STYLES = `
@page { margin: 20mm; }
:root { --font-ui: ${PRINT_FONT_UI}; }
html, body {
  height: auto;
  overflow: visible;
  background: var(--color-surface);
}
body { margin: 0; }
.preview-content {
  max-width: none;
  margin: 0;
  padding: 0;
}
.preview-content h1, .preview-content h2, .preview-content h3,
.preview-content h4, .preview-content h5, .preview-content h6 {
  break-after: avoid;
}
.preview-content pre, .preview-content table, .preview-content blockquote,
.preview-content img, .preview-content figure {
  break-inside: avoid;
}
.preview-content pre {
  white-space: pre-wrap;
  overflow: visible;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
.preview-content pre code {
  width: auto;
}
.preview-content code {
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
`;

const FRAME_STYLE =
  "position:fixed;left:-200vw;top:0;width:100vw;height:100vh;border:0;opacity:0;pointer-events:none";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      default:
        return "&quot;";
    }
  });

export function collectStyles(source: Document): string {
  return Array.from(source.querySelectorAll('link[rel="stylesheet"], style'))
    .map((element) => element.outerHTML)
    .join("\n");
}

export function buildPrintDocument(
  title: string,
  html: string,
  styles: string,
  lang = "en",
  font = "sans",
): string {
  return [
    "<!doctype html>",
    `<html lang="${escapeHtml(lang)}" data-theme="light" data-font="${escapeHtml(font)}">`,
    "<head>",
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    styles,
    `<style>${PRINT_STYLES}</style>`,
    "</head>",
    "<body>",
    `<article class="preview-content">${html}</article>`,
    "</body>",
    "</html>",
  ].join("\n");
}

export function findPrintFrame(host: Document): HTMLIFrameElement | null {
  return host.querySelector<HTMLIFrameElement>("iframe[data-print-frame]");
}

export async function printHtml(
  title: string,
  html: string,
  host: Document = document,
): Promise<HTMLIFrameElement> {
  findPrintFrame(host)?.remove();
  const frame = host.createElement("iframe");
  frame.title = PRINT_FRAME_TITLE;
  frame.tabIndex = -1;
  frame.setAttribute("aria-hidden", "true");
  frame.dataset.printFrame = "true";
  frame.style.cssText = FRAME_STYLE;
  const loaded = new Promise<void>((resolve) =>
    frame.addEventListener("load", () => resolve(), { once: true }),
  );
  frame.srcdoc = buildPrintDocument(
    title,
    html,
    collectStyles(host),
    host.documentElement.lang || "en",
    host.documentElement.dataset.font || "sans",
  );
  host.body.append(frame);
  await loaded;
  const target = frame.contentWindow;
  if (!target) {
    frame.remove();
    throw new Error("Couldn’t open the print preview.");
  }
  await target.document.fonts?.ready;
  target.addEventListener("afterprint", () => frame.remove(), { once: true });
  target.print();
  return frame;
}
