import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { injectFirstPaintThemes } from "../src/lib/themes/first-paint";
import {
  contentSecurityPolicy,
  desktopHtml,
  desktopHtmlPlugin,
  inlineScriptHashes,
  stripWebOnlyTags,
} from "./html";

const indexHtml = injectFirstPaintThemes(
  readFileSync(resolve(process.cwd(), "index.html"), "utf8"),
);
const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("base64");

function policyOf(html: string): string {
  return /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1] ?? "";
}

describe("inlineScriptHashes", () => {
  it("hashes inline scripts that run and skips data blocks and external files", () => {
    const html = [
      "<script>one()</script>",
      '<script type="module">two()</script>',
      '<script type="application/ld+json">{"a":1}</script>',
      '<script type="module" src="/assets/index.js"></script>',
    ].join("\n");
    expect(inlineScriptHashes(html)).toEqual([sha("one()"), sha("two()")]);
  });
});

describe("contentSecurityPolicy", () => {
  it("allows only the bundle, the hashed scripts, and embedded images", () => {
    const policy = contentSecurityPolicy(["abc"]);
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("script-src 'self' 'sha256-abc'");
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).toContain("connect-src 'self' data: blob:");
    expect(policy).toContain("img-src 'self' data: blob: https: http:");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).toContain("form-action 'none'");
  });
});

describe("desktopHtml", () => {
  const html = desktopHtml(indexHtml);

  it("drops the web-only links, share cards, and structured data", () => {
    expect(html).not.toMatch(/rel="canonical"/);
    expect(html).not.toMatch(/rel="icon"/);
    expect(html).not.toMatch(/apple-touch-icon/);
    expect(html).not.toMatch(/og:/);
    expect(html).not.toMatch(/twitter:/);
    expect(html).not.toMatch(/application\/ld\+json/);
    expect(html).toMatch(/<meta\s+name="description"/);
  });

  it("keeps the first-paint script and allows exactly that script by hash", () => {
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
    expect(script).toContain('read("emdy:pref:theme")');
    expect(policyOf(html)).toContain(`'sha256-${sha(script)}'`);
    expect(policyOf(html)).not.toContain("'unsafe-inline' 'sha256");
  });

  it("puts the policy right after the charset so it covers every script", () => {
    const head = html.slice(0, html.indexOf("<title>"));
    expect(head).toMatch(/<meta charset="UTF-8" \/>\s*<meta http-equiv="Content-Security-Policy"/);
  });

  it("falls back to the top of the head when there is no charset tag", () => {
    const output = desktopHtml("<html><head><title>x</title></head></html>");
    expect(output).toMatch(/<head>\s*<meta http-equiv="Content-Security-Policy"/);
  });

  it("leaves unrelated markup alone when stripping", () => {
    const markup = '<link rel="stylesheet" href="/a.css"><meta name="description" content="x">';
    expect(stripWebOnlyTags(markup)).toBe(markup);
  });
});

describe("desktopHtmlPlugin", () => {
  it("runs last, only for builds", () => {
    const plugin = desktopHtmlPlugin();
    expect(plugin.apply).toBe("build");
    expect(plugin.transformIndexHtml).toMatchObject({ order: "post", handler: desktopHtml });
  });
});
