import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  EditorSelection,
  EditorState,
  type SelectionRange,
  type StateCommand,
  type Transaction,
} from "@codemirror/state";
import { describe, expect, it } from "vite-plus/test";
import {
  buildTable,
  insertFootnote,
  insertHorizontalRule,
  insertTable,
  insertTableWith,
  nextFootnoteLabel,
  selectedLines,
  setHeading,
  TABLE_TEMPLATE,
  toggleBlockquote,
  toggleBulletList,
  toggleCodeBlock,
  toggleHeading,
  toggleOrderedList,
  toggleTaskList,
} from "./block-commands";

function run(
  command: StateCommand,
  doc: string,
  anchor: number,
  head = anchor,
  extraRanges: SelectionRange[] = [],
) {
  let result: EditorState | null = null;
  const state = EditorState.create({
    doc,
    selection: EditorSelection.create([EditorSelection.range(anchor, head), ...extraRanges]),
    extensions: [
      markdown({ base: markdownLanguage }),
      EditorState.allowMultipleSelections.of(true),
    ],
  });
  const handled = command({
    state,
    dispatch: (tr: Transaction) => {
      result = tr.state;
    },
  });
  const next = result ?? state;
  return { handled, doc: next.doc.toString(), selection: next.selection.main, state: next };
}

describe("selectedLines", () => {
  it("collects unique lines across every selection range in order", () => {
    const state = EditorState.create({
      doc: "a\nb\nc\nd",
      extensions: [EditorState.allowMultipleSelections.of(true)],
      selection: EditorSelection.create([
        EditorSelection.range(6, 7),
        EditorSelection.range(0, 3),
        EditorSelection.cursor(2),
      ]),
    });
    expect(selectedLines(state).map((line) => line.text)).toEqual(["a", "b", "d"]);
  });
});

describe("headings", () => {
  it("sets a heading level on the current line and keeps the cursor with the text", () => {
    const { doc, selection } = run(setHeading(2), "Title", 3);
    expect(doc).toBe("## Title");
    expect(selection.head).toBe(6);
  });

  it("replaces an existing heading level", () => {
    expect(run(setHeading(1), "### Title", 4).doc).toBe("# Title");
    expect(run(setHeading(0), "### Title", 4).doc).toBe("Title");
  });

  it("converts setext headings without leaving the underline behind", () => {
    expect(run(setHeading(2), "Title\n=====", 2).doc).toBe("## Title");
    expect(run(toggleHeading(1), "Title\n=====", 2).doc).toBe("Title");
    expect(run(setHeading(1), "Title\n=====", 2).doc).toBe("Title\n=====");
    expect(run(setHeading(3), "Title\n-----", 8).doc).toBe("### Title");
  });

  it("removes optional closing markers when changing or removing a heading", () => {
    expect(run(setHeading(2), "# Title #", 3).doc).toBe("## Title");
    expect(run(toggleHeading(1), "# Title ###", 3).doc).toBe("Title");
  });

  it("toggles a heading off when every selected line already has that level", () => {
    expect(run(toggleHeading(2), "## a\n## b", 0, 9).doc).toBe("a\nb");
    expect(run(toggleHeading(2), "## a\nb", 0, 6).doc).toBe("## a\n## b");
  });

  it("skips blank lines in a multi-line selection", () => {
    expect(run(setHeading(3), "a\n\nb", 0, 4).doc).toBe("### a\n\n### b");
  });

  it("applies to an empty line so typing continues inside the heading", () => {
    const { doc, selection } = run(setHeading(1), "", 0);
    expect(doc).toBe("# ");
    expect(selection.head).toBe(2);
  });

  it("keeps list and quote markers ahead of the heading", () => {
    expect(run(setHeading(2), "> - item", 5).doc).toBe("> - ## item");
  });

  it("clamps levels into the 1-6 range", () => {
    expect(run(toggleHeading(9), "x", 0).doc).toBe("###### x");
    expect(run(setHeading(-1), "# x", 0).doc).toBe("x");
  });
});

describe("toggleBlockquote", () => {
  it("quotes every selected line including blank separators", () => {
    expect(run(toggleBlockquote, "a\n\nb", 0, 4).doc).toBe("> a\n>\n> b");
  });

  it("removes one quote level when everything is quoted", () => {
    expect(run(toggleBlockquote, "> a\n>\n> b", 0, 9).doc).toBe("a\n\nb");
    expect(run(toggleBlockquote, "> > nested", 4).doc).toBe("> nested");
  });

  it("quotes only the unquoted lines in a mixed selection", () => {
    expect(run(toggleBlockquote, "> a\nb", 0, 5).doc).toBe("> a\n> b");
  });

  it("moves the cursor past the inserted marker", () => {
    const { selection } = run(toggleBlockquote, "text", 0);
    expect(selection.head).toBe(2);
  });
});

describe("list toggles", () => {
  it("turns paragraphs into bullets and back", () => {
    expect(run(toggleBulletList, "a\nb", 0, 3).doc).toBe("- a\n- b");
    expect(run(toggleBulletList, "- a\n* b", 0, 7).doc).toBe("a\nb");
  });

  it("converts ordered and task items into bullets", () => {
    expect(run(toggleBulletList, "1. a\n- [ ] b", 0, 11).doc).toBe("- a\n- b");
  });

  it("numbers ordered lists sequentially and continues a list above", () => {
    expect(run(toggleOrderedList, "a\nb\nc", 0, 5).doc).toBe("1. a\n2. b\n3. c");
    expect(run(toggleOrderedList, "1. a\nb\nc", 5, 8).doc).toBe("1. a\n2. b\n3. c");
    expect(run(toggleOrderedList, "1) a\n2) b", 0, 9).doc).toBe("a\nb");
  });

  it("does not continue numbering from a differently indented list", () => {
    expect(run(toggleOrderedList, "  1. a\nb", 7).doc).toBe("  1. a\n1. b");
  });

  it("restarts numbering for non-contiguous selected groups", () => {
    expect(run(toggleOrderedList, "a\nb\nc", 0, 0, [EditorSelection.cursor(4)]).doc).toBe(
      "1. a\nb\n1. c",
    );
  });

  it("continues numbering only within the same quote depth", () => {
    const source = "> 1. quoted item\nplain";
    expect(run(toggleOrderedList, source, source.indexOf("plain")).doc).toBe(
      "> 1. quoted item\n1. plain",
    );
    const quoted = "> 1. first\n> second";
    expect(run(toggleOrderedList, quoted, quoted.indexOf("second")).doc).toBe(
      "> 1. first\n> 2. second",
    );
  });

  it("does not emit ordered markers outside CommonMark's range", () => {
    const source = "999999999. item\nnext";
    expect(run(toggleOrderedList, source, source.indexOf("next")).doc).toBe(
      "999999999. item\n1. next",
    );
  });

  it("adds and removes task boxes while keeping existing markers and states", () => {
    expect(run(toggleTaskList, "a\n* b\n2. [x] c", 0, 13).doc).toBe("- [ ] a\n* [ ] b\n2. [x] c");
    expect(run(toggleTaskList, "- [ ] a\n- [x] b", 0, 15).doc).toBe("a\nb");
  });

  it("leaves blank lines alone and keeps the selection on the text", () => {
    const { doc, selection } = run(toggleBulletList, "a\n\nb", 0, 4);
    expect(doc).toBe("- a\n\n- b");
    expect([selection.from, selection.to]).toEqual([2, 8]);
  });

  it("works with multiple cursors on the same line without duplicating changes", () => {
    const { doc } = run(toggleBulletList, "one two", 0, 0, [EditorSelection.cursor(5)]);
    expect(doc).toBe("- one two");
  });
});

describe("toggleCodeBlock", () => {
  it("wraps the selected lines in a fence and shifts the selection", () => {
    const { doc, selection } = run(toggleCodeBlock, "a\nb\nc", 2, 3);
    expect(doc).toBe("a\n```\nb\n```\nc");
    expect([selection.from, selection.to]).toEqual([6, 7]);
    expect(run(toggleCodeBlock, "a\nb\nc", 0, 5).doc).toBe("```\na\nb\nc\n```");
  });

  it("creates an empty block with the cursor inside", () => {
    const { doc, selection } = run(toggleCodeBlock, "", 0);
    expect(doc).toBe("```\n\n```");
    expect(selection.head).toBe(4);
  });

  it("removes the fences when the cursor is inside a code block", () => {
    const { doc, selection } = run(toggleCodeBlock, "x\n```js\ncode\n```\ny", 9);
    expect(doc).toBe("x\ncode\ny");
    expect(selection.head).toBe(3);
  });

  it("removes the fences of an empty block", () => {
    expect(run(toggleCodeBlock, "```\n```", 2).doc).toBe("");
  });

  it("removes only the opening fence when the block is unterminated", () => {
    expect(run(toggleCodeBlock, "```\ncode", 5).doc).toBe("code");
  });

  it("keeps mismatched and too-short closing fences as content", () => {
    expect(run(toggleCodeBlock, "````\ncode\n```", 7).doc).toBe("code\n```");
    expect(run(toggleCodeBlock, "~~~\ncode\n```", 6).doc).toBe("code\n```");
  });

  it("unwraps quoted fences and preserves list markers", () => {
    expect(run(toggleCodeBlock, "> ```\n> code\n> ```", 8).doc).toBe("> code");
    expect(run(toggleCodeBlock, "- ```\n  code\n  ```", 9).doc).toBe("- \n  code");
  });
});

describe("insertHorizontalRule", () => {
  it("inserts a rule after the current paragraph with a blank line between", () => {
    const { doc, selection } = run(insertHorizontalRule, "para", 2);
    expect(doc).toBe("para\n\n---\n");
    expect(selection.head).toBe(10);
  });

  it("uses an empty line directly and keeps a blank line above a paragraph", () => {
    expect(run(insertHorizontalRule, "para\n", 5).doc).toBe("para\n\n---\n");
    expect(run(insertHorizontalRule, "para\n\n", 6).doc).toBe("para\n\n---\n");
  });

  it("separates the rule from following content", () => {
    const { doc, selection } = run(insertHorizontalRule, "a\n\nb", 2);
    expect(doc).toBe("a\n\n---\n\nb");
    expect(selection.head).toBe(7);
    expect(run(insertHorizontalRule, "para\nnext", 2).doc).toBe("para\n\n---\n\nnext");
    expect(run(insertHorizontalRule, "para\n\nmore", 2).doc).toBe("para\n\n---\n\nmore");
  });
});

describe("buildTable", () => {
  it("defaults to a three-column table with a header and one body row", () => {
    expect(buildTable()).toBe(
      [
        "| Column 1 | Column 2 | Column 3 |",
        "| -------- | -------- | -------- |",
        "|          |          |          |",
      ].join("\n"),
    );
  });

  it("counts the header row within the requested row total", () => {
    const table = buildTable({ rows: 3, columns: 2, header: true });
    expect(table.split("\n")).toEqual([
      "| Column 1 | Column 2 |",
      "| -------- | -------- |",
      "|          |          |",
      "|          |          |",
    ]);
  });

  it("emits an empty header row when the header is excluded", () => {
    const table = buildTable({ rows: 2, columns: 2, header: false });
    expect(table.split("\n")).toEqual([
      "|     |     |",
      "| --- | --- |",
      "|     |     |",
      "|     |     |",
    ]);
  });

  it("clamps rows and columns to the supported range", () => {
    expect(buildTable({ rows: 0, columns: 0, header: false }).split("\n")).toHaveLength(3);
    expect(buildTable({ rows: 99, columns: 99, header: false }).split("\n")).toHaveLength(22);
    expect(buildTable({ rows: 1, columns: 99, header: true }).split("\n")).toHaveLength(2);
  });

  it("keeps every column aligned for wide header labels", () => {
    const table = buildTable({ rows: 1, columns: 10, header: true });
    const [head, rule] = table.split("\n");
    expect(head.endsWith("| Column 10 |")).toBe(true);
    expect(rule.endsWith("| --------- |")).toBe(true);
    expect(rule).toHaveLength(head.length);
  });
});

describe("insertTable", () => {
  it("inserts a template and selects the first header cell", () => {
    const { doc, selection } = run(insertTable, "", 0);
    expect(doc).toBe(`${TABLE_TEMPLATE}\n`);
    expect(doc.slice(selection.from, selection.to)).toBe("Column 1");
  });

  it("places the table after a non-empty line", () => {
    const { doc } = run(insertTable, "intro", 5);
    expect(doc).toBe(`intro\n\n${TABLE_TEMPLATE}\n`);
  });

  it("inserts the requested size and selects the first header cell", () => {
    const command = insertTableWith({ rows: 3, columns: 2, header: true });
    const { doc, selection } = run(command, "intro", 5);
    expect(doc).toBe(`intro\n\n${buildTable({ rows: 3, columns: 2, header: true })}\n`);
    expect(doc.slice(selection.from, selection.to)).toBe("Column 1");
  });

  it("places the cursor in the first body cell when there is no header", () => {
    const command = insertTableWith({ rows: 2, columns: 2, header: false });
    const { doc, selection } = run(command, "", 0);
    expect(selection.empty).toBe(true);
    const line = doc.slice(0, selection.head).split("\n").length;
    expect(line).toBe(3);
    expect(doc.slice(selection.head - 2, selection.head)).toBe("| ");
  });
});

describe("footnotes", () => {
  it("computes the next numeric label", () => {
    expect(nextFootnoteLabel("")).toBe("1");
    expect(nextFootnoteLabel("[^1]: a\n[^3]: b\n[^note]: c")).toBe("4");
    expect(nextFootnoteLabel("text [^2] without definition")).toBe("1");
    expect(nextFootnoteLabel("[^9007199254740992]: large")).toBe("9007199254740993");
  });

  it("inserts a reference and a definition at the end of the document", () => {
    const { doc, selection } = run(insertFootnote, "claim\n\nmore", 5);
    expect(doc).toBe("claim[^1]\n\nmore\n\n[^1]: ");
    expect(selection.head).toBe(doc.length);
  });

  it("numbers after existing definitions and respects trailing newlines", () => {
    expect(run(insertFootnote, "a\n\n[^1]: one\n", 1).doc).toBe("a[^2]\n\n[^1]: one\n\n[^2]: ");
    expect(run(insertFootnote, "a\n\n[^1]: one\n\n", 1).doc).toBe("a[^2]\n\n[^1]: one\n\n[^2]: ");
  });

  it("separates the definition when the reference is inserted at the end", () => {
    expect(run(insertFootnote, "", 0).doc).toBe("[^1]\n\n[^1]: ");
    expect(run(insertFootnote, "end", 3).doc).toBe("end[^1]\n\n[^1]: ");
  });

  it("appends the reference after a selection", () => {
    expect(run(insertFootnote, "some claim", 5, 10).doc).toBe("some claim[^1]\n\n[^1]: ");
  });
});
