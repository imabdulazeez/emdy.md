import { describe, expect, it } from "vite-plus/test";
import { contrast, isHexColor, luminance, mix, mostReadable, normalizeHex } from "./color";

describe("colour helpers", () => {
  it("accepts only lowercase six-digit hex colours", () => {
    expect(isHexColor("#a1b2c3")).toBe(true);
    expect(isHexColor("#A1B2C3")).toBe(false);
    expect(isHexColor("#abc")).toBe(false);
    expect(isHexColor("red")).toBe(false);
    expect(isHexColor(12)).toBe(false);
  });

  it("normalizes user input to canonical hex", () => {
    expect(normalizeHex("#ABCDEF")).toBe("#abcdef");
    expect(normalizeHex("  abcdef ")).toBe("#abcdef");
    expect(normalizeHex("#f0a")).toBe("#ff00aa");
    expect(normalizeHex("#abcd")).toBeNull();
    expect(normalizeHex("blue")).toBeNull();
    expect(normalizeHex("")).toBeNull();
  });

  it("mixes two colours in sRGB", () => {
    expect(mix("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mix("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mix("#ff0000", "#0000ff", 0.25)).toBe("#bf0040");
  });

  it("measures luminance and WCAG contrast", () => {
    expect(luminance("#000000")).toBe(0);
    expect(luminance("#ffffff")).toBeCloseTo(1);
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21);
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21);
    expect(contrast("#777777", "#777777")).toBeCloseTo(1);
  });

  it("picks the most readable candidate", () => {
    expect(mostReadable("#2d4bd1", ["#1b1b19", "#ffffff"])).toBe("#ffffff");
    expect(mostReadable("#8fa3ff", ["#1b1b1d", "#ebebe8"])).toBe("#1b1b1d");
  });
});
