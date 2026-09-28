import { definePreference } from "./preferences";

export const DOCUMENT_FONTS = ["sans", "serif", "mono", "handwriting"] as const;
export type DocumentFont = (typeof DOCUMENT_FONTS)[number];

export const DOCUMENT_FONT_LABELS: Record<DocumentFont, string> = {
  sans: "Sans",
  serif: "Serif",
  mono: "Mono",
  handwriting: "Handwriting",
};

export const WORD_FONTS: Record<DocumentFont, string> = {
  sans: "Arial",
  serif: "Georgia",
  mono: "Consolas",
  handwriting: "Segoe Print",
};

export function isDocumentFont(value: unknown): value is DocumentFont {
  return typeof value === "string" && (DOCUMENT_FONTS as readonly string[]).includes(value);
}

export const documentFontPreference = definePreference<DocumentFont>({
  name: "font",
  label: "Document font",
  fallback: "sans",
  parse: isDocumentFont,
  control: { kind: "choice", options: DOCUMENT_FONTS, labels: DOCUMENT_FONT_LABELS },
});

const documentFont = documentFontPreference.value;

export { documentFont };

export function setDocumentFont(font: DocumentFont): void {
  documentFontPreference.set(font);
}

export function applyFontAttribute(
  font: DocumentFont,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.font = font;
}
