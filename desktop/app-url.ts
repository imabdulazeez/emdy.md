import { extname, isAbsolute, relative, resolve } from "node:path";

export const APP_SCHEME = "app";
export const APP_HOST = "emdy";
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
export const APP_URL = `${APP_ORIGIN}/`;
export const DICTIONARY_PREFIX = "/dictionaries/";

const DICTIONARY_FILE = /^[A-Za-z0-9-]+\.bdic$/;

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
};

export interface AppRoots {
  renderer: string;
  dictionaries: string;
}

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function inside(root: string, path: string): string | null {
  const target = resolve(root, path);
  const offset = relative(root, target);
  if (!offset || offset.startsWith("..") || isAbsolute(offset)) return null;
  return target;
}

export function resolveAppRequest(url: string, roots: AppRoots): string | null {
  const parsed = parse(url);
  if (!parsed || parsed.protocol !== `${APP_SCHEME}:` || parsed.host !== APP_HOST) return null;
  let pathname: string;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
  if (pathname.includes("\0") || pathname.includes("\\")) return null;
  if (pathname === "/") return inside(roots.renderer, "index.html");
  if (pathname.startsWith(DICTIONARY_PREFIX)) {
    const name = pathname.slice(DICTIONARY_PREFIX.length);
    return DICTIONARY_FILE.test(name) ? inside(roots.dictionaries, name) : null;
  }
  return inside(roots.renderer, pathname.slice(1));
}

export function contentType(file: string): string {
  return CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
}

export async function appResponse(
  url: string,
  roots: AppRoots,
  read: (file: string) => Promise<Uint8Array<ArrayBuffer>>,
): Promise<Response> {
  const file = resolveAppRequest(url, roots);
  if (!file) return new Response("Not found", { status: 404 });
  try {
    return new Response(await read(file), { headers: { "Content-Type": contentType(file) } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

export function devServerOrigin(url: string | null | undefined): string | null {
  if (!url) return null;
  const parsed = parse(url);
  if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) return null;
  return parsed.origin;
}

function originOf(parsed: URL): string {
  return `${parsed.protocol}//${parsed.host}`;
}

export function isAppDocument(url: string, devOrigin: string | null): boolean {
  const parsed = parse(url);
  if (!parsed || parsed.pathname !== "/") return false;
  const origin = originOf(parsed);
  return origin === APP_ORIGIN || (devOrigin !== null && origin === devOrigin);
}
