import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { copyText } from "./clipboard";

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

function stubClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", { value, configurable: true });
}

afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
});

describe("copyText", () => {
  it("writes the text and resolves true", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ writeText });
    await expect(copyText("hello")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("resolves false when the clipboard API is missing", async () => {
    stubClipboard(undefined);
    await expect(copyText("hello")).resolves.toBe(false);
  });

  it("resolves false when the write is rejected", async () => {
    stubClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) });
    await expect(copyText("hello")).resolves.toBe(false);
  });
});
