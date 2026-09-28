export type ColumnAlign = "left" | "center" | "right" | null;

export interface TableGrid {
  header: string[];
  align: ColumnAlign[];
  rows: string[][];
}

const MIN_COLUMN_WIDTH = 3;

const DELIMITER_ROW = /^\|?(?:\s*:?-+:?\s*\|)*\s*:?-+:?\s*\|?$/;

function width(cell: string): number {
  return cell.length;
}

function unescapePipes(cell: string): string {
  return cell.replace(/\\\|/g, "|");
}

function escapePipes(cell: string): string {
  return cell.replace(/\|/g, "\\|");
}

/** Splits a table row on its unescaped pipes, dropping the optional outer ones. */
export function splitRow(line: string): string[] {
  const text = line.trim();
  const cells: string[] = [];
  let current = "";
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === "\\" && index + 1 < text.length) {
      current += char + text[index + 1];
      index++;
    } else if (char === "|") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  if (cells.length > 1 && text.startsWith("|") && cells[0] === "") cells.shift();
  if (cells.length > 1 && cells.at(-1) === "") cells.pop();
  return cells.map((cell) => unescapePipes(cell).trim());
}

/** Parses a GFM delimiter row (`|:--|:-:|--:|`) into per-column alignment. */
export function parseAlignment(delimiterRow: string): ColumnAlign[] {
  return splitRow(delimiterRow).map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return null;
  });
}

export function isDelimiterRow(line: string): boolean {
  return DELIMITER_ROW.test(line.trim());
}

function fit<T>(cells: T[], columns: number, empty: T): T[] {
  return Array.from({ length: columns }, (_, index) => cells[index] ?? empty);
}

/**
 * Reads a table's raw Markdown into a rectangular grid. The column count is the
 * widest row so that cells GFM would discard survive a round trip.
 */
export function parseTableSource(source: string): TableGrid {
  const lines = source.split("\n").filter((line) => line.trim() !== "");
  const header = lines.length > 0 ? splitRow(lines[0]) : [];
  const delimited = lines.length > 1 && isDelimiterRow(lines[1]);
  const align = delimited ? parseAlignment(lines[1]) : [];
  const rows = lines.slice(delimited ? 2 : 1).map(splitRow);
  const columns = Math.max(1, header.length, align.length, ...rows.map((row) => row.length));
  return {
    header: fit(header, columns, ""),
    align: fit(align, columns, null),
    rows: rows.map((row) => fit(row, columns, "")),
  };
}

function delimiterCell(align: ColumnAlign, size: number): string {
  switch (align) {
    case "left":
      return `:${"-".repeat(size - 1)}`;
    case "right":
      return `${"-".repeat(size - 1)}:`;
    case "center":
      return `:${"-".repeat(size - 2)}:`;
    default:
      return "-".repeat(size);
  }
}

function pad(cell: string, size: number, align: ColumnAlign): string {
  const slack = Math.max(0, size - width(cell));
  if (align === "right") return " ".repeat(slack) + cell;
  if (align === "center") {
    const left = Math.floor(slack / 2);
    return " ".repeat(left) + cell + " ".repeat(slack - left);
  }
  return cell + " ".repeat(slack);
}

/** Serializes a grid back to pipe Markdown with every column padded to one width. */
export function formatTable(grid: TableGrid): string {
  const columns = grid.header.length;
  const cells = [grid.header, ...grid.rows].map((row) => fit(row, columns, "").map(escapePipes));
  const widths = Array.from({ length: columns }, (_, column) =>
    Math.max(MIN_COLUMN_WIDTH, ...cells.map((row) => width(row[column]))),
  );
  const line = (row: string[]) =>
    `| ${row.map((cell, column) => pad(cell, widths[column], grid.align[column])).join(" | ")} |`;
  const [header, ...rows] = cells;
  return [
    line(header),
    `| ${widths.map((size, column) => delimiterCell(grid.align[column], size)).join(" | ")} |`,
    ...rows.map(line),
  ].join("\n");
}

export function emptyRow(columns: number): string[] {
  return Array.from({ length: columns }, () => "");
}

export function setCell(grid: TableGrid, row: number, column: number, value: string): TableGrid {
  const text = value.replace(/[\r\n]+/g, " ");
  if (row === 0) {
    return { ...grid, header: grid.header.map((cell, index) => (index === column ? text : cell)) };
  }
  return {
    ...grid,
    rows: grid.rows.map((cells, index) =>
      index === row - 1 ? cells.map((cell, at) => (at === column ? text : cell)) : cells,
    ),
  };
}

/** Inserts a blank body row at `row`; row 0 (the header) pushes a row to the top. */
export function insertRow(grid: TableGrid, row: number): TableGrid {
  const rows = [...grid.rows];
  rows.splice(Math.max(0, Math.min(rows.length, row)), 0, emptyRow(grid.header.length));
  return { ...grid, rows };
}

export function removeRow(grid: TableGrid, row: number): TableGrid {
  if (row <= 0 || grid.rows.length === 0) return grid;
  return { ...grid, rows: grid.rows.filter((_, index) => index !== row - 1) };
}

export function insertColumn(grid: TableGrid, column: number): TableGrid {
  const at = Math.max(0, Math.min(grid.header.length, column));
  const insert = <T>(cells: T[], value: T): T[] => cells.toSpliced(at, 0, value);
  return {
    header: insert(grid.header, ""),
    align: insert(grid.align, null),
    rows: grid.rows.map((row) => insert(row, "")),
  };
}

export function removeColumn(grid: TableGrid, column: number): TableGrid {
  if (grid.header.length <= 1) return grid;
  const drop = <T>(cells: T[]): T[] => cells.filter((_, index) => index !== column);
  return {
    header: drop(grid.header),
    align: drop(grid.align),
    rows: grid.rows.map(drop),
  };
}

export function setColumnAlign(grid: TableGrid, column: number, align: ColumnAlign): TableGrid {
  return {
    ...grid,
    align: grid.align.map((value, index) => (index === column ? align : value)),
  };
}

const ALIGN_CYCLE: ColumnAlign[] = [null, "left", "center", "right"];

export function nextAlign(align: ColumnAlign): ColumnAlign {
  return ALIGN_CYCLE[(ALIGN_CYCLE.indexOf(align) + 1) % ALIGN_CYCLE.length];
}

export interface TableCellRef {
  /** 0 is the header row; body rows start at 1. */
  row: number;
  column: number;
}

function unescapedPipes(text: string): number {
  let count = 0;
  for (let index = 0; index < text.length; index++) {
    if (text[index] === "\\") index++;
    else if (text[index] === "|") count++;
  }
  return count;
}

/** Maps an offset into a table's raw source to the cell that contains it. */
export function cellAt(source: string, offset: number): TableCellRef {
  const lines = source.split("\n");
  let start = 0;
  let line = 0;
  while (line < lines.length - 1 && start + lines[line].length < offset) {
    start += lines[line].length + 1;
    line++;
  }
  const text = lines[line] ?? "";
  const local = Math.max(0, Math.min(text.length, offset - start));
  const pipes = unescapedPipes(text.slice(0, local));
  const outer = text.trimStart().startsWith("|");
  const columns = Math.max(1, splitRow(lines[0] ?? "").length);
  return {
    row: line <= 1 ? 0 : line - 1,
    column: Math.max(0, Math.min(columns - 1, outer ? pipes - 1 : pipes)),
  };
}
