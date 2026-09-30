export const CLOSE_TIMEOUT_MS = 3_000;

export interface CloseGuardTimers {
  setTimeout: (callback: () => void, delay: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

export interface CloseGuard {
  intercept: (close: () => void) => boolean;
  release: () => void;
}

const defaultTimers: CloseGuardTimers = {
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createCloseGuard(
  requestFlush: () => void,
  timeoutMs: number = CLOSE_TIMEOUT_MS,
  timers: CloseGuardTimers = defaultTimers,
): CloseGuard {
  let state: "open" | "flushing" | "closing" = "open";
  let finish: (() => void) | null = null;

  return {
    intercept(close) {
      if (state === "closing") return false;
      if (state === "flushing") return true;
      state = "flushing";
      const timer = timers.setTimeout(() => finish?.(), timeoutMs);
      finish = () => {
        if (state !== "flushing") return;
        state = "closing";
        finish = null;
        timers.clearTimeout(timer);
        close();
      };
      try {
        requestFlush();
      } catch {
        finish();
      }
      return true;
    },
    release() {
      finish?.();
    },
  };
}
