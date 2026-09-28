import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vite-plus/test";

function parseHeaders(source: string): Map<string, string[]> {
  const rules = new Map<string, string[]>();
  let current: string[] | undefined;
  for (const line of source.split("\n")) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (/^\s/.test(line)) current?.push(line.trim());
    else {
      current = [];
      rules.set(line.trim(), current);
    }
  }
  return rules;
}

const rules = parseHeaders(readFileSync(resolve(process.cwd(), "public/_headers"), "utf8"));

describe("public/_headers", () => {
  it("caches the hashed build assets for a year without revalidation", () => {
    expect(rules.get("/assets/*")).toEqual(["Cache-Control: public, max-age=31536000, immutable"]);
  });

  it("leaves the page and unhashed files to revalidate", () => {
    for (const [path, headers] of rules) {
      if (path === "/assets/*") continue;
      expect(headers.join("\n")).not.toMatch(/immutable/);
    }
    expect([...rules.keys()]).toEqual(["/assets/*"]);
  });
});
