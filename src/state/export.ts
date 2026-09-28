import { createSignal, untrack } from "solid-js";
import { downloadBlob } from "~/lib/download";
import {
  DOCX_EXTENSION,
  DOCX_MIME_TYPE,
  exportFilename,
  MARKDOWN_MIME_TYPE,
} from "~/lib/export/filename";
import { printHtml } from "~/lib/export/print";
import { getRenderClient } from "~/lib/preview/render-client";
import { MARKDOWN_EXTENSION } from "~/lib/storage/filenames";
import { activeDocument } from "./document";
import { editorApi } from "./editor-api";
import { documentFontPreference, WORD_FONTS } from "./typography";

export type ExportFormat = "markdown" | "docx" | "pdf";

export interface ExportFormatOption {
  id: ExportFormat;
  label: string;
}

export const EXPORT_FORMATS: readonly ExportFormatOption[] = [
  { id: "markdown", label: "Markdown (.md)" },
  { id: "docx", label: "Word document (.docx)" },
  { id: "pdf", label: "PDF…" },
];

const [exportError, setExportError] = createSignal<string | null>(null);

export { exportError };

export function dismissExportError(): void {
  setExportError(null);
}

export function resetExportState(): void {
  setExportError(null);
}

export interface ExportTarget {
  title: string;
  text: string;
}

export interface ExportHost {
  render(text: string): Promise<string>;
  download(name: string, blob: Blob): void;
  print(title: string, html: string): Promise<unknown>;
}

type DocxModule = typeof import("~/lib/export/docx");

let docxModule: Promise<DocxModule> | null = null;

function loadDocx(): Promise<DocxModule> {
  docxModule ??= import("~/lib/export/docx").catch((error: unknown) => {
    docxModule = null;
    throw error;
  });
  return docxModule;
}

export function prepareExport(): void {
  getRenderClient();
  loadDocx().catch(() => undefined);
}

const browserHost = (): ExportHost => ({
  render: (text) => getRenderClient().render(text),
  download: (name, blob) => downloadBlob(name, blob),
  print: (title, html) => printHtml(title, html),
});

async function wordFile(target: ExportTarget, host: ExportHost): Promise<Blob> {
  const [html, { htmlToDocx }] = await Promise.all([host.render(target.text), loadDocx()]);
  const bytes = htmlToDocx(html, {
    title: target.title,
    font: WORD_FONTS[documentFontPreference.peek()],
  });
  return new Blob([bytes as BlobPart], { type: DOCX_MIME_TYPE });
}

export function activeExportTarget(): ExportTarget | null {
  const doc = untrack(activeDocument);
  if (!doc.id) return null;
  return { title: doc.title, text: untrack(editorApi)?.getText() ?? doc.text };
}

export async function exportDocument(
  target: ExportTarget,
  format: ExportFormat,
  host: ExportHost = browserHost(),
): Promise<void> {
  switch (format) {
    case "markdown":
      host.download(
        exportFilename(target.title, MARKDOWN_EXTENSION),
        new Blob([target.text], { type: MARKDOWN_MIME_TYPE }),
      );
      return;
    case "docx":
      host.download(exportFilename(target.title, DOCX_EXTENSION), await wordFile(target, host));
      return;
    case "pdf":
      await host.print(target.title, await host.render(target.text));
      return;
    default:
      return;
  }
}

export async function exportActiveDocument(
  format: ExportFormat,
  host: ExportHost = browserHost(),
): Promise<boolean> {
  const target = activeExportTarget();
  if (!target) return false;
  setExportError(null);
  try {
    await exportDocument(target, format, host);
    return true;
  } catch (error) {
    setExportError(error instanceof Error ? error.message : "Export failed.");
    return false;
  }
}
