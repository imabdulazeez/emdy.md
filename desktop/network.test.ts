import { describe, expect, it } from "vite-plus/test";
import { isAllowedRequest, isExternalUrl, isGrantedPermission } from "./network";

describe("isAllowedRequest", () => {
  it("lets the app load its own bundle", () => {
    expect(isAllowedRequest("app://emdy/", "mainFrame", null)).toBe(true);
    expect(isAllowedRequest("app://emdy/assets/index.js", "script", null)).toBe(true);
    expect(isAllowedRequest("app://elsewhere/x.js", "script", null)).toBe(false);
  });

  it("allows in-memory and developer-tool URLs", () => {
    expect(isAllowedRequest("blob:app://emdy/123", "other", null)).toBe(true);
    expect(isAllowedRequest("data:image/png;base64,AAAA", "image", null)).toBe(true);
    expect(isAllowedRequest("devtools://devtools/bundled/x.js", "script", null)).toBe(true);
  });

  it("blocks every network request except images the document embeds", () => {
    expect(isAllowedRequest("https://example.com/beacon", "xhr", null)).toBe(false);
    expect(isAllowedRequest("https://example.com/app.js", "script", null)).toBe(false);
    expect(isAllowedRequest("https://example.com/font.woff2", "font", null)).toBe(false);
    expect(isAllowedRequest("wss://example.com/socket", "webSocket", null)).toBe(false);
    expect(isAllowedRequest("https://example.com/", "mainFrame", null)).toBe(false);
    expect(isAllowedRequest("https://example.com/photo.png", "image", null)).toBe(true);
    expect(isAllowedRequest("ftp://example.com/photo.png", "image", null)).toBe(false);
    expect(isAllowedRequest("file:///etc/passwd", "image", null)).toBe(false);
    expect(isAllowedRequest("not a url", "image", null)).toBe(false);
  });

  it("admits the dev server and its hot-reload socket only while developing", () => {
    const dev = "http://localhost:5173";
    expect(isAllowedRequest("http://localhost:5173/src/index.tsx", "script", dev)).toBe(true);
    expect(isAllowedRequest("ws://localhost:5173/?token=x", "webSocket", dev)).toBe(true);
    expect(isAllowedRequest("http://localhost:5174/", "script", dev)).toBe(false);
    expect(isAllowedRequest("http://localhost:5173/src/index.tsx", "script", null)).toBe(false);
    expect(isAllowedRequest("wss://localhost:5173/", "webSocket", "https://localhost:5173")).toBe(
      true,
    );
  });
});

describe("isExternalUrl", () => {
  it("opens web and mail links in the system handler", () => {
    expect(isExternalUrl("https://github.com/")).toBe(true);
    expect(isExternalUrl("http://example.com/")).toBe(true);
    expect(isExternalUrl("mailto:someone@example.com")).toBe(true);
  });

  it("never hands local or script URLs to the system", () => {
    expect(isExternalUrl("file:///Users/ada/secret.md")).toBe(false);
    expect(isExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isExternalUrl("app://emdy/")).toBe(false);
    expect(isExternalUrl("nonsense")).toBe(false);
  });
});

describe("isGrantedPermission", () => {
  it("grants clipboard writes and fullscreen but nothing that reaches out", () => {
    expect(isGrantedPermission("clipboard-sanitized-write")).toBe(true);
    expect(isGrantedPermission("fullscreen")).toBe(true);
    expect(isGrantedPermission("notifications")).toBe(false);
    expect(isGrantedPermission("geolocation")).toBe(false);
    expect(isGrantedPermission("media")).toBe(false);
    expect(isGrantedPermission("openExternal")).toBe(false);
  });
});
