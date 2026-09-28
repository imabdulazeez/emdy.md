import { describe, expect, it } from "vite-plus/test";
import { computeStats, countCharacters, countWords, formatReadingTime, readingTime } from "./stats";

describe("countWords", () => {
  it("returns 0 for empty input", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n\t")).toBe(0);
  });

  it("counts words separated by whitespace and punctuation", () => {
    expect(countWords("Hello, world! This is emdy.")).toBe(5);
  });

  it("keeps contractions and hyphenated words together", () => {
    expect(countWords("don't over-think it")).toBe(3);
  });

  it("ignores markdown punctuation", () => {
    expect(countWords("# Heading\n\n- **bold** item\n- `code`")).toBe(4);
  });

  it("counts unicode words", () => {
    expect(countWords("héllo wörld ñandú")).toBe(3);
  });
});

describe("countCharacters", () => {
  it("counts every character including whitespace", () => {
    expect(countCharacters("")).toBe(0);
    expect(countCharacters("ab c\n")).toBe(5);
  });
});

describe("readingTime", () => {
  it("returns 0 for no words", () => {
    expect(readingTime(0)).toBe(0);
  });

  it("returns at least one minute for short texts", () => {
    expect(readingTime(10)).toBe(1);
  });

  it("rounds to the nearest minute at 225 wpm", () => {
    expect(readingTime(225)).toBe(1);
    expect(readingTime(450)).toBe(2);
    expect(readingTime(1000)).toBe(4);
  });

  it("formats reading time", () => {
    expect(formatReadingTime(0)).toBe("0 min read");
    expect(formatReadingTime(3)).toBe("3 min read");
  });
});

describe("computeStats", () => {
  it("combines all statistics", () => {
    expect(computeStats("one two three")).toEqual({ words: 3, characters: 13, readingMinutes: 1 });
  });
});
