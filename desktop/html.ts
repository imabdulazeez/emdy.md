import { createHash } from "node:crypto";
import type { Plugin } from "vite-plus";

const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const EXECUTABLE_TYPES = new Set(["", "text/javascript", "application/javascript", "module"]);
const WEB_ONLY_TAGS = [
  /\s*<link\b[^>]*\brel="(?:canonical|icon|apple-touch-icon)"[^>]*>/gi,
  /\s*<meta\b[^>]*\b(?:property="og:[^"]*"|name="twitter:[^"]*")[^>]*>/gi,
  /\s*<script\b[^>]*\btype="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi,
];

function attribute(attributes: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i").exec(attributes);
  return match ? match[1] : null;
}

export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const [, attributes, body] of html.matchAll(SCRIPT)) {
    if (attribute(attributes, "src") !== null) continue;
    const type = (attribute(attributes, "type") ?? "").toLowerCase();
    if (!EXECUTABLE_TYPES.has(type)) continue;
    hashes.push(createHash("sha256").update(body, "utf8").digest("base64"));
  }
  return hashes;
}

export function contentSecurityPolicy(scriptHashes: readonly string[]): string {
  const scripts = ["'self'", ...scriptHashes.map((hash) => `'sha256-${hash}'`)];
  return [
    "default-src 'self'",
    `script-src ${scripts.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https: http:",
    "font-src 'self' data:",
    "connect-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "frame-src 'self' blob: data:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

export function stripWebOnlyTags(html: string): string {
  return WEB_ONLY_TAGS.reduce((current, pattern) => current.replace(pattern, ""), html);
}

export function desktopHtml(html: string): string {
  const stripped = stripWebOnlyTags(html);
  const policy = `<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(
    inlineScriptHashes(stripped),
  )}" />`;
  const charset = /<meta\s+charset="[^"]*"\s*\/?>/i;
  if (charset.test(stripped)) return stripped.replace(charset, (tag) => `${tag}\n    ${policy}`);
  return stripped.replace(/<head>/i, (tag) => `${tag}\n    ${policy}`);
}

export function desktopHtmlPlugin(): Plugin {
  return {
    name: "emdy-desktop-html",
    apply: "build",
    transformIndexHtml: { order: "post", handler: desktopHtml },
  };
}
