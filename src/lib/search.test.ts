import { describe, expect, it } from "vite-plus/test";
import { excerptAround, matcher, normalizeQuery, searchDocuments } from "./search";

const doc = (title: string, text = "") => ({ title, text });

describe("normalizeQuery", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeQuery("  weekly \n  sync ")).toBe("weekly sync");
    expect(normalizeQuery("   ")).toBe("");
  });
});

describe("matcher", () => {
  it("returns nothing for a blank query", () => {
    expect(matcher("")).toBeNull();
    expect(matcher(" \t ")).toBeNull();
  });

  it("matches case-insensitively and treats regex characters literally", () => {
    const pattern = matcher("C++ (draft)");
    expect(pattern?.test("notes on c++ (DRAFT) today")).toBe(true);
    expect(pattern?.test("notes on c (draft)")).toBe(false);
  });

  it("lets a space in the query match any run of whitespace", () => {
    expect(matcher("hello world")?.test("hello\n\n  world")).toBe(true);
  });
});

describe("excerptAround", () => {
  it("keeps short text whole without ellipses", () => {
    expect(excerptAround("find me here", 5, 2)).toEqual({
      before: "find ",
      match: "me",
      after: " here",
    });
  });

  it("clips long context on both sides and collapses line breaks", () => {
    const text = `${"a".repeat(40)}\n\nneedle\n${"b".repeat(120)}`;
    const excerpt = excerptAround(text, text.indexOf("needle"), 6);
    expect(excerpt.before).toBe(`…${"a".repeat(22)} `);
    expect(excerpt.match).toBe("needle");
    expect(excerpt.after).toBe(` ${"b".repeat(79)}…`);
  });
});

describe("searchDocuments", () => {
  const docs = [
    doc("Weekly sync", "Agenda and action items"),
    doc("Reading list", "Books to read this week"),
    doc("Project ideas", "A local-first markdown editor"),
  ];

  it("returns nothing for an empty query", () => {
    expect(searchDocuments(docs, "  ")).toEqual({ titles: [], contents: [] });
  });

  it("lists title matches once and content matches with an excerpt", () => {
    const results = searchDocuments(docs, "week");
    expect(results.titles.map((item) => item.title)).toEqual(["Weekly sync"]);
    expect(results.contents).toEqual([
      {
        item: docs[1],
        excerpt: { before: "Books to read this ", match: "week", after: "" },
      },
    ]);
  });

  it("keeps the original casing of the matched text", () => {
    const [match] = searchDocuments(docs, "MARKDOWN").contents;
    expect(match.excerpt.match).toBe("markdown");
  });

  it("returns empty groups when nothing matches", () => {
    expect(searchDocuments(docs, "zebra")).toEqual({ titles: [], contents: [] });
  });
});
