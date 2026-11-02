export const MARKDOWN_EXTENSION = ".md";
export const MARKDOWN_EXTENSIONS = [MARKDOWN_EXTENSION, ".markdown"] as const;
export const FALLBACK_STEM = "Untitled";
export const MAX_STEM_BYTES = 200;

const FORBIDDEN_CHARACTERS = /[<>:"/\\|?*\p{Cc}]/gu;
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const encoder = new TextEncoder();

export function isMarkdownFile(name: string): boolean {
  return !name.startsWith(".") && name.toLowerCase().endsWith(MARKDOWN_EXTENSION);
}

export function markdownExtension(name: string): string | null {
  const lower = name.toLowerCase();
  const match = MARKDOWN_EXTENSIONS.find(
    (extension) => lower.endsWith(extension) && name.length > extension.length,
  );
  return match ? name.slice(name.length - match.length) : null;
}

function truncateToBytes(value: string, limit: number): string {
  if (encoder.encode(value).length <= limit) return value;
  let result = "";
  for (const character of value) {
    const next = result + character;
    if (encoder.encode(next).length > limit) break;
    result = next;
  }
  return result.trimEnd();
}

export function sanitizeStem(title: string): string {
  let stem = title
    .normalize("NFC")
    .replace(FORBIDDEN_CHARACTERS, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "");
  if (RESERVED_NAMES.test(stem)) stem = `${stem}_`;
  stem = truncateToBytes(stem, MAX_STEM_BYTES);
  return stem.length > 0 ? stem : FALLBACK_STEM;
}

export function normalizeFilename(name: string): string {
  return name.normalize("NFC").toLowerCase();
}

export function sameFilename(a: string, b: string): boolean {
  return normalizeFilename(a) === normalizeFilename(b);
}

export function titleFromFilename(name: string): string {
  const normalized = name.normalize("NFC");
  const lower = normalized.toLowerCase();
  const extension = MARKDOWN_EXTENSIONS.find((candidate) => lower.endsWith(candidate));
  const stem = extension ? normalized.slice(0, -extension.length) : normalized;
  const trimmed = stem.trim().replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed : FALLBACK_STEM;
}

export function filenameFor(
  title: string,
  taken: Iterable<string>,
  current?: string,
  extension: string = MARKDOWN_EXTENSION,
): string {
  const stem = sanitizeStem(title);
  const used = new Set<string>();
  for (const name of taken) used.add(normalizeFilename(name));
  if (current !== undefined) used.delete(normalizeFilename(current));
  const keepCurrent = (name: string) =>
    current !== undefined && sameFilename(name, current) ? current : name;
  const candidate = `${stem}${extension}`;
  if (!used.has(normalizeFilename(candidate))) return keepCurrent(candidate);
  for (let counter = 2; ; counter++) {
    const numbered = `${stem} ${counter}${extension}`;
    if (!used.has(normalizeFilename(numbered))) return keepCurrent(numbered);
  }
}
