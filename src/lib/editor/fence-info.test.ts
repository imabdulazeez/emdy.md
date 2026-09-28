import { describe, expect, it } from "vite-plus/test";
import { fenceLabel, parseFenceInfo } from "./fence-info";

describe("parseFenceInfo", () => {
  it("reads a bare language", () => {
    expect(parseFenceInfo("ts")).toEqual({ language: "ts", title: null });
    expect(parseFenceInfo("  python \n")).toEqual({ language: "python", title: null });
  });

  it("returns an empty language for an empty info string", () => {
    expect(parseFenceInfo("")).toEqual({ language: "", title: null });
    expect(parseFenceInfo("   ")).toEqual({ language: "", title: null });
  });

  it("extracts quoted and unquoted title attributes", () => {
    expect(parseFenceInfo('ts title="src/main.ts"')).toEqual({
      language: "ts",
      title: "src/main.ts",
    });
    expect(parseFenceInfo("ts title='a b.ts'")).toEqual({ language: "ts", title: "a b.ts" });
    expect(parseFenceInfo("ts file=notes.md")).toEqual({ language: "ts", title: "notes.md" });
    expect(parseFenceInfo("ts filename=x.ts")).toEqual({ language: "ts", title: "x.ts" });
  });

  it("treats a bare filename token as the title", () => {
    expect(parseFenceInfo("ts src/lib/debounce.ts")).toEqual({
      language: "ts",
      title: "src/lib/debounce.ts",
    });
    expect(parseFenceInfo("ts {1,3}")).toEqual({ language: "ts", title: null });
  });

  it("never mistakes the language itself for a filename", () => {
    expect(parseFenceInfo("index.html")).toEqual({ language: "index.html", title: null });
  });
});

describe("fenceLabel", () => {
  it("prefers the title over the language", () => {
    expect(fenceLabel("ts")).toBe("ts");
    expect(fenceLabel('ts title="a.ts"')).toBe("a.ts");
    expect(fenceLabel("")).toBe("");
  });
});
