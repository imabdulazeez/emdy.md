import { describe, expect, it } from "vite-plus/test";
import { isExternalHref, isSafeHref } from "./href";

describe("isExternalHref", () => {
  it("treats a scheme or a protocol-relative host as external", () => {
    expect(isExternalHref("https://example.com/a.md")).toBe(true);
    expect(isExternalHref("mailto:me@example.com")).toBe(true);
    expect(isExternalHref("//example.com/a.md")).toBe(true);
  });

  it("treats paths and fragments as local", () => {
    expect(isExternalHref("Meeting%20notes.md")).toBe(false);
    expect(isExternalHref("/Meeting%20notes.md")).toBe(false);
    expect(isExternalHref("#set-up")).toBe(false);
    expect(isExternalHref("")).toBe(false);
  });
});

describe("isSafeHref", () => {
  it("allows relative paths, fragments, http(s) and mailto", () => {
    for (const href of [
      "/guide",
      "guide.html",
      "../notes/today",
      "#top",
      "https://x.y",
      "mailto:a@b.c",
    ]) {
      expect(isSafeHref(href)).toBe(true);
    }
  });

  it("rejects empty values and other schemes", () => {
    for (const href of [
      "",
      "javascript:alert(1)",
      "data:text/html,hi",
      "vbscript:x",
      "file:///etc/hosts",
    ]) {
      expect(isSafeHref(href)).toBe(false);
    }
  });

  it("rejects control characters the URL parser would strip", () => {
    for (const href of [
      "java\tscript:alert(1)",
      "java\nscript:alert(1)",
      "java\rscript:alert(1)",
      "\u0001javascript:alert(1)",
      "javascript\u0000:alert(1)",
    ]) {
      expect(isSafeHref(href)).toBe(false);
    }
  });
});
