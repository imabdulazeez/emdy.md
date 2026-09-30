import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { developmentIcon } from "./app-icon";

const appRoot = join("repo", "out", "desktop", "app");

describe("developmentIcon", () => {
  it("points the macOS Dock at the rounded mac icon in the repo", () => {
    expect(developmentIcon(appRoot, "darwin")).toBe(
      join("repo", "desktop", "resources", "icon-mac.png"),
    );
  });

  it("uses the square icon on Windows and Linux", () => {
    expect(developmentIcon(appRoot, "win32")).toBe(
      join("repo", "desktop", "resources", "icon.png"),
    );
    expect(developmentIcon(appRoot, "linux")).toBe(
      join("repo", "desktop", "resources", "icon.png"),
    );
  });

  it("resolves to icons that exist beside the built app", () => {
    const built = resolve("out", "desktop", "app");
    expect(existsSync(developmentIcon(built, "darwin"))).toBe(true);
    expect(existsSync(developmentIcon(built, "linux"))).toBe(true);
  });
});
