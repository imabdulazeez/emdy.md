import { describe, expect, it } from "vite-plus/test";
import { formatBytes, storageUsage } from "./estimate";

describe("formatBytes", () => {
  it("picks a readable unit", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1_500)).toBe("1.5 KB");
    expect(formatBytes(12_345)).toBe("12 KB");
    expect(formatBytes(3_400_000)).toBe("3.4 MB");
    expect(formatBytes(120_000_000_000)).toBe("120 GB");
    expect(formatBytes(2e12)).toBe("2.0 TB");
    expect(formatBytes(-5)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
  });
});

describe("storageUsage", () => {
  it("reads usage and quota from the storage manager", async () => {
    const manager = { estimate: async () => ({ usage: 10, quota: 100 }) };
    expect(await storageUsage(manager)).toEqual({ usage: 10, quota: 100 });
  });

  it("returns null when the API is missing, malformed, or throws", async () => {
    expect(await storageUsage(undefined)).toBeNull();
    expect(await storageUsage({} as StorageManager)).toBeNull();
    expect(await storageUsage({ estimate: async () => ({}) })).toBeNull();
    expect(
      await storageUsage({
        estimate: async () => {
          throw new Error("no");
        },
      }),
    ).toBeNull();
  });
});
