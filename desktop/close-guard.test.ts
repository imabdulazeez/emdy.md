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

  it("asks before closing when the page could not save, and closes on a yes", async () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const confirm = vi.fn(async () => true);
    const guard = createCloseGuard(() => {}, 1_000, undefined, confirm);
    guard.intercept(close);
    guard.release(false);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(guard.intercept(close)).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(close).toHaveBeenCalledTimes(1);
    expect(guard.intercept(close)).toBe(false);
  });

  it("stays open on a no, without the timeout closing behind the question, and can close later", async () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const requestFlush = vi.fn();
    let answer: (discard: boolean) => void = () => {};
    const guard = createCloseGuard(
      requestFlush,
      1_000,
      undefined,
      () =>
        new Promise<boolean>((resolve) => {
          answer = resolve;
        }),
    );
    guard.intercept(close);
    guard.release(false);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(close).not.toHaveBeenCalled();
    guard.release(true);
    expect(close).not.toHaveBeenCalled();
    answer(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(close).not.toHaveBeenCalled();

    expect(guard.intercept(close)).toBe(true);
    expect(requestFlush).toHaveBeenCalledTimes(2);
    guard.release(true);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("stays open when the question itself fails", async () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const guard = createCloseGuard(
      () => {},
      1_000,
      undefined,
      () => Promise.reject(new Error("no window")),
    );
    guard.intercept(close);
    guard.release(false);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(close).not.toHaveBeenCalled();
  });

  it("ignores a release that arrives before any close", () => {
    const close = vi.fn();
    const guard = createCloseGuard(() => {});
    guard.release();
    expect(guard.intercept(close)).toBe(true);
    expect(close).not.toHaveBeenCalled();
  });
});
