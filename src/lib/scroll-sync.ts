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

export interface ScrollThumbInput {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  trackHeight: number;
  minSize?: number;
}

export interface ScrollThumb {
  offset: number;
  size: number;
}

export function scrollThumb(input: ScrollThumbInput): ScrollThumb | null {
  const overflow = input.scrollHeight - input.clientHeight;
  if (overflow <= 0 || input.trackHeight <= 0) return null;
  const size = Math.min(
    input.trackHeight,
    Math.max(input.minSize ?? 0, (input.trackHeight * input.clientHeight) / input.scrollHeight),
  );
  const progress = Math.min(1, Math.max(0, input.scrollTop / overflow));
  return { offset: (input.trackHeight - size) * progress, size };
}

export interface ThumbScrollInput {
  offset: number;
  size: number;
  trackHeight: number;
  scrollHeight: number;
  clientHeight: number;
}

export function scrollTopForThumb(input: ThumbScrollInput): number {
  const room = input.trackHeight - input.size;
  const overflow = input.scrollHeight - input.clientHeight;
  if (room <= 0 || overflow <= 0) return 0;
  return Math.min(1, Math.max(0, input.offset / room)) * overflow;
}
