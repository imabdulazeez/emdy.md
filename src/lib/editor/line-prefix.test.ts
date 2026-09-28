import { describe, expect, it } from "vite-plus/test";
import {
  formatLine,
  formatLinePrefix,
  isBlankLine,
  isOrderedMarker,
  orderedMarker,
  parseLinePrefix,
} from "./line-prefix";

describe("parseLinePrefix", () => {
  it("parses plain text", () => {
    expect(parseLinePrefix("hello")).toEqual({
      indent: "",
      quote: "",
      marker: null,
      gap: "",
      task: null,
      heading: 0,
      content: "hello",
      closing: "",
    });
  });

  it("parses indentation, quotes, list markers, tasks, and headings", () => {
    expect(parseLinePrefix("  > > - [x] ## Title")).toEqual({
      indent: "  ",
      quote: "> > ",
      marker: "-",
      gap: " ",
      task: "x",
      heading: 2,
      content: "Title",
      closing: "",
    });
  });

  it("parses nested block markers after quote spacing", () => {
    expect(parseLinePrefix(">   # title")).toMatchObject({
      quote: ">   ",
      heading: 1,
      content: "title",
    });
    expect(parseLinePrefix(">   - item")).toMatchObject({
      quote: ">   ",
      marker: "-",
      content: "item",
    });
  });

  it("parses ordered markers with either delimiter", () => {
    expect(parseLinePrefix("12. item").marker).toBe("12.");
    expect(parseLinePrefix("3) item").marker).toBe("3)");
    expect(parseLinePrefix("3)item").marker).toBeNull();
  });

  it("keeps indentation after a list separator in the content", () => {
    expect(parseLinePrefix("-     code")).toMatchObject({
      marker: "-",
      gap: " ",
      content: "    code",
    });
  });

  it("does not parse block markers after code indentation", () => {
    expect(parseLinePrefix("    # code")).toMatchObject({
      indent: "    ",
      heading: 0,
      content: "# code",
    });
    expect(parseLinePrefix("\t> code")).toMatchObject({
      indent: "\t",
      quote: "",
      content: "> code",
    });
    expect(parseLinePrefix("    - code")).toMatchObject({
      indent: "    ",
      marker: null,
      content: "- code",
    });
  });

  it("removes optional closing heading markers from content", () => {
    expect(parseLinePrefix("# Title #")).toMatchObject({
      heading: 1,
      content: "Title",
      closing: " #",
    });
    expect(parseLinePrefix("# C#")).toMatchObject({ heading: 1, content: "C#", closing: "" });
  });

  it("does not mistake emphasis or rules for list markers", () => {
    expect(parseLinePrefix("*emphasis*").marker).toBeNull();
    expect(parseLinePrefix("---").marker).toBeNull();
    expect(parseLinePrefix("#hashtag").heading).toBe(0);
    expect(parseLinePrefix("####### seven").heading).toBe(0);
    expect(parseLinePrefix("* * *").marker).toBeNull();
    expect(parseLinePrefix("- - -").marker).toBeNull();
  });

  it("accepts markers at the end of a line", () => {
    expect(parseLinePrefix("-")).toMatchObject({ marker: "-", gap: "", content: "" });
    expect(parseLinePrefix("- [ ]")).toMatchObject({ marker: "-", task: " ", content: "" });
    expect(parseLinePrefix("#")).toMatchObject({ heading: 1, content: "" });
    expect(parseLinePrefix(">")).toMatchObject({ quote: ">", content: "" });
  });

  it("only reads tasks inside list items", () => {
    expect(parseLinePrefix("[ ] not a task")).toMatchObject({
      task: null,
      content: "[ ] not a task",
    });
  });
});

describe("formatLinePrefix and formatLine", () => {
  it("round-trips a parsed prefix", () => {
    const text = "  > 1. [ ] ### Heading text";
    expect(formatLine(parseLinePrefix(text))).toBe(text);
    expect(formatLine(parseLinePrefix("# Heading ###  "))).toBe("# Heading ###  ");
  });

  it("normalises spacing after markers", () => {
    expect(
      formatLinePrefix({ indent: "", quote: "", marker: "-", gap: "", task: null, heading: 0 }),
    ).toBe("- ");
    expect(
      formatLinePrefix({ indent: "", quote: "", marker: null, gap: "", task: null, heading: 3 }),
    ).toBe("### ");
  });
});

describe("marker helpers", () => {
  it("recognises ordered markers", () => {
    expect(isOrderedMarker("1.")).toBe(true);
    expect(isOrderedMarker("-")).toBe(false);
    expect(isOrderedMarker(null)).toBe(false);
  });

  it("keeps the delimiter when renumbering", () => {
    expect(orderedMarker(4, "1)")).toBe("4)");
    expect(orderedMarker(2, "-")).toBe("2.");
    expect(orderedMarker(1, null)).toBe("1.");
    expect(orderedMarker(1_000_000_000, "1.")).toBe("1.");
  });

  it("detects blank lines", () => {
    expect(isBlankLine("  \t")).toBe(true);
    expect(isBlankLine(" x")).toBe(false);
    expect(isBlankLine("\u00a0")).toBe(false);
  });
});
