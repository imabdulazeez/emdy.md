import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { parseTableSource } from "./table-source";
import { requestTableCopy, stripTablePrefix, tableCopyHandler } from "./table-copy";

let view: EditorView | undefined;

afterEach(() => {
  view?.destroy();
  view = undefined;
});

describe("stripTablePrefix", () => {
  it("leaves a table without a prefix alone", () => {
    const source = "| a |\n| - |\n| 1 |";
    expect(stripTablePrefix(source, 0)).toBe(source);
  });

  it("removes blockquote markers from every line", () => {
    expect(stripTablePrefix("> | a |\n> | - |\n> | 1 |", 2)).toBe("| a |\n| - |\n| 1 |");
  });

  it("removes a list marker from the first line and the indent from the rest", () => {
    expect(stripTablePrefix("- | a |\n  | - |\n  | 1 |", 2)).toBe("| a |\n| - |\n| 1 |");
  });

  it("keeps the pipe of a lazy continuation line with a shorter prefix", () => {
    const stripped = stripTablePrefix("> | a | b |\n>| - | - |\n| 1 | 2 |", 2);
    expect(stripped).toBe("| a | b |\n| - | - |\n| 1 | 2 |");
    expect(parseTableSource(stripped).rows).toEqual([["1", "2"]]);
  });

  it("handles nested prefixes", () => {
    expect(stripTablePrefix("> - | a |\n>   | - |", 4)).toBe("| a |\n| - |");
  });
});

describe("requestTableCopy", () => {
  const request = () => ({
    grid: parseTableSource("| a |\n| - |"),
    anchor: document.createElement("button"),
  });

  it("does nothing without a handler", () => {
    view = new EditorView({ state: EditorState.create({ doc: "" }), parent: document.body });
    expect(requestTableCopy(view, request())).toBe(false);
  });

  it("hands the request to the provided handler", () => {
    const handler = vi.fn();
    view = new EditorView({
      state: EditorState.create({ doc: "", extensions: tableCopyHandler.of(handler) }),
      parent: document.body,
    });
    const next = request();
    expect(requestTableCopy(view, next)).toBe(true);
    expect(handler).toHaveBeenCalledWith(next);
  });
});
