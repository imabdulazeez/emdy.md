import { describe, expect, it } from "vite-plus/test";
import { byteLength, hashText } from "./hash";

describe("hashText", () => {
  it("is deterministic and sixteen hex characters long", () => {
    expect(hashText("hello")).toBe(hashText("hello"));
    expect(hashText("hello")).toMatch(/^[0-9a-f]{16}$/);
    expect(hashText("")).toMatch(/^[0-9a-f]{16}$/);
  });

  it("distinguishes nearby inputs", () => {
    expect(hashText("hello")).not.toBe(hashText("hellp"));
    expect(hashText("ab")).not.toBe(hashText("ba"));
    expect(hashText("a")).not.toBe(hashText("a\n"));
  });
});

describe("byteLength", () => {
  it("counts UTF-8 bytes", () => {
    expect(byteLength("abc")).toBe(3);
    expect(byteLength("é")).toBe(2);
    expect(byteLength("日本")).toBe(6);
  });
});
