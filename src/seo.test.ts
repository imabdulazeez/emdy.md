import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { HOME_TITLE } from "./lib/title";

const ORIGIN = "https://emdy.md";
const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const page = new DOMParser().parseFromString(read("index.html"), "text/html");

function meta(attribute: "name" | "property", key: string): string | null {
  return page.head.querySelector(`meta[${attribute}="${key}"]`)?.getAttribute("content") ?? null;
}

describe("index.html metadata", () => {
  it("opens with the same title the app restores when no document is open", () => {
    expect(page.title).toBe(HOME_TITLE);
    expect(meta("property", "og:title")).toBe(HOME_TITLE);
    expect(HOME_TITLE.length).toBeLessThanOrEqual(60);
  });

  it("describes the app in a snippet-sized description", () => {
    const description = meta("name", "description")!;
    expect(description).toMatch(/Markdown editor/);
    expect(description.length).toBeGreaterThanOrEqual(70);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(meta("property", "og:description")!.length).toBeLessThanOrEqual(200);
  });

  it("names the apex origin as canonical so www does not compete with it", () => {
    expect(page.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      `${ORIGIN}/`,
    );
    expect(meta("property", "og:url")).toBe(`${ORIGIN}/`);
  });

  it("points social cards and icons at files that ship in public", () => {
    const image = meta("property", "og:image")!;
    expect(image.startsWith(`${ORIGIN}/`)).toBe(true);
    expect(existsSync(resolve(root, "public", new URL(image).pathname.slice(1)))).toBe(true);
    expect(meta("name", "twitter:card")).toBe("summary_large_image");
    for (const link of page.head.querySelectorAll(
      'link[rel~="icon"], link[rel="apple-touch-icon"]',
    ))
      expect(existsSync(resolve(root, "public", link.getAttribute("href")!.slice(1)))).toBe(true);
  });

  it("declares the site and app as structured data without invented ratings", () => {
    const script = page.head.querySelector('script[type="application/ld+json"]')!;
    const data = JSON.parse(script.textContent!) as { "@graph": Record<string, unknown>[] };
    const types = data["@graph"].map((node) => node["@type"]);
    expect(types).toEqual(["WebSite", "WebApplication"]);
    for (const node of data["@graph"]) {
      expect(node.url).toBe(`${ORIGIN}/`);
      expect(node.name).toBe("emdy.md");
      expect(node).not.toHaveProperty("aggregateRating");
      expect(node).not.toHaveProperty("review");
    }
  });

  it("gives crawlers without JavaScript a heading and a description", () => {
    const fallback = page.body.querySelector("noscript")!;
    expect(fallback.querySelector("h1")?.textContent).toMatch(/Markdown editor/);
    expect(fallback.querySelectorAll("li").length).toBeGreaterThan(0);
  });

  it("references only its own origin, so the page never makes third-party requests", () => {
    const urls = [...read("index.html").matchAll(/https?:\/\/[^\s"'<>)]+/g)].map(([url]) => url);
    for (const url of urls) expect(url).toMatch(/^https:\/\/(?:emdy\.md|schema\.org)(?:\/|$)/);
  });
});

describe("wrangler.jsonc", () => {
  it("serves the app from the apex only, leaving www to the zone's redirect rule", () => {
    const routes = [...read("wrangler.jsonc").matchAll(/"pattern": "([^"]+)"/g)].map(
      ([, pattern]) => pattern,
    );
    expect(routes).toEqual(["emdy.md"]);
  });
});

describe("crawler files", () => {
  it("allows crawling and names the sitemap", () => {
    const robots = read("public/robots.txt");
    expect(robots).toMatch(/^User-agent: \*$/m);
    expect(robots).not.toMatch(/^Disallow: \/$/m);
    expect(robots).toMatch(new RegExp(`^Sitemap: ${ORIGIN}/sitemap\\.xml$`, "m"));
  });

  it("lists only the canonical root, since documents live in the URL fragment", () => {
    const sitemap = new DOMParser().parseFromString(read("public/sitemap.xml"), "application/xml");
    expect([...sitemap.getElementsByTagName("loc")].map((loc) => loc.textContent)).toEqual([
      `${ORIGIN}/`,
    ]);
  });
});
