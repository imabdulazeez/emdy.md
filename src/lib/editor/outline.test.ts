import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vite-plus/test";
import { createEditorExtensions } from "./extensions";
import {
  activeOutlineIndex,
  OUTLINE_PARSE_BUDGET_MS,
  outlineNumberWidth,
  outlineRows,
  readOutline,
} from "./outline";

const outlineOf = (text: string) =>
  readOutline(EditorState.create({ doc: text, extensions: createEditorExtensions() })).entries;

describe("readOutline", () => {
  it("returns an empty outline for an empty document", () => {
    expect(outlineOf("")).toEqual([]);
  });

  it("extracts ATX headings with levels and line numbers", () => {
    expect(
      outlineOf("# One\n\ntext\n\n## Two\n### Three ###\n####### not a heading\n#NoSpace"),
    ).toEqual([
      { level: 1, text: "One", line: 1 },
      { level: 2, text: "Two", line: 5 },
      { level: 3, text: "Three", line: 6 },
    ]);
  });

  it("supports empty ATX headings", () => {
    expect(outlineOf("#\n##  ")).toEqual([
      { level: 1, text: "", line: 1 },
      { level: 2, text: "", line: 2 },
    ]);
  });

  it("ignores headings inside fenced code blocks", () => {
    const doc = [
      "# Real",
      "```md",
      "# Fake",
      "```",
      "~~~",
      "## Also fake",
      "~~~",
      "## Real two",
    ].join("\n");
    expect(outlineOf(doc)).toEqual([
      { level: 1, text: "Real", line: 1 },
      { level: 2, text: "Real two", line: 8 },
    ]);
  });

  it("requires the closing fence to match the opening fence", () => {
    const doc = ["````", "```", "# still code", "````", "# heading"].join("\n");
    expect(outlineOf(doc)).toEqual([{ level: 1, text: "heading", line: 5 }]);
  });

  it("extracts setext headings", () => {
    const doc = ["Title", "=====", "", "Sub", "---", "", "para", "", "---"].join("\n");
    expect(outlineOf(doc)).toEqual([
      { level: 1, text: "Title", line: 1 },
      { level: 2, text: "Sub", line: 4 },
    ]);
  });

  it("does not treat a rule after a list item as a setext heading", () => {
    expect(outlineOf("- item\n---")).toEqual([]);
  });

  it("lists only top-level headings", () => {
    expect(outlineOf("> # Quoted\n\n- ## Listed\n\n# Top")).toEqual([
      { level: 1, text: "Top", line: 5 },
    ]);
  });

  it("strips inline markup and escapes from heading text", () => {
    expect(outlineOf("## **Bold** [link](x) `code` ~~gone~~ \\*kept\\*")[0].text).toBe(
      "Bold link code gone *kept*",
    );
    expect(outlineOf("# ![alt](a.png) and <https://x.y>")[0].text).toBe("alt and");
  });

  it("reports whether the whole document was parsed", () => {
    const state = EditorState.create({
      doc: "# One\n\ntext",
      extensions: createEditorExtensions(),
    });
    expect(readOutline(state).complete).toBe(true);
    expect(readOutline(EditorState.create({ doc: "# no language" }))).toEqual({
      entries: [],
      complete: false,
    });
  });

  it("keeps each read within a short budget and resumes the parse on the next read", () => {
    expect(OUTLINE_PARSE_BUDGET_MS).toBeLessThanOrEqual(20);
    const doc = Array.from(
      { length: 20_000 },
      (_, index) => `## Heading ${index}\n\nSome *text* with a [link](x) and \`code\`.\n`,
    ).join("\n");
    const state = EditorState.create({ doc, extensions: createEditorExtensions() });
    const first = readOutline(state, 1);
    expect(first.complete).toBe(false);
    let result = first;
    let reads = 1;
    while (!result.complete && reads < 5_000) {
      result = readOutline(state, 1);
      reads++;
    }
    expect(result.complete).toBe(true);
    expect(result.entries).toHaveLength(20_000);
    expect(result.entries.at(-1)).toMatchObject({ level: 2, text: "Heading 19999" });
  });
});

describe("activeOutlineIndex", () => {
  const outline = [
    { level: 1, text: "a", line: 1 },
    { level: 2, text: "b", line: 10 },
    { level: 2, text: "c", line: 20 },
  ];

  it("returns -1 when the cursor is before the first heading", () => {
    expect(activeOutlineIndex([], 5)).toBe(-1);
    expect(activeOutlineIndex([{ level: 1, text: "a", line: 3 }], 1)).toBe(-1);
  });

  it("returns the last heading at or before the cursor line", () => {
    expect(activeOutlineIndex(outline, 1)).toBe(0);
    expect(activeOutlineIndex(outline, 9)).toBe(0);
    expect(activeOutlineIndex(outline, 10)).toBe(1);
    expect(activeOutlineIndex(outline, 99)).toBe(2);
  });
});

describe("outlineRows", () => {
  const entry = (text: string, level = 2, line = 1) => ({ level, text, line });

  it("splits a leading section number from the label", () => {
    const rows = outlineRows([
      entry("1. Shareholder buybacks"),
      entry("2.3 Board buybacks"),
      entry("4.1.2. Disposals"),
      entry("5) Units"),
    ]);
    expect(rows.map((row) => [row.number, row.label])).toEqual([
      ["1.", "Shareholder buybacks"],
      ["2.3", "Board buybacks"],
      ["4.1.2.", "Disposals"],
      ["5)", "Units"],
    ]);
  });

  it("leaves headings that merely start with a figure alone", () => {
    const rows = outlineRows([
      entry("2026 plans"),
      entry("10x growth"),
      entry("Intro"),
      entry("1."),
    ]);
    expect(rows.map((row) => [row.number, row.label])).toEqual([
      [null, "2026 plans"],
      [null, "10x growth"],
      [null, "Intro"],
      [null, "1."],
    ]);
  });

  it("keeps the entry's level, line, and text", () => {
    expect(outlineRows([entry("3. Three", 3, 9)])[0]).toMatchObject({
      level: 3,
      line: 9,
      text: "3. Three",
    });
  });

  it("marks a section start where the outline climbs back to a shallower level", () => {
    const rows = outlineRows([
      entry("Title", 1),
      entry("A", 2),
      entry("A.1", 3),
      entry("B", 2),
      entry("C", 2),
      entry("Appendix", 1),
    ]);
    expect(rows.map((row) => row.sectionStart)).toEqual([false, false, false, true, false, true]);
  });
});

describe("outlineNumberWidth", () => {
  it("is the widest number in characters, or zero without numbers", () => {
    expect(outlineNumberWidth(outlineRows([{ level: 2, text: "Intro", line: 1 }]))).toBe(0);
    expect(
      outlineNumberWidth(
        outlineRows([
          { level: 2, text: "9. Nine", line: 1 },
          { level: 2, text: "10. Ten", line: 2 },
          { level: 2, text: "Notes", line: 3 },
        ]),
      ),
    ).toBe(3);
  });
});
