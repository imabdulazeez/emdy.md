import { describe, expect, it } from "vite-plus/test";
import { TEST_DOCUMENTS } from "~/test-documents";
import {
  HOME_TITLE,
  deriveTitle,
  isAutomaticTitle,
  MAX_DERIVED_TITLE_LENGTH,
  pageTitle,
  stripInlineMarkdown,
  truncateTitle,
  UNTITLED,
} from "./title";

describe("deriveTitle", () => {
  it("falls back to Untitled for empty or blank text", () => {
    expect(deriveTitle("")).toBe(UNTITLED);
    expect(deriveTitle("   \n\n\t\n")).toBe(UNTITLED);
  });

  it("uses an ATX heading without its markers", () => {
    expect(deriveTitle("# Meeting notes\n\nbody")).toBe("Meeting notes");
    expect(deriveTitle("### Deep heading")).toBe("Deep heading");
    expect(deriveTitle("   # Indented")).toBe("Indented");
    expect(deriveTitle("## Closed heading ##")).toBe("Closed heading");
    expect(deriveTitle("# C# tips")).toBe("C# tips");
  });

  it("does not treat hashes without a space as a heading", () => {
    expect(deriveTitle("#hashtag idea")).toBe("#hashtag idea");
    expect(deriveTitle("    # four spaces is code")).toBe("# four spaces is code");
  });

  it("skips empty headings", () => {
    expect(deriveTitle("#\n\nReal first line")).toBe("Real first line");
    expect(deriveTitle("## ##\n\nAfter")).toBe("After");
  });

  it("uses the first line of plain prose", () => {
    expect(deriveTitle("Groceries\n- eggs\n- milk")).toBe("Groceries");
    expect(deriveTitle("\n\n  Leading blank lines\nsecond")).toBe("Leading blank lines");
  });

  it("uses the first textual line rather than a later heading", () => {
    expect(deriveTitle("Meeting with Bob\n\n# Action items")).toBe("Meeting with Bob");
  });

  it("uses the text of a setext heading and skips its underline", () => {
    expect(deriveTitle("Setext title\n============\n\nbody")).toBe("Setext title");
    expect(deriveTitle("Second level\n------------")).toBe("Second level");
  });

  it("reads the title from YAML front matter", () => {
    expect(deriveTitle("---\ntitle: From front matter\ntags: [a]\n---\n# Heading")).toBe(
      "From front matter",
    );
    expect(deriveTitle('---\ntitle: "Quoted: title"\n---\n')).toBe("Quoted: title");
    expect(deriveTitle("---\nTitle: 'Single quoted'\n...\nbody")).toBe("Single quoted");
  });

  it("skips front matter without a title", () => {
    expect(deriveTitle("---\ntags: [a, b]\ndate: 2026-09-25\n---\n\n# Body heading")).toBe(
      "Body heading",
    );
    expect(deriveTitle("---\ntitle:\n---\nBody line")).toBe("Body line");
  });

  it("treats an unclosed front matter fence as a thematic break", () => {
    expect(deriveTitle("---\ntitle: Not front matter")).toBe("title: Not front matter");
  });

  it("ignores front matter that does not start on the first line", () => {
    expect(deriveTitle("Intro\n---\ntitle: nope\n---")).toBe("Intro");
  });

  it("skips fenced code blocks", () => {
    expect(deriveTitle("```js\nconst x = 1;\n```\n\nAfter code")).toBe("After code");
    expect(deriveTitle("~~~\n# not a heading\n~~~\n# Real")).toBe("Real");
    expect(deriveTitle("````\n```\ninner\n```\n````\nOuter")).toBe("Outer");
  });

  it("does not close a fence with a different marker or a shorter run", () => {
    expect(deriveTitle("```\n~~~\nstill code\n```\nDone")).toBe("Done");
    expect(deriveTitle("````\n```\nstill code\n````\nDone")).toBe("Done");
  });

  it("returns Untitled when an unclosed fence swallows the rest", () => {
    expect(deriveTitle("```\ncode forever")).toBe(UNTITLED);
  });

  it("skips thematic breaks, tables, and reference definitions", () => {
    expect(deriveTitle("***\n\nAfter rule")).toBe("After rule");
    expect(deriveTitle("- - -\nAfter spaced rule")).toBe("After spaced rule");
    expect(deriveTitle("| a | b |\n|---|---|\n| 1 | 2 |\n\nBelow table")).toBe("Below table");
    expect(deriveTitle("[ref]: https://example.com\n\nText")).toBe("Text");
    expect(deriveTitle("[^1]: A footnote\n\nText")).toBe("Text");
  });

  it("skips HTML comments, single and multi-line", () => {
    expect(deriveTitle("<!-- note -->\nVisible")).toBe("Visible");
    expect(deriveTitle("<!--\nhidden\nlines\n-->\nVisible")).toBe("Visible");
    expect(deriveTitle("Before <!-- inline --> after")).toBe("Before after");
  });

  it("skips lines that are only images or markup", () => {
    expect(deriveTitle("![logo](logo.png)\n\n# Project")).toBe("Project");
    expect(deriveTitle("[![build](badge.svg)](https://ci)\n\n# Project")).toBe("Project");
    expect(deriveTitle('<p align="center">\n\n# Project')).toBe("Project");
  });

  it("uses the text inside HTML headings", () => {
    expect(deriveTitle("<h1>Html title</h1>")).toBe("Html title");
  });

  it("strips list, quote, and task markers", () => {
    expect(deriveTitle("- First bullet")).toBe("First bullet");
    expect(deriveTitle("* star bullet")).toBe("star bullet");
    expect(deriveTitle("+ plus bullet")).toBe("plus bullet");
    expect(deriveTitle("1. Ordered item")).toBe("Ordered item");
    expect(deriveTitle("12) Paren item")).toBe("Paren item");
    expect(deriveTitle("> Quoted line")).toBe("Quoted line");
    expect(deriveTitle("> - [ ] Nested task")).toBe("Nested task");
    expect(deriveTitle("- [x] Done task")).toBe("Done task");
  });

  it("does not strip a year or number that is not a list marker", () => {
    expect(deriveTitle("2026 plans")).toBe("2026 plans");
    expect(deriveTitle("3.14 is pi")).toBe("3.14 is pi");
  });

  it("strips inline formatting from headings", () => {
    expect(deriveTitle("# **Bold** and _italic_ with `code`")).toBe("Bold and italic with code");
    expect(deriveTitle("# [Linked](https://example.com) title")).toBe("Linked title");
  });

  it("handles Windows and old Mac line endings", () => {
    expect(deriveTitle("# Windows\r\nbody")).toBe("Windows");
    expect(deriveTitle("\r\rMac\rbody")).toBe("Mac");
  });

  it("ignores a byte order mark", () => {
    expect(deriveTitle("﻿# Bom title")).toBe("Bom title");
  });

  it("collapses internal whitespace", () => {
    expect(deriveTitle("#   Lots    of\tspace  ")).toBe("Lots of space");
  });

  it("keeps non-Latin scripts and emoji", () => {
    expect(deriveTitle("# 会議メモ")).toBe("会議メモ");
    expect(deriveTitle("# Заметки")).toBe("Заметки");
    expect(deriveTitle("# 🚀 Launch plan")).toBe("🚀 Launch plan");
  });

  it("truncates long first lines at a word boundary", () => {
    const line = "This is a very long first line that keeps going well past the limit we set";
    const result = deriveTitle(line);
    expect(result.length).toBeLessThanOrEqual(MAX_DERIVED_TITLE_LENGTH);
    expect(line.startsWith(result)).toBe(true);
    expect(result.endsWith(" ")).toBe(false);
    expect(line[result.length]).toBe(" ");
  });

  it("only scans the start of very large documents", () => {
    const text = `${"\n".repeat(20_000)}Too far down`;
    expect(deriveTitle(text)).toBe(UNTITLED);
  });

  it("matches the titles of the test documents", () => {
    for (const seed of TEST_DOCUMENTS) expect(deriveTitle(seed.text)).toBe(seed.title);
  });
});

describe("stripInlineMarkdown", () => {
  it("removes emphasis, strike, and highlight markers", () => {
    expect(stripInlineMarkdown("**bold** __strong__ ~~gone~~ ==mark==")).toBe(
      "bold strong gone mark",
    );
    expect(stripInlineMarkdown("*em* and _em_")).toBe("em and em");
    expect(stripInlineMarkdown("***both***")).toBe("both");
  });

  it("leaves underscores and asterisks inside words alone", () => {
    expect(stripInlineMarkdown("snake_case_name")).toBe("snake_case_name");
    expect(stripInlineMarkdown("2 * 3 * 4")).toBe("2 * 3 * 4");
  });

  it("unwraps links and drops images and footnote references", () => {
    expect(stripInlineMarkdown("see [the docs](https://x.dev) now")).toBe("see the docs now");
    expect(stripInlineMarkdown("see [the docs][ref] now")).toBe("see the docs now");
    expect(stripInlineMarkdown("pic ![alt](a.png) here")).toBe("pic here");
    expect(stripInlineMarkdown("claim[^1] made")).toBe("claim made");
    expect(stripInlineMarkdown("<https://example.com>")).toBe("https://example.com");
  });

  it("unwraps code spans", () => {
    expect(stripInlineMarkdown("run `npm test` now")).toBe("run npm test now");
    expect(stripInlineMarkdown("``a ` b``")).toBe("a ` b");
  });

  it("removes HTML tags but keeps comparisons", () => {
    expect(stripInlineMarkdown("<b>bold</b> <br/> text")).toBe("bold text");
    expect(stripInlineMarkdown("a < b > c")).toBe("a < b > c");
  });

  it("unescapes backslash escapes and common entities", () => {
    expect(stripInlineMarkdown("\\*not em\\* \\# hash")).toBe("*not em* # hash");
    expect(stripInlineMarkdown("Tom &amp; Jerry &lt;3 &quot;q&quot; &#39;s&#39;")).toBe(
      "Tom & Jerry <3 \"q\" 's'",
    );
    expect(stripInlineMarkdown("a&nbsp;b")).toBe("a b");
  });
});

describe("truncateTitle", () => {
  it("returns short values unchanged", () => {
    expect(truncateTitle("Short")).toBe("Short");
    expect(truncateTitle("x".repeat(MAX_DERIVED_TITLE_LENGTH))).toBe(
      "x".repeat(MAX_DERIVED_TITLE_LENGTH),
    );
  });

  it("cuts at the last space inside the limit", () => {
    expect(truncateTitle("alpha beta gamma delta", 12)).toBe("alpha beta");
  });

  it("hard-cuts when there is no usable space", () => {
    expect(truncateTitle("a".repeat(100), 10)).toBe("a".repeat(10));
    expect(truncateTitle("ab cdefghijklmnop", 10)).toBe("ab cdefghi");
  });

  it("trims trailing punctuation left by the cut", () => {
    expect(truncateTitle("one, two, three four", 9)).toBe("one, two");
    expect(truncateTitle("first — second third", 8)).toBe("first");
  });

  it("never splits an emoji or combining sequence", () => {
    const family = "👨‍👩‍👧‍👦";
    expect(truncateTitle(family.repeat(5), 3)).toBe(family.repeat(3));
    expect(truncateTitle("é".repeat(5), 2)).toBe("éé");
  });

  it("hard-cuts scripts written without spaces", () => {
    expect(truncateTitle("日本語".repeat(30), 10)).toBe("日本語日本語日本語日");
  });
});

describe("isAutomaticTitle", () => {
  it("treats Untitled and numbered Untitled as automatic", () => {
    expect(isAutomaticTitle("Untitled", "# Anything")).toBe(true);
    expect(isAutomaticTitle("Untitled 2", "# Anything")).toBe(true);
    expect(isAutomaticTitle("Untitled 14", "")).toBe(true);
  });

  it("treats a title matching the derived title as automatic", () => {
    expect(isAutomaticTitle("Meeting notes", "# Meeting notes\n\nbody")).toBe(true);
    expect(isAutomaticTitle("Groceries", "Groceries\n- eggs")).toBe(true);
  });

  it("treats any other title as chosen by the user", () => {
    expect(isAutomaticTitle("My plan", "# Meeting notes")).toBe(false);
    expect(isAutomaticTitle("Untitled draft", "")).toBe(false);
    expect(isAutomaticTitle("Untitled2", "")).toBe(false);
    expect(isAutomaticTitle("Meeting notes (conflict)", "# Meeting notes")).toBe(false);
    expect(isAutomaticTitle("Meeting notes 2", "# Meeting notes")).toBe(false);
  });
});

describe("pageTitle", () => {
  it("names the page after the document, then the app", () => {
    expect(pageTitle("Zanzibar itinerary")).toBe("Zanzibar itinerary · emdy");
  });

  it("falls back to the descriptive home title", () => {
    expect(pageTitle(null)).toBe(HOME_TITLE);
    expect(pageTitle("")).toBe(HOME_TITLE);
    expect(HOME_TITLE).toBe("emdy · Private Markdown editor that runs in your browser");
  });
});
