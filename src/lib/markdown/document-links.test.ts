import { describe, expect, it } from "vite-plus/test";
import {
  applyTextEdits,
  documentLink,
  documentLinkEdits,
  encodeLinkTarget,
  headingLink,
  parseLinkHref,
  type DocumentRename,
} from "./document-links";

const RENAME: DocumentRename = {
  from: "Meeting notes.md",
  to: "Team sync (Q4).md",
  fromTitle: "Meeting notes",
  toTitle: "Team sync (Q4)",
};

function rewrite(text: string, renames: readonly DocumentRename[] = [RENAME]): string {
  return applyTextEdits(text, documentLinkEdits(text, renames));
}

describe("links to documents and headings", () => {
  it("encodes characters that would break a link destination", () => {
    expect(encodeLinkTarget("Meeting notes.md")).toBe("Meeting%20notes.md");
    expect(encodeLinkTarget("Plan (v2) #1.md")).toBe("Plan%20%28v2%29%20%231.md");
    expect(encodeLinkTarget("100% [draft].md")).toBe("100%25%20%5Bdraft%5D.md");
    expect(encodeLinkTarget("Café.md")).toBe("Café.md");
  });

  it("escapes brackets and backslashes in labels", () => {
    expect(documentLink("Notes [old]", "Notes old.md")).toBe("[Notes \\[old\\]](Notes%20old.md)");
    expect(headingLink("Set up", "set-up")).toBe("[Set up](#set-up)");
  });
});

describe("parseLinkHref", () => {
  it("recognises links to other documents, with or without a heading", () => {
    expect(parseLinkHref("Meeting%20notes.md")).toEqual({
      kind: "document",
      file: "Meeting notes.md",
      heading: null,
    });
    expect(parseLinkHref("./Caf%C3%A9.md#Next%20Steps")).toEqual({
      kind: "document",
      file: "Café.md",
      heading: "next-steps",
    });
    expect(parseLinkHref("notes/Plan.MD?x=1")).toEqual({
      kind: "document",
      file: "Plan.MD",
      heading: null,
    });
  });

  it("recognises headings in the same document", () => {
    expect(parseLinkHref("#set-up")).toEqual({ kind: "heading", heading: "set-up" });
    expect(parseLinkHref("#")).toEqual({ kind: "heading", heading: null });
  });

  it("separates external links from anything else", () => {
    expect(parseLinkHref("https://example.com/a.md")).toEqual({ kind: "external" });
    expect(parseLinkHref("mailto:me@example.com")).toEqual({ kind: "external" });
    expect(parseLinkHref("//example.com/a.md")).toEqual({ kind: "external" });
    expect(parseLinkHref("image.png")).toEqual({ kind: "other" });
    expect(parseLinkHref(".md")).toEqual({ kind: "other" });
    expect(parseLinkHref("%E0%A4%A.md")).toEqual({
      kind: "document",
      file: "%E0%A4%A.md",
      heading: null,
    });
  });
});

describe("documentLinkEdits", () => {
  it("points links at the new file and follows the old title in the label", () => {
    expect(rewrite("See [Meeting notes](Meeting%20notes.md) today.")).toBe(
      "See [Team sync (Q4)](Team%20sync%20%28Q4%29.md) today.",
    );
  });

  it("keeps a label the writer changed and the heading fragment", () => {
    expect(rewrite("[the notes](Meeting%20notes.md#agenda)")).toBe(
      "[the notes](Team%20sync%20%28Q4%29.md#agenda)",
    );
  });

  it("rewrites angle-bracket destinations and reference definitions", () => {
    expect(rewrite("[Meeting notes](<Meeting notes.md>)")).toBe(
      "[Team sync (Q4)](<Team sync (Q4).md>)",
    );
    expect(rewrite("[notes][n]\n\n[n]: meeting%20NOTES.md")).toBe(
      "[notes][n]\n\n[n]: Team%20sync%20%28Q4%29.md",
    );
  });

  it("leaves code, other files, and external links alone", () => {
    const text = [
      "`[Meeting notes](Meeting%20notes.md)`",
      "",
      "```",
      "[Meeting notes](Meeting%20notes.md)",
      "```",
      "",
      "[Other](Other.md) [Web](https://example.com/Meeting%20notes.md)",
    ].join("\n");
    expect(rewrite(text)).toBe(text);
  });

  it("applies several renames in one pass without chaining them", () => {
    const swap: DocumentRename[] = [
      { from: "A.md", to: "B.md", fromTitle: "A", toTitle: "B" },
      { from: "B.md", to: "C.md", fromTitle: "B", toTitle: "C" },
    ];
    expect(rewrite("[A](A.md) and [B](B.md)", swap)).toBe("[B](B.md) and [C](C.md)");
  });

  it("does nothing without renames or links", () => {
    expect(documentLinkEdits("[A](A.md)", [])).toEqual([]);
    expect(documentLinkEdits("plain text", [RENAME])).toEqual([]);
  });
});
