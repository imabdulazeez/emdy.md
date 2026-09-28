import { describe, expect, it } from "vite-plus/test";
import { parseTableSource, type TableGrid } from "~/lib/editor/table-source";
import { TABLE_DOCUMENT, TABLE_DOCUMENT_COPIES } from "~/test-documents";
import {
  CSV_NEWLINE,
  csvField,
  serializeTable,
  TABLE_COPY_FORMATS,
  TABLE_COPY_TRIGGER_HTML,
  tableToCsv,
  tableToMarkdown,
} from "./table-clipboard";

const SOURCE = ["| Mode | Amount |", "| :--- | -----: |", "| fast | 42 |", "| slow |"].join("\n");

describe("csvField", () => {
  it("leaves plain values alone", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField("")).toBe("");
    expect(csvField("inner space")).toBe("inner space");
  });

  it("quotes values with commas, quotes, or line breaks and doubles embedded quotes", () => {
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('"')).toBe('""""');
    expect(csvField("one\ntwo")).toBe('"one\ntwo"');
    expect(csvField("one\rtwo")).toBe('"one\rtwo"');
  });

  it("quotes values with leading or trailing whitespace so readers keep it", () => {
    expect(csvField(" lead")).toBe('" lead"');
    expect(csvField("trail ")).toBe('"trail "');
    expect(csvField("\ttab")).toBe('"\ttab"');
  });
});

describe("tableToCsv", () => {
  it("writes the header then each row, separated by LF with no trailing newline", () => {
    expect(CSV_NEWLINE).toBe("\n");
    expect(tableToCsv(parseTableSource(SOURCE))).toBe("Mode,Amount\nfast,42\nslow,");
  });

  it("unescapes escaped pipes and keeps literal pipes unquoted", () => {
    const grid = parseTableSource("| a \\| b | c |\n| - | - |\n| x \\| y | z |");
    expect(grid.header[0]).toBe("a | b");
    expect(tableToCsv(grid)).toBe("a | b,c\nx | y,z");
  });

  it("keeps the cell's Markdown source", () => {
    const grid = parseTableSource(
      "| Name | Link |\n| --- | --- |\n| **Bold** | [docs](https://example.com) |",
    );
    expect(tableToCsv(grid)).toBe("Name,Link\n**Bold**,[docs](https://example.com)");
  });

  it("quotes cells with commas and quotes", () => {
    const grid = parseTableSource('| City | Quote |\n| --- | --- |\n| Paris, FR | "Bonjour" |');
    expect(tableToCsv(grid)).toBe('City,Quote\n"Paris, FR","""Bonjour"""');
  });

  it("keeps empty cells as empty fields", () => {
    const grid = parseTableSource("| a | b | c |\n| - | - | - |\n|  | x |  |\n| | | |");
    expect(tableToCsv(grid)).toBe("a,b,c\n,x,\n,,");
  });

  it("pads ragged rows to the widest record", () => {
    const grid: TableGrid = {
      header: ["a", "b"],
      align: [null, null],
      rows: [["1"], ["1", "2", "3"]],
    };
    expect(tableToCsv(grid)).toBe("a,b,\n1,,\n1,2,3");
  });

  it("keeps cells the parser widened a ragged table to hold", () => {
    const grid = parseTableSource("| a |\n| - |\n| 1 | 2 |");
    expect(tableToCsv(grid)).toBe("a,\n1,2");
  });

  it("quotes an empty single-column record so it is not read as a blank line", () => {
    const grid = parseTableSource("| a |\n| - |\n|  |\n| b |");
    expect(tableToCsv(grid)).toBe('a\n""\nb');
  });

  it("ignores alignment", () => {
    const left = parseTableSource("| a | b |\n| :- | -: |\n| 1 | 2 |");
    const plain = parseTableSource("| a | b |\n| - | - |\n| 1 | 2 |");
    expect(tableToCsv(left)).toBe(tableToCsv(plain));
  });
});

describe("tableToMarkdown", () => {
  it("writes normalized, padded Markdown and keeps alignment", () => {
    expect(tableToMarkdown(parseTableSource(SOURCE))).toBe(
      ["| Mode | Amount |", "| :--- | -----: |", "| fast |     42 |", "| slow |        |"].join(
        "\n",
      ),
    );
  });

  it("re-escapes pipes inside cells", () => {
    const grid = parseTableSource("| a \\| b |\n| --- |\n| x |");
    expect(tableToMarkdown(grid)).toContain("a \\| b");
    expect(parseTableSource(tableToMarkdown(grid))).toEqual(grid);
  });

  it("fills ragged rows so every row has a cell per column", () => {
    const markdown = tableToMarkdown(parseTableSource("| a | b |\n| - | - |\n| 1 |"));
    expect(markdown.split("\n").at(-1)).toBe("| 1   |     |");
  });

  it("keeps center alignment", () => {
    const markdown = tableToMarkdown(parseTableSource("| a |\n| :-: |\n| 1 |"));
    expect(markdown.split("\n")[1]).toBe("| :-: |");
  });
});

describe("serializeTable", () => {
  it("produces the copies the browser suite expects for the shared table fixture", () => {
    expect(TABLE_DOCUMENT.text).toContain(TABLE_DOCUMENT_COPIES.source);
    const grid = parseTableSource(TABLE_DOCUMENT_COPIES.source);
    expect(serializeTable(grid, "markdown")).toBe(TABLE_DOCUMENT_COPIES.markdown);
    expect(serializeTable(grid, "csv")).toBe(TABLE_DOCUMENT_COPIES.csv);
  });

  it("dispatches on the format", () => {
    const grid = parseTableSource(SOURCE);
    expect(serializeTable(grid, "csv")).toBe(tableToCsv(grid));
    expect(serializeTable(grid, "markdown")).toBe(tableToMarkdown(grid));
  });

  it("lists Markdown before CSV", () => {
    expect(TABLE_COPY_FORMATS.map((format) => format.label)).toEqual([
      "Copy as Markdown",
      "Copy as CSV",
    ]);
  });
});

describe("TABLE_COPY_TRIGGER_HTML", () => {
  it("is a labelled menu button", () => {
    const host = document.createElement("div");
    host.innerHTML = TABLE_COPY_TRIGGER_HTML;
    const button = host.querySelector("button")!;
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("aria-label", "Copy table");
    expect(button).toHaveAttribute("aria-haspopup", "menu");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button.classList).toContain("icon-button");
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
