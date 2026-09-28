import { sanitizeStem } from "~/lib/storage/filenames";

export const MARKDOWN_MIME_TYPE = "text/markdown";
export const DOCX_EXTENSION = ".docx";
export const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function exportFilename(title: string, extension: string): string {
  return `${sanitizeStem(title)}${extension}`;
}
