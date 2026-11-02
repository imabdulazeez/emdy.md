export const CLOSE_TIMEOUT_MS = 3_000;

export interface CloseGuardTimers {
  setTimeout: (callback: () => void, delay: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

export interface CloseGuard {
  intercept: (close: () => void) => boolean;
  release: (saved?: boolean) => void;
}

const defaultTimers: CloseGuardTimers = {
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createCloseGuard(
  requestFlush: () => void,
  timeoutMs: number = CLOSE_TIMEOUT_MS,
  timers: CloseGuardTimers = defaultTimers,
  confirmDiscard: () => Promise<boolean> = async () => true,
): CloseGuard {
  let state: "open" | "flushing" | "asking" | "closing" = "open";
  let finish: (() => void) | null = null;
  let timer: unknown = null;

  return {
    intercept(close) {
      if (state === "closing") return false;
      if (state !== "open") return true;
      state = "flushing";
      timer = timers.setTimeout(() => finish?.(), timeoutMs);
      finish = () => {
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
    release(saved = true) {
      if (state !== "flushing") return;
      if (saved) {
        finish?.();
        return;
      }
      state = "asking";
      timers.clearTimeout(timer);
      void confirmDiscard()
        .catch(() => false)
        .then((discard) => {
          if (discard) {
            finish?.();
            return;
          }
          state = "open";
          finish = null;
        });
    },
  };
}
