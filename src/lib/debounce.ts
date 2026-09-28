export interface Debounced<Args extends unknown[]> {
  (...args: Args): void;
  flush(): void;
  cancel(): void;
  pending(): boolean;
}

export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  wait: number,
): Debounced<Args> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: Args | undefined;

  const debounced = ((...args: Args) => {
    lastArgs = args;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      const callArgs = lastArgs as Args;
      lastArgs = undefined;
      fn(...callArgs);
    }, wait);
  }) as Debounced<Args>;

  debounced.flush = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
    const callArgs = lastArgs as Args;
    lastArgs = undefined;
    fn(...callArgs);
  };

  debounced.cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    lastArgs = undefined;
  };

  debounced.pending = () => timer !== undefined;

  return debounced;
}

export function runWhenIdle(fn: () => void, timeout = 200): () => void {
  const scope = globalThis as typeof globalThis & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof scope.requestIdleCallback === "function") {
    const id = scope.requestIdleCallback(fn, { timeout });
    return () => scope.cancelIdleCallback?.(id);
  }
  const id = setTimeout(fn, 0);
  return () => clearTimeout(id);
}
