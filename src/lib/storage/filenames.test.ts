import { describe, expect, it } from "vite-plus/test";
import {
  FALLBACK_STEM,
  MAX_STEM_BYTES,
  filenameFor,
  isMarkdownFile,
  sameFilename,
  sanitizeStem,
  titleFromFilename,
} from "./filenames";

describe("isMarkdownFile", () => {
  it("accepts .md files of any case and rejects dotfiles and other extensions", () => {
    expect(isMarkdownFile("Notes.md")).toBe(true);
    expect(isMarkdownFile("NOTES.MD")).toBe(true);
    expect(isMarkdownFile(".hidden.md")).toBe(false);
    expect(isMarkdownFile("index.json")).toBe(false);
    expect(isMarkdownFile("md")).toBe(false);
  });
});

describe("sanitizeStem", () => {
  it("strips characters that Windows and macOS forbid", () => {
    expect(sanitizeStem('a/b\\c:d*e?f"g<h>i|j')).toBe("abcdefghij");
    expect(sanitizeStem("tab\tnew\nline")).toBe("tabnewline");
  });

  it("collapses whitespace and trims trailing dots and spaces", () => {
    expect(sanitizeStem("  Weekly   sync ... ")).toBe("Weekly sync");
    expect(sanitizeStem("...leading")).toBe("leading");
  });

  it("keeps unicode and normalizes it to NFC", () => {
    expect(sanitizeStem("Café")).toBe("Café");
    expect(sanitizeStem("日本語のメモ — draft")).toBe("日本語のメモ — draft");
  });

  it("guards reserved device names and empty results", () => {
    expect(sanitizeStem("CON")).toBe("CON_");
    expect(sanitizeStem("com1")).toBe("com1_");
    expect(sanitizeStem("   ")).toBe(FALLBACK_STEM);
    expect(sanitizeStem("???")).toBe(FALLBACK_STEM);
  });

  it("caps the stem at the byte limit without splitting a character", () => {
    const stem = sanitizeStem("é".repeat(300));
    expect(new TextEncoder().encode(stem).length).toBeLessThanOrEqual(MAX_STEM_BYTES);
    expect(stem).toMatch(/^é+$/);
    expect(sanitizeStem("a".repeat(500))).toHaveLength(MAX_STEM_BYTES);
  });
});

describe("titleFromFilename", () => {
  it("drops the extension and tidies whitespace", () => {
    expect(titleFromFilename("Reading list.md")).toBe("Reading list");
    expect(titleFromFilename("  spaced   out .MD")).toBe("spaced out");
    expect(titleFromFilename("plain")).toBe("plain");
    expect(titleFromFilename(".md")).toBe(FALLBACK_STEM);
  });
});

describe("filenameFor", () => {
  it("adds numeric suffixes to avoid collisions, ignoring case", () => {
    expect(filenameFor("Untitled", [])).toBe("Untitled.md");
    expect(filenameFor("Untitled", ["untitled.md"])).toBe("Untitled 2.md");
    expect(filenameFor("Untitled", ["Untitled.md", "Untitled 2.md"])).toBe("Untitled 3.md");
  });

  it("lets a document keep its own filename", () => {
    expect(filenameFor("Notes", ["Notes.md", "Other.md"], "Notes.md")).toBe("Notes.md");
    expect(filenameFor("notes", ["Notes.md"], "Notes.md")).toBe("Notes.md");
    expect(filenameFor("Renamed", ["Notes.md", "Renamed.md"], "Notes.md")).toBe("Renamed 2.md");
    expect(filenameFor("notes", ["Notes.md", "Notes 2.md"], "Notes 2.md")).toBe("Notes 2.md");
  });

  it("compares filenames case-insensitively and by unicode form", () => {
    expect(sameFilename("Café.md", "café.MD")).toBe(true);
    expect(sameFilename("a.md", "b.md")).toBe(false);
  });
});
