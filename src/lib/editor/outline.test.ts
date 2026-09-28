import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vite-plus/test";
import { createEditorExtensions } from "./extensions";
import { activeOutlineIndex, OUTLINE_PARSE_BUDGET_MS, readOutline } from "./outline";

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
