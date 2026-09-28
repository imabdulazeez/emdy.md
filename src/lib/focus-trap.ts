const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function getFocusable(container: ParentNode): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true",
  );
}

export function nextFocusTarget<T>(
  items: readonly T[],
  active: T | null,
  backwards: boolean,
): T | null {
  if (items.length === 0) return null;
  const first = items[0];
  const last = items[items.length - 1];
  const index = active === null ? -1 : items.indexOf(active);
  if (index === -1) return backwards ? last : first;
  if (backwards) return index === 0 ? last : items[index - 1];
  return index === items.length - 1 ? first : items[index + 1];
}

export function trapTabKey(event: KeyboardEvent, container: ParentNode): boolean {
  if (event.key !== "Tab") return false;
  const focusable = getFocusable(container);
  if (focusable.length === 0) {
    event.preventDefault();
    return true;
  }
  const active = document.activeElement as HTMLElement | null;
  const inside = active !== null && focusable.includes(active);
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!inside) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
    return true;
  }
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}
