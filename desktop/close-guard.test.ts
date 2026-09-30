import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createCloseGuard } from "./close-guard";

afterEach(() => {
  vi.useRealTimers();
});

describe("createCloseGuard", () => {
  it("holds the first close until the page has saved, then lets it through", () => {
    const requestFlush = vi.fn();
    const close = vi.fn();
    const guard = createCloseGuard(requestFlush, 1_000);
    expect(guard.intercept(close)).toBe(true);
    expect(requestFlush).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
    guard.release();
    expect(close).toHaveBeenCalledTimes(1);
    expect(guard.intercept(close)).toBe(false);
  });

  it("keeps holding repeated close requests while saving", () => {
    const requestFlush = vi.fn();
    const guard = createCloseGuard(requestFlush, 1_000);
    const close = vi.fn();
    guard.intercept(close);
    expect(guard.intercept(close)).toBe(true);
    expect(requestFlush).toHaveBeenCalledTimes(1);
  });

  it("closes anyway when the page never answers", () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const guard = createCloseGuard(() => {}, 1_000);
    guard.intercept(close);
    vi.advanceTimersByTime(999);
    expect(close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(close).toHaveBeenCalledTimes(1);
    guard.release();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("closes straight away when the page cannot be asked", () => {
    const close = vi.fn();
    const guard = createCloseGuard(() => {
      throw new Error("destroyed");
    });
    expect(guard.intercept(close)).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("ignores a release that arrives before any close", () => {
    const close = vi.fn();
    const guard = createCloseGuard(() => {});
    guard.release();
    expect(guard.intercept(close)).toBe(true);
    expect(close).not.toHaveBeenCalled();
  });
});
