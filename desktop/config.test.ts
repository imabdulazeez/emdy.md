import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import {
  defaultLibraryFolder,
  describeLocation,
  isDesktopConfig,
  readDesktopConfig,
  writeDesktopConfig,
} from "./config";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "emdy-config-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const fallback = { libraryFolder: "/Users/ada/Documents/emdy" };

describe("isDesktopConfig", () => {
  it("accepts an absolute library folder", () => {
    expect(isDesktopConfig({ libraryFolder: "/Users/ada/Notes" })).toBe(true);
  });

  it("rejects relative, empty, and malformed values", () => {
    expect(isDesktopConfig({ libraryFolder: "Notes" })).toBe(false);
    expect(isDesktopConfig({ libraryFolder: "" })).toBe(false);
    expect(isDesktopConfig({ libraryFolder: 3 })).toBe(false);
    expect(isDesktopConfig(null)).toBe(false);
    expect(isDesktopConfig("x")).toBe(false);
  });
});

describe("defaultLibraryFolder", () => {
  it("keeps development documents apart from the real library", () => {
    expect(defaultLibraryFolder("/Users/ada/Documents", false)).toBe(
      join("/Users/ada/Documents", "emdy"),
    );
    expect(defaultLibraryFolder("/Users/ada/Documents", true)).toBe(
      join("/Users/ada/Documents", "emdy-dev"),
    );
  });
});

describe("desktop config file", () => {
  it("falls back to the default when the file is missing, malformed, or invalid", async () => {
    const file = join(dir, "desktop.json");
    expect(await readDesktopConfig(file, fallback)).toEqual(fallback);
    await writeFile(file, "{not json");
    expect(await readDesktopConfig(file, fallback)).toEqual(fallback);
    await writeFile(file, JSON.stringify({ libraryFolder: "relative" }));
    expect(await readDesktopConfig(file, fallback)).toEqual(fallback);
  });

  it("writes the chosen folder and reads it back", async () => {
    const file = join(dir, "nested", "desktop.json");
    await writeDesktopConfig(file, { libraryFolder: "/Volumes/Notes" });
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ libraryFolder: "/Volumes/Notes" });
    expect(await readDesktopConfig(file, fallback)).toEqual({ libraryFolder: "/Volumes/Notes" });
  });

  it("drops unknown fields when reading", async () => {
    const file = join(dir, "desktop.json");
    await writeFile(file, JSON.stringify({ libraryFolder: "/Volumes/Notes", extra: true }));
    expect(await readDesktopConfig(file, fallback)).toEqual({ libraryFolder: "/Volumes/Notes" });
  });
});

describe("describeLocation", () => {
  it("names the folder after its last segment", () => {
    expect(describeLocation("/Users/ada/Documents/emdy")).toEqual({
      path: "/Users/ada/Documents/emdy",
      name: "emdy",
    });
    expect(describeLocation("/")).toEqual({ path: "/", name: "/" });
  });
});
