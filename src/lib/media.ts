export const MOBILE_MEDIA_QUERY = "(max-width: 767px)";

/** Reports whether a media query matches right now, or false where media queries are unavailable. */
export function matchesMediaQuery(
  query: string,
  target: Pick<Window, "matchMedia"> | undefined = globalThis.window,
): boolean {
  if (!target || typeof target.matchMedia !== "function") return false;
  return target.matchMedia(query).matches;
}

/**
 * Subscribes to a media query and reports its current and future match state.
 * Returns a function that stops listening.
 */
export function watchMediaQuery(
  query: string,
  onChange: (matches: boolean) => void,
  target: Pick<Window, "matchMedia"> | undefined = globalThis.window,
): () => void {
  if (!target || typeof target.matchMedia !== "function") {
    onChange(false);
    return () => {};
  }
  const list = target.matchMedia(query);
  onChange(list.matches);
  const listener = (event: MediaQueryListEvent) => onChange(event.matches);
  list.addEventListener("change", listener);
  return () => list.removeEventListener("change", listener);
}
