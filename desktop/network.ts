import { APP_HOST, APP_SCHEME } from "./app-url";

const LOCAL_SCHEMES = new Set(["blob:", "data:", "devtools:", "about:"]);
const EXTERNAL_SCHEMES = new Set(["http:", "https:", "mailto:"]);
const REMOTE_IMAGE_SCHEMES = new Set(["http:", "https:"]);

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function sameDevServer(parsed: URL, devOrigin: string): boolean {
  const dev = new URL(devOrigin);
  if (parsed.host !== dev.host) return false;
  if (parsed.protocol === dev.protocol) return true;
  const socket = dev.protocol === "https:" ? "wss:" : "ws:";
  return parsed.protocol === socket;
}

export function isAllowedRequest(
  url: string,
  resourceType: string,
  devOrigin: string | null,
): boolean {
  const parsed = parse(url);
  if (!parsed) return false;
  if (parsed.protocol === `${APP_SCHEME}:`) return parsed.host === APP_HOST;
  if (LOCAL_SCHEMES.has(parsed.protocol)) return true;
  if (devOrigin && sameDevServer(parsed, devOrigin)) return true;
  return resourceType === "image" && REMOTE_IMAGE_SCHEMES.has(parsed.protocol);
}

export function isExternalUrl(url: string): boolean {
  const parsed = parse(url);
  return parsed !== null && EXTERNAL_SCHEMES.has(parsed.protocol);
}

export const GRANTED_PERMISSIONS: ReadonlySet<string> = new Set([
  "clipboard-sanitized-write",
  "fullscreen",
]);

export function isGrantedPermission(permission: string): boolean {
  return GRANTED_PERMISSIONS.has(permission);
}
