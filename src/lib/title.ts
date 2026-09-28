export const UNTITLED = "Untitled";
export const APP_NAME = "emdy.md";
export const HOME_TITLE = `${APP_NAME} · Private Markdown editor that runs in your browser`;
export const MAX_DERIVED_TITLE_LENGTH = 60;

const SCAN_LIMIT = 16_384;
const BYTE_ORDER_MARK = 0xfeff;
const FRONT_MATTER_OPEN = /^---\s*$/;
const FRONT_MATTER_CLOSE = /^(?:---|\.\.\.)\s*$/;
const FRONT_MATTER_TITLE = /^title\s*:\s*(.*)$/i;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const THEMATIC_BREAK = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const SETEXT_UNDERLINE = /^ {0,3}(?:=+|-+)[ \t]*$/;
const TABLE_ROW = /^ {0,3}\|/;
const REFERENCE_DEFINITION = /^ {0,3}\[[^\]]+\]:/;
const ATX_HEADING = /^ {0,3}#{1,6}(?:[ \t]+|$)/;
const CLOSING_HASHES = /[ \t]+#+[ \t]*$/;
const BLOCK_PREFIX = /^ {0,3}(?:>[ \t]?|[-+*][ \t]+|\d{1,9}[.)][ \t]+)/;
const TASK_MARKER = /^\[[ xX]\][ \t]+/;

function unquote(value: string): string {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote === '"' || quote === "'") && trimmed.endsWith(quote) && trimmed.length >= 2)
    return trimmed.slice(1, -1);
  return trimmed;
}

function stripBlockPrefixes(line: string): string {
  let current = line;
  for (;;) {
    const next = current.replace(BLOCK_PREFIX, "");
    if (next === current) return current.replace(TASK_MARKER, "");
    current = next;
  }
}

export function stripInlineMarkdown(value: string): string {
  return value
    .replace(/<!--.*?-->/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/!\[[^\]]*\]\[[^\]]*\]/g, "")
    .replace(/\[\^[^\]]+\]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(/<((?:https?|mailto):[^>\s]+)>/gi, "$1")
    .replace(/<\/?[A-Za-z][^>]*>/g, "")
    .replace(/(?<!`)(`+)(?!`) ?(.+?) ?(?<!`)\1(?!`)/g, "$2")
    .replace(/(\*\*|__|~~|==)(?=\S)(.+?)(?<=\S)\1/g, "$2")
    .replace(/(^|[^\p{L}\p{N}\\])([*_])(?=\S)(.+?)(?<=\S)\2(?![\p{L}\p{N}])/gu, "$1$3")
    .replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, "$1")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function graphemes(value: string): string[] {
  if (typeof Intl.Segmenter === "function")
    return Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value),
      (part) => part.segment,
    );
  return Array.from(value);
}

export function truncateTitle(value: string, limit = MAX_DERIVED_TITLE_LENGTH): string {
  const parts = graphemes(value);
  if (parts.length <= limit) return value;
  const head = parts.slice(0, limit).join("");
  const boundary = head.lastIndexOf(" ");
  const cut = boundary >= limit / 2 ? head.slice(0, boundary) : head;
  return cut.replace(/[\s,;:.\-–—]+$/u, "");
}

function frontMatterTitle(lines: readonly string[]): { title: string | null; end: number } {
  if (lines.length === 0 || !FRONT_MATTER_OPEN.test(lines[0])) return { title: null, end: 0 };
  let title: string | null = null;
  for (let index = 1; index < lines.length; index++) {
    const line = lines[index];
    if (FRONT_MATTER_CLOSE.test(line)) return { title, end: index + 1 };
    const match = FRONT_MATTER_TITLE.exec(line);
    if (match && title === null) title = unquote(match[1]);
  }
  return { title: null, end: 0 };
}

function lineText(line: string): string {
  if (ATX_HEADING.test(line)) {
    return stripInlineMarkdown(
      line.replace(ATX_HEADING, "").replace(CLOSING_HASHES, "").replace(/^#+$/, ""),
    );
  }
  return stripInlineMarkdown(stripBlockPrefixes(line));
}

export function deriveTitle(text: string): string {
  const start = text.charCodeAt(0) === BYTE_ORDER_MARK ? 1 : 0;
  const lines = text.slice(start, start + SCAN_LIMIT).split(/\r\n|\r|\n/);
  const front = frontMatterTitle(lines);
  if (front.title !== null) {
    const title = stripInlineMarkdown(front.title);
    if (title) return truncateTitle(title);
  }
  let fence: string | null = null;
  let comment = false;
  for (let index = front.end; index < lines.length; index++) {
    const line = lines[index];
    if (fence !== null) {
      const close = FENCE_CLOSE.exec(line);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
      continue;
    }
    if (comment) {
      if (line.includes("-->")) comment = false;
      continue;
    }
    const open = FENCE.exec(line);
    if (open) {
      fence = open[1];
      continue;
    }
    if (/^\s*<!--/.test(line) && !line.includes("-->")) {
      comment = true;
      continue;
    }
    if (
      line.trim() === "" ||
      THEMATIC_BREAK.test(line) ||
      SETEXT_UNDERLINE.test(line) ||
      TABLE_ROW.test(line) ||
      REFERENCE_DEFINITION.test(line)
    )
      continue;
    const title = lineText(line);
    if (title) return truncateTitle(title);
  }
  return UNTITLED;
}

const UNTITLED_PATTERN = new RegExp(`^${UNTITLED}(?: \\d+)?$`);

export function isAutomaticTitle(title: string, text: string): boolean {
  return UNTITLED_PATTERN.test(title) || title === deriveTitle(text);
}

export function pageTitle(name: string | null): string {
  return name ? `${name} · ${APP_NAME}` : HOME_TITLE;
}
