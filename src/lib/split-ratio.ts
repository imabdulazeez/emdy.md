export const SPLIT_RATIO_DEFAULT = 0.5;
export const SPLIT_RATIO_MIN = 0.2;
export const SPLIT_RATIO_MAX = 0.8;
export const SPLIT_RATIO_STEP = 0.05;
export const MIN_PANE_WIDTH = 280;

export function isSplitRatio(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= SPLIT_RATIO_MIN &&
    value <= SPLIT_RATIO_MAX
  );
}

/** Keeps the left pane's share inside the bounds, and each pane at least `MIN_PANE_WIDTH` wide. */
export function clampSplitRatio(ratio: number, width: number): number {
  const floor = width > 0 ? Math.max(SPLIT_RATIO_MIN, MIN_PANE_WIDTH / width) : SPLIT_RATIO_MIN;
  const ceiling =
    width > 0 ? Math.min(SPLIT_RATIO_MAX, 1 - MIN_PANE_WIDTH / width) : SPLIT_RATIO_MAX;
  if (floor > ceiling) return SPLIT_RATIO_DEFAULT;
  if (!Number.isFinite(ratio)) return SPLIT_RATIO_DEFAULT;
  return Math.min(ceiling, Math.max(floor, ratio));
}

/** The left pane's share for a pointer at `x` over a container spanning `left` to `left + width`. */
export function ratioAtPointer(x: number, left: number, width: number): number {
  if (width <= 0) return SPLIT_RATIO_DEFAULT;
  return clampSplitRatio((x - left) / width, width);
}

export function roundRatio(ratio: number): number {
  return Math.round(ratio * 1000) / 1000;
}
