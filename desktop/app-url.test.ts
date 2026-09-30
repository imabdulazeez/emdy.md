import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
  APP_URL,
  devServerOrigin,
  isAppDocument,
  resolveAppRequest,
  type AppRoots,
} from "./app-url";

const roots: AppRoots = {
  renderer: join("/app", "renderer"),
  dictionaries: join("/app", "dictionaries"),
};

describe("resolveAppRequest", () => {
  it("serves index.html for the app root and assets beside it", () => {
    expect(resolveAppRequest(APP_URL, roots)).toBe(join(roots.renderer, "index.html"));
    expect(resolveAppRequest(`${APP_URL}#/d/notes-abc123`, roots)).toBe(
      join(roots.renderer, "index.html"),
    );
    expect(resolveAppRequest("app://emdy/assets/index-abc.js", roots)).toBe(
      join(roots.renderer, "assets", "index-abc.js"),
    );
    expect(resolveAppRequest("app://emdy/assets/a%20b.css", roots)).toBe(
      join(roots.renderer, "assets", "a b.css"),
    );
  });

  it("serves bundled spellcheck dictionaries by file name only", () => {
    expect(resolveAppRequest("app://emdy/dictionaries/en-US-10-1.bdic", roots)).toBe(
      join(roots.dictionaries, "en-US-10-1.bdic"),
    );
    expect(resolveAppRequest("app://emdy/dictionaries/..%2F..%2Fmain.mjs", roots)).toBeNull();
    expect(resolveAppRequest("app://emdy/dictionaries/../../main.mjs", roots)).toBe(
      join(roots.renderer, "main.mjs"),
    );
    expect(resolveAppRequest("app://emdy/dictionaries/notes.txt", roots)).toBeNull();
  });

  it("refuses paths that escape the renderer folder", () => {
    expect(resolveAppRequest("app://emdy/..%2Fmain.mjs", roots)).toBeNull();
    expect(resolveAppRequest("app://emdy/assets/..%2F..%2Fpreload.cjs", roots)).toBeNull();
    expect(resolveAppRequest("app://emdy/%E0%A4%A", roots)).toBeNull();
    expect(resolveAppRequest("app://emdy/a%00b", roots)).toBeNull();
    expect(resolveAppRequest("app://emdy/a%5C..%5Cb", roots)).toBeNull();
  });

  it("ignores other hosts and schemes", () => {
    expect(resolveAppRequest("app://other/index.html", roots)).toBeNull();
    expect(resolveAppRequest("https://emdy/index.html", roots)).toBeNull();
    expect(resolveAppRequest("not a url", roots)).toBeNull();
  });
});

describe("devServerOrigin", () => {
  it("accepts an http dev server and drops its path", () => {
    expect(devServerOrigin("http://localhost:5173/")).toBe("http://localhost:5173");
  });

  it("rejects anything else", () => {
    expect(devServerOrigin(undefined)).toBeNull();
    expect(devServerOrigin("")).toBeNull();
    expect(devServerOrigin("file:///tmp/index.html")).toBeNull();
    expect(devServerOrigin("nonsense")).toBeNull();
  });
});

describe("isAppDocument", () => {
  it("accepts only the app root, with any fragment", () => {
    expect(isAppDocument(APP_URL, null)).toBe(true);
    expect(isAppDocument("app://emdy/#/settings", null)).toBe(true);
    expect(isAppDocument("app://emdy/assets/x.js", null)).toBe(false);
    expect(isAppDocument("app://other/", null)).toBe(false);
    expect(isAppDocument("https://example.com/", null)).toBe(false);
    expect(isAppDocument("garbage", null)).toBe(false);
  });

  it("accepts the dev server root while developing", () => {
    expect(isAppDocument("http://localhost:5173/#/d/x", "http://localhost:5173")).toBe(true);
    expect(isAppDocument("http://localhost:5173/", null)).toBe(false);
    expect(isAppDocument("http://localhost:4000/", "http://localhost:5173")).toBe(false);
  });
});
