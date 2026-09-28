import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { highlightTree, tags } from "@lezer/highlight";
import { describe, expect, it } from "vite-plus/test";
import { html, htmlCompletionSource } from "./html-stub";

describe("html stub", () => {
  it("offers no completions", () => {
    expect(htmlCompletionSource()).toBeNull();
  });

  it("stands in for the HTML language inside Markdown without breaking the Markdown tree", () => {
    const text = "# Title\n\n<div>inline <b>html</b></div>\n\nText with <kbd>K</kbd>.\n";
    const state = EditorState.create({
      doc: text,
      extensions: markdown({ base: markdownLanguage, htmlTagLanguage: html() }),
    });
    const names = new Set<string>();
    syntaxTree(state).iterate({ enter: (node) => void names.add(node.name) });
    expect(names).toContain("ATXHeading1");
    expect(names).toContain("HTMLBlock");
    expect(names).toContain("HTMLTag");
    expect(syntaxTree(state).length).toBe(text.length);
  });

  it("marks HTML comments, including ones spanning lines, as comments and nothing else", () => {
    const text = "<!-- a\nb -->\n\n<kbd>K</kbd>\n";
    const state = EditorState.create({
      doc: text,
      extensions: markdown({ base: markdownLanguage, htmlTagLanguage: html() }),
    });
    const style = HighlightStyle.define([{ tag: tags.comment, class: "cm-comment" }]);
    const covered = new Set<number>();
    highlightTree(syntaxTree(state), style, (from, to, classes) => {
      if (!classes.includes("cm-comment")) return;
      for (let pos = from; pos < to; pos++) covered.add(pos);
    });
    const end = text.indexOf("-->") + 3;
    const expected: number[] = [];
    for (let pos = 0; pos < end; pos++) if (text[pos] !== "\n") expected.push(pos);
    expect([...covered].sort((a, b) => a - b)).toEqual(expected);
  });
});
