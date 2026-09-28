import { describe, expect, it } from "vite-plus/test";
import { markdownHtmlStubPlugin } from "./html-stub-plugin";

const STUB = "/app/src/lib/editor/html-stub.ts";
const MARKDOWN =
  "/app/node_modules/.pnpm/@codemirror+lang-markdown@6.5.2/node_modules/@codemirror/lang-markdown/dist/index.js";
const LANGUAGE_DATA =
  "/app/node_modules/.pnpm/@codemirror+language-data@6.5.2/node_modules/@codemirror/language-data/dist/index.js";

describe("markdownHtmlStubPlugin", () => {
  const plugin = markdownHtmlStubPlugin(STUB);

  it("resolves the HTML language to the stub when the Markdown package imports it", () => {
    expect(plugin.resolveId("@codemirror/lang-html", MARKDOWN)).toBe(STUB);
    expect(plugin.resolveId("@codemirror/lang-html", MARKDOWN.replaceAll("/", "\\"))).toBe(STUB);
  });

  it("leaves the real HTML language for fenced code blocks and other importers", () => {
    expect(plugin.resolveId("@codemirror/lang-html", LANGUAGE_DATA)).toBeNull();
    expect(plugin.resolveId("@codemirror/lang-html", "/app/src/main.ts")).toBeNull();
    expect(plugin.resolveId("@codemirror/lang-html")).toBeNull();
  });

  it("ignores every other import from the Markdown package", () => {
    expect(plugin.resolveId("@codemirror/language", MARKDOWN)).toBeNull();
    expect(plugin.resolveId("@lezer/markdown", MARKDOWN)).toBeNull();
  });
});
