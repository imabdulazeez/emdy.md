export interface NearestScrollInput {
  scrollTop: number;
  viewHeight: number;
  itemTop: number;
  itemHeight: number;
  margin?: number;
}

/** The scrollTop that brings an item just into view, moving as little as possible. */
export function nearestScrollTop(input: NearestScrollInput): number {
  const margin = input.margin ?? 0;
  const top = input.itemTop - margin;
  const bottom = input.itemTop + input.itemHeight + margin;
  if (top < input.scrollTop) return Math.max(0, top);
  if (bottom > input.scrollTop + input.viewHeight) {
    return Math.max(0, bottom - input.viewHeight);
  }
  return input.scrollTop;
}
