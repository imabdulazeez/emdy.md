import { formatTable, type TableGrid } from "~/lib/editor/table-source";

export type TableCopyFormat = "markdown" | "csv";

export interface TableCopyFormatOption {
  id: TableCopyFormat;
  /** Menu label. */
  label: string;
  /** Name used in confirmations ("Copied table as CSV"). */
  name: string;
}

export const TABLE_COPY_FORMATS: readonly TableCopyFormatOption[] = [
  { id: "markdown", label: "Copy as Markdown", name: "Markdown" },
  { id: "csv", label: "Copy as CSV", name: "CSV" },
];

export const TABLE_COPY_LABEL = "Copy table";

/** Marks the open copy menu, so a table editor can tell focus moved into its own menu. */
export const TABLE_COPY_MENU_ATTR = "data-table-copy-menu";

/**
 * Record separator for CSV. RFC 4180 specifies CRLF, but this text goes to the
 * clipboard rather than a file: browsers already convert LF to the platform's
 * line ending on Windows, every spreadsheet and CSV reader accepts LF, and a
 * stray CR shows up as `^M` when the text is pasted into a terminal or editor
 * on macOS and Linux. Cells never contain line breaks (a Markdown table row is
 * one line), so the choice cannot split a record.
 */
export const CSV_NEWLINE = "\n";

/** A field needs quoting when it holds a delimiter, a quote, a line break, or edge whitespace. */
const NEEDS_QUOTES = /[",\r\n]|^[ \t]|[ \t]$/;

/** Quotes one CSV field per RFC 4180, doubling any embedded quotes. */
export function csvField(value: string): string {
  return NEEDS_QUOTES.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/**
 * Serializes a grid as CSV with the header as the first record. Cells keep the
 * Markdown source shown in the table editor (`**Total**`, `[docs](url)`), so
 * nothing is lost; only the `\|` escape, which exists solely because of the
 * table syntax, is already undone by the parser. Short rows are padded so every
 * record has the same number of fields, and there is no trailing line break.
 */
export function tableToCsv(grid: TableGrid): string {
  const records = [grid.header, ...grid.rows];
  const columns = Math.max(1, ...records.map((record) => record.length));
  return records
    .map((record) => {
      // A lone empty field would be an empty line, which readers skip; quote it.
      if (columns === 1 && !record[0]) return '""';
      return Array.from({ length: columns }, (_, index) => csvField(record[index] ?? "")).join(",");
    })
    .join(CSV_NEWLINE);
}

/** Serializes a grid as evenly padded pipe Markdown, exactly as the table editor writes it. */
export function tableToMarkdown(grid: TableGrid): string {
  return formatTable(grid);
}

export function serializeTable(grid: TableGrid, format: TableCopyFormat): string {
  return format === "csv" ? tableToCsv(grid) : tableToMarkdown(grid);
}

/**
 * Markup for the copy control drawn over a rendered table. Shared by the
 * editable preview's widget and the read-only preview's renderer (which runs in
 * a worker and so needs a string), so both look and behave the same.
 */
export const TABLE_COPY_TRIGGER_HTML =
  '<div class="table-tools rounded-lg bg-glass backdrop-blur-sm">' +
  `<button type="button" class="icon-button table-copy-trigger" aria-haspopup="menu" aria-expanded="false" aria-label="${TABLE_COPY_LABEL}" title="${TABLE_COPY_LABEL}">` +
  '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" data-icon="copy">' +
  '<rect x="9" y="9" width="12" height="12" rx="2"></rect>' +
  '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>' +
  "</svg></button></div>";

export interface MenuPoint {
  x: number;
  y: number;
}

/** What a surface hands the copy menu when the user asks to copy a table. */
export interface TableCopyRequest {
  grid: TableGrid;
  /** The control the menu hangs from; it carries `aria-expanded` while the menu is open. */
  anchor: HTMLElement;
  /** Viewport point to open at instead of below the anchor (keyboard shortcut from text). */
  point?: MenuPoint;
  /** Returns focus when the menu closes from the keyboard; defaults to focusing the anchor. */
  restoreFocus?: () => void;
  /** Called when the menu closes without returning focus (a click elsewhere, the window blurring). */
  onDismiss?: () => void;
}
