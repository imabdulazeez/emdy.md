export const DOCUMENT_ICON_COLORS = [
  "gray",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "sky",
  "blue",
  "violet",
  "pink",
] as const;

export type DocumentIconColor = (typeof DOCUMENT_ICON_COLORS)[number];

export type DocumentIcon =
  | { kind: "lucide"; name: string; color: DocumentIconColor }
  | { kind: "emoji"; emoji: string }
  | { kind: "monogram"; text: string; color: DocumentIconColor };

export type DocumentIconKind = DocumentIcon["kind"];

export interface DocumentIdentity {
  monogram: string;
  color: DocumentIconColor;
}

export const DOCUMENT_ICON_COLOR_LABELS: Record<DocumentIconColor, string> = {
  gray: "Gray",
  red: "Red",
  orange: "Orange",
  amber: "Amber",
  green: "Green",
  teal: "Teal",
  sky: "Sky",
  blue: "Blue",
  violet: "Violet",
  pink: "Pink",
};

export const DOCUMENT_ICON_COLOR_CLASSES: Record<DocumentIconColor, string> = {
  gray: "text-icon-gray",
  red: "text-icon-red",
  orange: "text-icon-orange",
  amber: "text-icon-amber",
  green: "text-icon-green",
  teal: "text-icon-teal",
  sky: "text-icon-sky",
  blue: "text-icon-blue",
  violet: "text-icon-violet",
  pink: "text-icon-pink",
};

export const DOCUMENT_ICON_SWATCH_CLASSES: Record<DocumentIconColor, string> = {
  gray: "bg-icon-gray",
  red: "bg-icon-red",
  orange: "bg-icon-orange",
  amber: "bg-icon-amber",
  green: "bg-icon-green",
  teal: "bg-icon-teal",
  sky: "bg-icon-sky",
  blue: "bg-icon-blue",
  violet: "bg-icon-violet",
  pink: "bg-icon-pink",
};

export const POPULAR_LUCIDE_ICONS = [
  "file-text",
  "notebook-pen",
  "book-open",
  "bookmark",
  "lightbulb",
  "list-todo",
  "calendar",
  "pen-line",
  "quote",
  "graduation-cap",
  "briefcase",
  "code-xml",
  "flask-conical",
  "chart-line",
  "globe",
  "map",
  "heart",
  "star",
  "music",
  "camera",
  "plane",
  "house",
  "coffee",
  "sparkles",
] as const;

export const DOCUMENT_EMOJIS: readonly { emoji: string; label: string }[] = [
  { emoji: "📝", label: "Memo" },
  { emoji: "📄", label: "Page" },
  { emoji: "📚", label: "Books" },
  { emoji: "📖", label: "Open book" },
  { emoji: "🔖", label: "Bookmark" },
  { emoji: "💡", label: "Idea" },
  { emoji: "✅", label: "Check" },
  { emoji: "📌", label: "Pin" },
  { emoji: "📅", label: "Calendar" },
  { emoji: "✏️", label: "Pencil" },
  { emoji: "🧠", label: "Brain" },
  { emoji: "🎓", label: "Graduation" },
  { emoji: "💼", label: "Briefcase" },
  { emoji: "💻", label: "Computer" },
  { emoji: "🧪", label: "Test tube" },
  { emoji: "📊", label: "Chart" },
  { emoji: "🌍", label: "Globe" },
  { emoji: "🗺️", label: "Map" },
  { emoji: "❤️", label: "Heart" },
  { emoji: "⭐", label: "Star" },
  { emoji: "🎵", label: "Music" },
  { emoji: "📷", label: "Camera" },
  { emoji: "✈️", label: "Airplane" },
  { emoji: "🏠", label: "House" },
  { emoji: "☕", label: "Coffee" },
  { emoji: "🍳", label: "Cooking" },
  { emoji: "🌱", label: "Seedling" },
  { emoji: "🔥", label: "Fire" },
  { emoji: "✨", label: "Sparkles" },
  { emoji: "🚀", label: "Rocket" },
];

export const MAX_LUCIDE_RESULTS = 60;

const COLORS = new Set<string>(DOCUMENT_ICON_COLORS);
const LUCIDE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MONOGRAM = /^[\p{L}\p{N}][\p{L}\p{N}\p{M}‌‍]*$/u;
const MAX_EMOJI_LENGTH = 32;

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function graphemes(value: string): string[] {
  return Array.from(segmenter.segment(value), (part) => part.segment);
}

function normalizeTitle(title: string): string {
  return title.normalize("NFKC").trim();
}

function monogramFor(title: string): string {
  const words = normalizeTitle(title).match(/[\p{L}\p{N}]+/gu) ?? [];
  const firstWord = words[0];
  if (!firstWord) return "MD";
  const glyphs = Array.from(firstWord);
  const first = glyphs[0];
  const second =
    glyphs.slice(1).find((glyph) => /\p{N}/u.test(glyph)) ??
    (words.length > 1 ? Array.from(words.at(-1) ?? "")[0] : glyphs.at(-1)) ??
    first;
  return Array.from(`${first}${second}`.toLocaleUpperCase()).slice(0, 2).join("");
}

function colorFor(title: string): DocumentIconColor {
  const seed = normalizeTitle(title).toLocaleLowerCase("en-US") || "document";
  let index = 0;
  for (const glyph of seed) {
    index = (index * 31 + (glyph.codePointAt(0) ?? 0)) % DOCUMENT_ICON_COLORS.length;
  }
  return DOCUMENT_ICON_COLORS[index];
}

export function deriveDocumentIdentity(title: string): DocumentIdentity {
  return { monogram: monogramFor(title), color: colorFor(title) };
}

export function automaticDocumentIcon(title: string): Extract<DocumentIcon, { kind: "monogram" }> {
  const identity = deriveDocumentIdentity(title);
  return { kind: "monogram", text: identity.monogram, color: identity.color };
}

export function normalizeMonogram(value: string): string {
  return value.normalize("NFKC").trim().toLocaleUpperCase();
}

export function isMonogramText(value: string): boolean {
  const count = graphemes(value).length;
  return count >= 1 && count <= 2 && MONOGRAM.test(value);
}

export function isLucideName(value: string): boolean {
  return value.length <= 64 && LUCIDE_NAME.test(value);
}

export function firstEmoji(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const segment = graphemes(trimmed)[0];
  const isFlag = /^\p{Regional_Indicator}{2}$/u.test(segment);
  const isKeycap = /^[#*0-9]️?⃣$/u.test(segment);
  if (!/\p{Extended_Pictographic}/u.test(segment) && !isFlag && !isKeycap) return null;
  return segment;
}

export function isDocumentIconColor(value: unknown): value is DocumentIconColor {
  return typeof value === "string" && COLORS.has(value);
}

export function isDocumentIcon(value: unknown): value is DocumentIcon {
  if (typeof value !== "object" || value === null) return false;
  const icon = value as Record<string, unknown>;
  switch (icon.kind) {
    case "lucide":
      return (
        typeof icon.name === "string" && isLucideName(icon.name) && isDocumentIconColor(icon.color)
      );
    case "emoji":
      return (
        typeof icon.emoji === "string" &&
        icon.emoji.length <= MAX_EMOJI_LENGTH &&
        firstEmoji(icon.emoji) === icon.emoji
      );
    case "monogram":
      return (
        typeof icon.text === "string" &&
        isMonogramText(icon.text) &&
        isDocumentIconColor(icon.color)
      );
    default:
      return false;
  }
}

export function sameDocumentIcon(
  a: DocumentIcon | null | undefined,
  b: DocumentIcon | null | undefined,
): boolean {
  if (!a || !b) return !a && !b;
  if (a.kind === "emoji") return b.kind === "emoji" && a.emoji === b.emoji;
  if (b.kind === "emoji" || a.color !== b.color) return false;
  if (a.kind === "lucide") return b.kind === "lucide" && a.name === b.name;
  return b.kind === "monogram" && a.text === b.text;
}

export function filterLucideNames(names: readonly string[], query: string): string[] {
  const normalized = query.trim().toLowerCase().replaceAll(/\s+/g, "-");
  if (!normalized) {
    const available = new Set(names);
    return POPULAR_LUCIDE_ICONS.filter((name) => available.has(name));
  }
  const prefix: string[] = [];
  const rest: string[] = [];
  for (const name of names) {
    if (name.startsWith(normalized)) prefix.push(name);
    else if (name.includes(normalized)) rest.push(name);
  }
  return [...prefix, ...rest].slice(0, MAX_LUCIDE_RESULTS);
}

export function lucideLabel(name: string): string {
  const words = name.split("-").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
