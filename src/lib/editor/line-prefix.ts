export interface LinePrefix {
  indent: string;
  quote: string;
  marker: string | null;
  gap: string;
  task: string | null;
  heading: number;
  content: string;
  closing: string;
}

const INDENT_RE = /^[ \t]*/;
const QUOTE_RE = /^(?:>[ \t]{0,3})+/;
const LIST_RE = /^([-*+]|\d{1,9}[.)])([ \t]|$)/;
const TASK_RE = /^\[([ xX])\](?:[ \t]+|$)/;
const HEADING_RE = /^(#{1,6})(?:[ \t]+|$)/;
const THEMATIC_BREAK_RE = /^(?:\*(?:[ \t]*\*){2,}|-(?:[ \t]*-){2,}|_(?:[ \t]*_){2,})[ \t]*$/;

export function parseLinePrefix(text: string): LinePrefix {
  let rest = text;
  const indent = INDENT_RE.exec(rest)?.[0] ?? "";
  rest = rest.slice(indent.length);
  const allowsBlockMarker = indent.length <= 3 && !indent.includes("\t");
  const quote = allowsBlockMarker ? (QUOTE_RE.exec(rest)?.[0] ?? "") : "";
  rest = rest.slice(quote.length);
  let marker: string | null = null;
  let gap = "";
  let task: string | null = null;
  const list = allowsBlockMarker && !THEMATIC_BREAK_RE.test(rest) ? LIST_RE.exec(rest) : null;
  if (list) {
    marker = list[1];
    gap = list[2];
    rest = rest.slice(list[0].length);
    const taskMatch = TASK_RE.exec(rest);
    if (taskMatch) {
      task = taskMatch[1];
      rest = rest.slice(taskMatch[0].length);
    }
  }
  let heading = 0;
  let closing = "";
  const headingMatch = allowsBlockMarker ? HEADING_RE.exec(rest) : null;
  if (headingMatch) {
    heading = headingMatch[1].length;
    rest = rest.slice(headingMatch[0].length);
    const closingMatch = /[ \t]+#+[ \t]*$/.exec(rest);
    if (closingMatch) {
      closing = closingMatch[0];
      rest = rest.slice(0, closingMatch.index);
    }
  }
  return { indent, quote, marker, gap, task, heading, content: rest, closing };
}

export function formatLinePrefix(prefix: Omit<LinePrefix, "content" | "closing">): string {
  let out = prefix.indent + prefix.quote;
  if (prefix.marker !== null) out += prefix.marker + (prefix.gap || " ");
  if (prefix.task !== null) out += `[${prefix.task}] `;
  if (prefix.heading > 0) out += `${"#".repeat(prefix.heading)} `;
  return out;
}

export function formatLine(prefix: LinePrefix): string {
  return formatLinePrefix(prefix) + prefix.content + prefix.closing;
}

export function isOrderedMarker(marker: string | null): boolean {
  return marker !== null && /^\d/.test(marker);
}

export function orderedMarker(number: number, marker: string | null): string {
  const delimiter = marker && /[.)]$/.test(marker) ? marker.slice(-1) : ".";
  const value = Number.isSafeInteger(number) && number >= 1 && number <= 999_999_999 ? number : 1;
  return `${value}${delimiter}`;
}

export function isBlankLine(text: string): boolean {
  return /^[ \t]*$/.test(text);
}
