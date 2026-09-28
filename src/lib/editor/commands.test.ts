import { markdown } from "@codemirror/lang-markdown";
import {
  EditorSelection,
  EditorState,
  type StateCommand,
  type Transaction,
} from "@codemirror/state";
import { describe, expect, it } from "vite-plus/test";
import {
  continueTaskList,
  dedentListItem,
  indentListItem,
  insertImage,
  insertLink,
  nextListMarker,
  toggleBold,
  toggleInlineCode,
  toggleItalic,
  toggleStrikethrough,
} from "./commands";

function run(command: StateCommand, doc: string, anchor: number, head = anchor) {
  let result: EditorState | null = null;
  const state = EditorState.create({
    doc,
    selection: EditorSelection.single(anchor, head),
    extensions: [markdown()],
  });
  const handled = command({
    state,
    dispatch: (tr: Transaction) => {
      result = tr.state;
    },
  });
  const next = result ?? state;
  return { handled, doc: next.doc.toString(), selection: next.selection.main };
}

describe("toggleBold", () => {
  it("wraps a selection in double asterisks", () => {
    const { doc, selection } = run(toggleBold, "hello world", 0, 5);
    expect(doc).toBe("**hello** world");
    expect([selection.from, selection.to]).toEqual([2, 7]);
  });

  it("unwraps an already bold selection", () => {
    const { doc } = run(toggleBold, "**hello** world", 2, 7);
    expect(doc).toBe("hello world");
  });

  it("unwraps when the markers are inside the selection", () => {
    const { doc, selection } = run(toggleBold, "**hello** world", 0, 9);
    expect(doc).toBe("hello world");
    expect([selection.from, selection.to]).toEqual([0, 5]);
  });

  it("wraps the word under an empty cursor", () => {
    const { doc } = run(toggleBold, "hello world", 2);
    expect(doc).toBe("**hello** world");
  });

  it("inserts an empty pair when there is no word", () => {
    const { doc, selection } = run(toggleBold, "hello ", 6);
    expect(doc).toBe("hello ****");
    expect(selection.head).toBe(8);
  });
});

describe("toggleItalic and toggleInlineCode", () => {
  it("wrap with single markers", () => {
    expect(run(toggleItalic, "abc", 0, 3).doc).toBe("*abc*");
    expect(run(toggleInlineCode, "abc", 0, 3).doc).toBe("`abc`");
    expect(run(toggleInlineCode, "`abc`", 1, 4).doc).toBe("abc");
  });
});

describe("insertLink", () => {
  it("wraps selected text and places the cursor in the url slot", () => {
    const { doc, selection } = run(insertLink, "see docs", 4, 8);
    expect(doc).toBe("see [docs]()");
    expect(selection.head).toBe(11);
  });

  it("uses a selected url as the destination", () => {
    const { doc, selection } = run(insertLink, "https://a.b", 0, 11);
    expect(doc).toBe("[](https://a.b)");
    expect(selection.head).toBe(1);
  });

  it("inserts an empty link when nothing is selected", () => {
    const { doc, selection } = run(insertLink, "", 0);
    expect(doc).toBe("[]()");
    expect(selection.head).toBe(1);
  });
});

describe("list indentation", () => {
  it("indents list items by the indent unit", () => {
    const { handled, doc } = run(indentListItem, "- a\n- b", 5);
    expect(handled).toBe(true);
    expect(doc).toBe("- a\n  - b");
  });

  it("indents ordered items", () => {
    expect(run(indentListItem, "1. a\n2. b", 6).doc).toBe("1. a\n  2. b");
  });

  it("does nothing outside lists so Tab keeps its default meaning", () => {
    const { handled, doc } = run(indentListItem, "plain", 2);
    expect(handled).toBe(false);
    expect(doc).toBe("plain");
  });

  it("dedents indented items", () => {
    expect(run(dedentListItem, "- a\n  - b", 8).doc).toBe("- a\n- b");
    expect(run(dedentListItem, "text", 1).handled).toBe(false);
  });

  it("indents every list line in a multi-line selection", () => {
    expect(run(indentListItem, "- a\n- b\n- c", 0, 11).doc).toBe("  - a\n  - b\n  - c");
  });
});

describe("continueTaskList", () => {
  it("continues an unchecked task on Enter", () => {
    const { handled, doc, selection } = run(continueTaskList, "- [x] done", 10);
    expect(handled).toBe(true);
    expect(doc).toBe("- [x] done\n- [ ] ");
    expect(selection.head).toBe(17);
  });

  it("keeps indentation and increments ordered markers", () => {
    expect(run(continueTaskList, "  1. [ ] a", 10).doc).toBe("  1. [ ] a\n  2. [ ] ");
  });

  it("removes an empty task marker instead of adding another", () => {
    const { doc, selection } = run(continueTaskList, "- [ ] ", 6);
    expect(doc).toBe("");
    expect(selection.head).toBe(0);
  });

  it("splits content after the cursor", () => {
    expect(run(continueTaskList, "- [ ] ab", 7).doc).toBe("- [ ] a\n- [ ] b");
  });

  it("returns false for non-task lines and for cursors inside the marker", () => {
    expect(run(continueTaskList, "- item", 6).handled).toBe(false);
    expect(run(continueTaskList, "- [ ] item", 2).handled).toBe(false);
    expect(run(continueTaskList, "- [ ] item", 0, 4).handled).toBe(false);
  });

  it("computes the next list marker", () => {
    expect(nextListMarker("-")).toBe("-");
    expect(nextListMarker("3.")).toBe("4.");
    expect(nextListMarker("9)")).toBe("10)");
  });
});

describe("toggleStrikethrough", () => {
  it("wraps and unwraps with double tildes", () => {
    expect(run(toggleStrikethrough, "gone", 0, 4).doc).toBe("~~gone~~");
    expect(run(toggleStrikethrough, "~~gone~~", 2, 6).doc).toBe("gone");
  });
});

describe("insertImage", () => {
  it("uses selected text as alt text and leaves the cursor in the url slot", () => {
    const { doc, selection } = run(insertImage, "logo", 0, 4);
    expect(doc).toBe("![logo]()");
    expect(selection.head).toBe(8);
  });

  it("uses a selected url as the source", () => {
    const { doc, selection } = run(insertImage, "https://a.b/c.png", 0, 17);
    expect(doc).toBe("![](https://a.b/c.png)");
    expect(selection.head).toBe(2);
  });

  it("uses only image data uris as sources", () => {
    const image = "data:image/png;base64,abc";
    expect(run(insertImage, image, 0, image.length).doc).toBe(`![](${image})`);
    const text = "data:text/plain,hello";
    expect(run(insertImage, text, 0, text.length).doc).toBe(`![${text}]()`);
  });

  it("inserts an empty image with the cursor in the alt slot", () => {
    const { doc, selection } = run(insertImage, "x ", 2);
    expect(doc).toBe("x ![]()");
    expect(selection.head).toBe(4);
  });
});
