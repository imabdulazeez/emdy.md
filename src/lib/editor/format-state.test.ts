import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorSelection, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vite-plus/test";
import { EMPTY_FORMATS, formatsEqual, getActiveFormats } from "./format-state";

function formatsAt(doc: string, anchor: number, head = anchor) {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.single(anchor, head),
    extensions: [markdown({ base: markdownLanguage })],
  });
  return getActiveFormats(state);
}

describe("getActiveFormats", () => {
  it("reports nothing for plain text", () => {
    expect(formatsAt("plain text", 3)).toEqual(EMPTY_FORMATS);
    expect(formatsAt("", 0)).toEqual(EMPTY_FORMATS);
  });

  it("detects inline marks around the cursor", () => {
    expect(formatsAt("**bold**", 4)).toMatchObject({ bold: true, italic: false });
    expect(formatsAt("*it*", 2)).toMatchObject({ italic: true });
    expect(formatsAt("~~gone~~", 3)).toMatchObject({ strikethrough: true });
    expect(formatsAt("`code`", 2)).toMatchObject({ code: true });
    expect(formatsAt("[a](https://x.y)", 2)).toMatchObject({ link: true });
  });

  it("treats the cursor right after a closing marker as inside the mark", () => {
    expect(formatsAt("**bold** more", 8).bold).toBe(true);
    expect(formatsAt("more **bold**", 5).bold).toBe(false);
  });

  it("uses the start of a forward selection for inline marks", () => {
    expect(formatsAt("**bold** more", 0, 10).bold).toBe(false);
    expect(formatsAt("**bold** more", 10, 2).bold).toBe(true);
  });

  it("detects heading levels", () => {
    expect(formatsAt("# One", 5).heading).toBe(1);
    expect(formatsAt("### Three", 0).heading).toBe(3);
    expect(formatsAt("Title\n=====", 2).heading).toBe(1);
    expect(formatsAt("text", 2).heading).toBe(0);
  });

  it("detects block containers at any column of the line", () => {
    expect(formatsAt("> quote", 0)).toMatchObject({ quote: true });
    expect(formatsAt("> quote", 7)).toMatchObject({ quote: true });
    expect(formatsAt("- item", 0)).toMatchObject({ bulletList: true, orderedList: false });
    expect(formatsAt("1. item", 7)).toMatchObject({ orderedList: true, bulletList: false });
    expect(formatsAt("- [ ] todo", 8)).toMatchObject({ bulletList: true, taskList: true });
    expect(formatsAt("```\ncode\n```", 5)).toMatchObject({ codeBlock: true });
  });

  it("reports only the innermost list type", () => {
    expect(formatsAt("1. outer\n   - inner", 15)).toMatchObject({
      bulletList: true,
      orderedList: false,
    });
  });

  it("ignores block context on an empty line", () => {
    expect(formatsAt("- item\n\ntext", 7)).toMatchObject({ bulletList: false });
  });
});

describe("formatsEqual", () => {
  it("compares every field", () => {
    expect(formatsEqual(EMPTY_FORMATS, { ...EMPTY_FORMATS })).toBe(true);
    expect(formatsEqual(EMPTY_FORMATS, { ...EMPTY_FORMATS, heading: 2 })).toBe(false);
    expect(formatsEqual(EMPTY_FORMATS, { ...EMPTY_FORMATS, bold: true })).toBe(false);
  });
});
