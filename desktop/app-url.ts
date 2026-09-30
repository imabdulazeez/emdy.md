import { isAbsolute, relative, resolve } from "node:path";

export const APP_SCHEME = "app";
export const APP_HOST = "emdy";
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
export const APP_URL = `${APP_ORIGIN}/`;
export const DICTIONARY_PREFIX = "/dictionaries/";

const DICTIONARY_FILE = /^[A-Za-z0-9-]+\.bdic$/;

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
