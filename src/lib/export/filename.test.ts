import { describe, expect, it } from "vite-plus/test";
import { DOCX_EXTENSION, exportFilename } from "./filename";

describe("exportFilename", () => {
  it("uses the sanitized title as the stem", () => {
    expect(exportFilename("Weekly sync: product/design", ".md")).toBe(
      "Weekly sync productdesign.md",
    );
    expect(exportFilename("Reading list", DOCX_EXTENSION)).toBe("Reading list.docx");
  });

  it("falls back to Untitled for empty or unsafe titles", () => {
    expect(exportFilename("   ", ".md")).toBe("Untitled.md");
    expect(exportFilename("...", ".md")).toBe("Untitled.md");
  });
});
