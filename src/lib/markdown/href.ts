export const LOCAL_LINK_ATTR = "data-href";

export const URL_SCHEME = /^([a-z][a-z\d+.-]*):/i;

const CONTROL_CHAR = /\p{Cc}/u;

/** Relative paths and fragments are fine; anything with a scheme must be http(s) or mailto. */
export function isSafeHref(href: string): boolean {
  if (href.length === 0 || CONTROL_CHAR.test(href)) return false;
  const scheme = URL_SCHEME.exec(href)?.[1];
  return !scheme || /^(?:https?|mailto)$/i.test(scheme);
}

export function isExternalHref(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//");
}
