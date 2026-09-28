import { syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vite-plus/test";
import { createEditorExtensions } from "./extensions";
import { cleanUrl, linkHref } from "./link-destination";

function hrefs(doc: string): string[] {
  const state = EditorState.create({ doc, extensions: createEditorExtensions() });
  const found: string[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === "Link" || node.name === "Autolink") found.push(linkHref(state, node.node));
    },
  });
  return found;
}

describe("cleanUrl", () => {
  it("trims and drops angle brackets", () => {
    expect(cleanUrl("  <a b.md> ")).toBe("a b.md");
    expect(cleanUrl("a.md")).toBe("a.md");
  });
});

describe("linkHref", () => {
  it("resolves inline, angle-bracket, and reference destinations", () => {
    expect(
      hrefs(
        [
          "[a](A.md) [b](<B file.md>) [c][Ref  One] [Ref Two][] [ref two] [d][none]",
          "",
          "[ref one]: C.md",
          "[ref two]: <D file.md>",
          "[ref one]: ignored.md",
        ].join("\n"),
      ),
    ).toEqual(["A.md", "B file.md", "C.md", "D file.md", "D file.md", ""]);
  });

  it("adds mailto to a bare email autolink and keeps URL autolinks", () => {
    expect(hrefs("<me@example.com> <https://user@example.com> <mailto:a@b.c>")).toEqual([
      "mailto:me@example.com",
      "https://user@example.com",
      "mailto:a@b.c",
    ]);
  });
});
