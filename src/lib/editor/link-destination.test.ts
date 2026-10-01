import { syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vite-plus/test";
import { createEditorExtensions } from "./extensions";
import { cleanUrl, isBareUrl, linkHref } from "./link-destination";

function hrefs(doc: string): string[] {
  const state = EditorState.create({ doc, extensions: createEditorExtensions() });
  const found: string[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === "Link" || node.name === "Autolink" || isBareUrl(node.node)) {
        found.push(linkHref(state, node.node));
      }
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

  it("links bare URLs, www addresses, and emails pasted into text", () => {
    expect(hrefs("See https://example.com/a?b=1, www.example.org and me@example.com.")).toEqual([
      "https://example.com/a?b=1",
      "https://www.example.org",
      "mailto:me@example.com",
    ]);
  });
});

describe("isBareUrl", () => {
  it("is true only for a URL outside a link, image, autolink, or reference", () => {
    const doc =
      "https://a.example [l](https://b.example) ![i](c.png) <https://d.example>\n\n[r]: e.md";
    const state = EditorState.create({ doc, extensions: createEditorExtensions() });
    const bare: string[] = [];
    syntaxTree(state).iterate({
      enter: (node) => {
        if (isBareUrl(node.node)) bare.push(state.sliceDoc(node.from, node.to));
      },
    });
    expect(bare).toEqual(["https://a.example"]);
  });
});
