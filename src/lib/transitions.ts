export const NO_TRANSITIONS_ATTRIBUTE = "data-no-transitions";

const holds = new WeakMap<HTMLElement, number>();

function afterPaint(root: HTMLElement, callback: () => void): void {
  const view = root.ownerDocument.defaultView;
  if (!view || typeof view.requestAnimationFrame !== "function") {
    callback();
    return;
  }
  view.requestAnimationFrame(() => view.requestAnimationFrame(callback));
}

export function holdTransitions(root: HTMLElement = document.documentElement): () => void {
  holds.set(root, (holds.get(root) ?? 0) + 1);
  root.setAttribute(NO_TRANSITIONS_ATTRIBUTE, "");
  let released = false;
  return () => {
    if (released) return;
    released = true;
    afterPaint(root, () => {
      const remaining = (holds.get(root) ?? 1) - 1;
      holds.set(root, remaining);
      if (remaining === 0) root.removeAttribute(NO_TRANSITIONS_ATTRIBUTE);
    });
  };
}
