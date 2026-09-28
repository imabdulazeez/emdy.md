import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { debounce, runWhenIdle } from "./debounce";

describe("debounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls once with the latest arguments after the wait", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced("a");
    debounced("b");
    expect(fn).not.toHaveBeenCalled();
    expect(debounced.pending()).toBe(true);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("b");
    expect(debounced.pending()).toBe(false);
  });

  it("flushes pending calls immediately", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced(1);
    debounced.flush();
    expect(fn).toHaveBeenCalledWith(1);
    debounced.flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("cancels pending calls", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);
    debounced(1);
    debounced.cancel();
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("runWhenIdle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("uses requestIdleCallback when available", () => {
    const request = vi.fn((cb: () => void) => {
      cb();
      return 7;
    });
    const cancel = vi.fn();
    vi.stubGlobal("requestIdleCallback", request);
    vi.stubGlobal("cancelIdleCallback", cancel);
    const fn = vi.fn();
    const dispose = runWhenIdle(fn, 300);
    expect(request).toHaveBeenCalledWith(fn, { timeout: 300 });
    expect(fn).toHaveBeenCalled();
    dispose();
    expect(cancel).toHaveBeenCalledWith(7);
  });

  it("falls back to a timeout", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    const fn = vi.fn();
    runWhenIdle(fn);
    expect(fn).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("fallback can be cancelled", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    const fn = vi.fn();
    const dispose = runWhenIdle(fn);
    dispose();
    vi.runAllTimers();
    expect(fn).not.toHaveBeenCalled();
  });
});
