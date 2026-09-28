import { describe, expect, it } from "vite-plus/test";
import { cn } from "./utils";

describe("cn", () => {
  it("joins class values and drops falsy entries", () => {
    const flags = { b: false, d: true, e: false };
    expect(cn("a", flags.b && "b", undefined, ["c", { d: flags.d, e: flags.e }])).toBe("a c d");
  });

  it("lets later Tailwind utilities override conflicting earlier ones", () => {
    expect(cn("p-2 text-text-muted", "px-3 text-text")).toBe("p-2 px-3 text-text");
  });
});
