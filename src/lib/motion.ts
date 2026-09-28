export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** How long a removed row takes to collapse. */
export const COLLAPSE_MS = 180;

/**
 * Extra time allowed before a collapse is treated as finished anyway, for when
 * the animation never reports back (a hidden tab, or an element detached mid-way).
 */
export const COLLAPSE_FALLBACK_MS = 150;

/** The same curve as `--ease-out-quick` in app.css; WAAPI cannot read custom properties. */
const EASE_OUT_QUICK = "cubic-bezier(0.2, 0, 0, 1)";

export function prefersReducedMotion(
  target: Partial<Pick<Window, "matchMedia">> = globalThis,
): boolean {
  return typeof target.matchMedia === "function" && target.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export interface Collapse {
  /** Settles when the animation ends, is cancelled, or overruns its fallback timeout. */
  finished: Promise<void>;
  /** Undoes the collapse, for an element that turns out to stay in the page. */
  revert(): void;
}

/**
 * Collapses an element's height to zero while fading it out, so whatever sits
 * below slides up into its place. The parent's row gap is absorbed as well, so
 * the collapsed element takes exactly the space its removal will free and the
 * final removal does not nudge anything.
 *
 * Returns undefined when there should be no animation (reduced motion, or no
 * Web Animations support); the caller removes the element straight away.
 * Otherwise the element stays collapsed once finished, until it is removed or
 * the collapse is reverted.
 */
export function collapseElement(
  element: HTMLElement,
  duration: number = COLLAPSE_MS,
): Collapse | undefined {
  const view = element.ownerDocument.defaultView;
  if (!view || typeof element.animate !== "function" || prefersReducedMotion(view)) return;

  const style = view.getComputedStyle(element);
  const parent = element.parentElement;
  const gap =
    parent && parent.childElementCount > 1
      ? Number.parseFloat(view.getComputedStyle(parent).rowGap) || 0
      : 0;
  const margin = Number.parseFloat(style.marginBottom) || 0;

  const overflow = element.style.overflow;
  element.style.overflow = "hidden";
  const animation = element.animate(
    [
      {
        height: `${element.getBoundingClientRect().height}px`,
        paddingTop: style.paddingTop,
        paddingBottom: style.paddingBottom,
        marginBottom: `${margin}px`,
        opacity: 1,
      },
      {
        height: "0px",
        paddingTop: "0px",
        paddingBottom: "0px",
        marginBottom: `${margin - gap}px`,
        opacity: 0,
      },
    ],
    { duration, easing: EASE_OUT_QUICK, fill: "forwards" },
  );

  const finished = new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, duration + COLLAPSE_FALLBACK_MS);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    animation.finished.then(done, done);
  });

  return {
    finished,
    revert() {
      animation.cancel();
      element.style.overflow = overflow;
    },
  };
}
