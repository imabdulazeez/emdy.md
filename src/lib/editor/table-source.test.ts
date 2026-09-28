import { describe, expect, it } from "vite-plus/test";
import {
  cellAt,
  formatTable,
  insertColumn,
  insertRow,
  isDelimiterRow,
  nextAlign,
  parseAlignment,
  parseTableSource,
  removeColumn,
  removeRow,
  setCell,
  setColumnAlign,
  splitRow,
  type TableGrid,
} from "./table-source";

const SOURCE = ["| Mode | Amount |", "| :--- | -----: |", "| fast | 42     |", "| slow |"].join(
  "\n",
);

describe("splitRow", () => {
  it("drops the optional outer pipes and trims each cell", () => {
    expect(splitRow("| a | b |")).toEqual(["a", "b"]);
    expect(splitRow("a | b")).toEqual(["a", "b"]);
    expect(splitRow("|  spaced  |")).toEqual(["spaced"]);
  });

  it("keeps escaped pipes inside a cell and unescapes them for display", () => {
    expect(splitRow("| a \\| b | c |")).toEqual(["a | b", "c"]);
  });

  it("keeps empty cells between pipes", () => {
    expect(splitRow("| a || b |")).toEqual(["a", "", "b"]);
  });
});

describe("parseAlignment", () => {
  it("maps delimiter cells to alignments", () => {
    expect(parseAlignment("|:--|:-:|--:|---|")).toEqual(["left", "center", "right", null]);
    expect(parseAlignment(" :-- | -: ")).toEqual(["left", "right"]);
  });
});

describe("isDelimiterRow", () => {
  it("accepts delimiter rows with or without outer pipes and colons", () => {
    for (const row of ["| --- | :-: |", "---|---", " :-------: ", "|-|"]) {
      expect(isDelimiterRow(row)).toBe(true);
    }
  });

  it("rejects content rows", () => {
    for (const row of ["| a | b |", "| -- x |", ""]) expect(isDelimiterRow(row)).toBe(false);
  });
});

describe("parseTableSource", () => {
  it("reads a rectangular grid with alignment", () => {
    expect(parseTableSource(SOURCE)).toEqual({
      header: ["Mode", "Amount"],
      align: ["left", "right"],
      rows: [
        ["fast", "42"],
        ["slow", ""],
      ],
    });
  });

  it("widens every row so cells GFM would discard are kept", () => {
    const grid = parseTableSource("| a |\n| - |\n| 1 | 2 | 3 |");
    expect(grid.header).toEqual(["a", "", ""]);
    expect(grid.align).toEqual([null, null, null]);
    expect(grid.rows).toEqual([["1", "2", "3"]]);
  });

  it("treats a table without a delimiter row as all body rows", () => {
    expect(parseTableSource("| a |\n| b |").rows).toEqual([["b"]]);
  });
});

describe("formatTable", () => {
  it("pads every column to one width and keeps the alignment markers", () => {
    const grid = parseTableSource(SOURCE);
    expect(formatTable(grid)).toBe(
      ["| Mode | Amount |", "| :--- | -----: |", "| fast |     42 |", "| slow |        |"].join(
        "\n",
      ),
    );
  });

  it("round-trips its own output", () => {
    const once = formatTable(parseTableSource(SOURCE));
    expect(formatTable(parseTableSource(once))).toBe(once);
  });

  it("keeps a minimum column width and centers padding for centered columns", () => {
    const grid: TableGrid = { header: ["a", "b"], align: [null, "center"], rows: [["", "xxxxx"]] };
    expect(formatTable(grid)).toBe(
      ["| a   |   b   |", "| --- | :---: |", "|     | xxxxx |"].join("\n"),
    );
  });

  it("escapes pipes typed into a cell", () => {
    const grid: TableGrid = { header: ["a"], align: [null], rows: [["x | y"]] };
    expect(formatTable(grid)).toContain("x \\| y");
    expect(parseTableSource(formatTable(grid)).rows).toEqual([["x | y"]]);
  });
});

describe("grid edits", () => {
  const grid = parseTableSource(SOURCE);

  it("sets header and body cells and flattens newlines", () => {
    expect(setCell(grid, 0, 1, "Total").header).toEqual(["Mode", "Total"]);
    expect(setCell(grid, 2, 1, "9").rows[1]).toEqual(["slow", "9"]);
    expect(setCell(grid, 1, 0, "a\nb").rows[0][0]).toBe("a b");
  });

  it("inserts and removes rows", () => {
    expect(insertRow(grid, 1).rows).toEqual([
      ["fast", "42"],
      ["", ""],
      ["slow", ""],
    ]);
    expect(removeRow(grid, 1).rows).toEqual([["slow", ""]]);
    expect(removeRow(grid, 0)).toBe(grid);
  });

  it("inserts and removes columns across every row", () => {
    const wider = insertColumn(grid, 1);
    expect(wider.header).toEqual(["Mode", "", "Amount"]);
    expect(wider.align).toEqual(["left", null, "right"]);
    expect(wider.rows[0]).toEqual(["fast", "", "42"]);

    const narrower = removeColumn(grid, 0);
    expect(narrower.header).toEqual(["Amount"]);
    expect(narrower.rows).toEqual([["42"], [""]]);
  });

  it("keeps the last column", () => {
    const single = parseTableSource("| a |\n| - |\n| 1 |");
    expect(removeColumn(single, 0)).toBe(single);
  });

  it("cycles alignment through default, left, center and right", () => {
    expect(nextAlign(null)).toBe("left");
    expect(nextAlign("left")).toBe("center");
    expect(nextAlign("center")).toBe("right");
    expect(nextAlign("right")).toBe(null);
    expect(setColumnAlign(grid, 1, "center").align).toEqual(["left", "center"]);
  });
});

describe("cellAt", () => {
  it("maps an offset to its row and column", () => {
    expect(cellAt(SOURCE, 0)).toEqual({ row: 0, column: 0 });
    expect(cellAt(SOURCE, SOURCE.indexOf("Amount"))).toEqual({ row: 0, column: 1 });
    expect(cellAt(SOURCE, SOURCE.indexOf(":---"))).toEqual({ row: 0, column: 0 });
    expect(cellAt(SOURCE, SOURCE.indexOf("fast"))).toEqual({ row: 1, column: 0 });
    expect(cellAt(SOURCE, SOURCE.indexOf("42"))).toEqual({ row: 1, column: 1 });
    expect(cellAt(SOURCE, SOURCE.indexOf("slow"))).toEqual({ row: 2, column: 0 });
  });

  it("clamps offsets outside the table and columns past the header", () => {
    expect(cellAt(SOURCE, -5)).toEqual({ row: 0, column: 0 });
    expect(cellAt(SOURCE, SOURCE.length + 20)).toEqual({ row: 2, column: 1 });
    expect(cellAt("| a |\n| - |\n| 1 | 2 |", 20)).toEqual({ row: 1, column: 0 });
  });

  it("counts escaped pipes as cell content", () => {
    const source = "| a | b |\n| - | - |\n| x \\| y | z |";
    expect(cellAt(source, source.indexOf("y"))).toEqual({ row: 1, column: 0 });
    expect(cellAt(source, source.indexOf("z"))).toEqual({ row: 1, column: 1 });
  });
});
