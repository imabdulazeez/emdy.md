import { describe, expect, it, vi } from "vite-plus/test";
import { matchesMediaQuery, MOBILE_MEDIA_QUERY, watchMediaQuery } from "./media";

function fakeMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const list = {
    matches,
    media: "",
    addEventListener: vi.fn((_: string, fn: (event: MediaQueryListEvent) => void) =>
      listeners.add(fn),
    ),
    removeEventListener: vi.fn((_: string, fn: (event: MediaQueryListEvent) => void) =>
      listeners.delete(fn),
    ),
  };
  const target = { matchMedia: vi.fn(() => list as unknown as MediaQueryList) };
  const fire = (next: boolean) => {
    for (const fn of listeners) fn({ matches: next } as MediaQueryListEvent);
  };
  return { target, list, fire, listeners };
}

describe("watchMediaQuery", () => {
  it("reports the initial match and subsequent changes", () => {
    const { target, fire } = fakeMatchMedia(true);
    const onChange = vi.fn();
    watchMediaQuery(MOBILE_MEDIA_QUERY, onChange, target);
    expect(target.matchMedia).toHaveBeenCalledWith(MOBILE_MEDIA_QUERY);
    expect(onChange).toHaveBeenLastCalledWith(true);
    fire(false);
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("stops listening when the returned function is called", () => {
    const { target, fire, listeners } = fakeMatchMedia(false);
    const onChange = vi.fn();
    const stop = watchMediaQuery("(min-width: 1px)", onChange, target);
    stop();
    expect(listeners.size).toBe(0);
    fire(true);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("reports false when matchMedia is unavailable", () => {
    const onChange = vi.fn();
    const stop = watchMediaQuery("(min-width: 1px)", onChange, undefined);
    expect(onChange).toHaveBeenCalledWith(false);
    expect(() => stop()).not.toThrow();
    watchMediaQuery("(min-width: 1px)", onChange, {} as Pick<Window, "matchMedia">);
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});

describe("matchesMediaQuery", () => {
  it("reports whether the query matches right now without subscribing", () => {
    const matching = fakeMatchMedia(true);
    expect(matchesMediaQuery(MOBILE_MEDIA_QUERY, matching.target)).toBe(true);
    expect(matching.target.matchMedia).toHaveBeenCalledWith(MOBILE_MEDIA_QUERY);
    expect(matching.list.addEventListener).not.toHaveBeenCalled();
    expect(matchesMediaQuery(MOBILE_MEDIA_QUERY, fakeMatchMedia(false).target)).toBe(false);
  });

  it("reports false when matchMedia is unavailable", () => {
    expect(matchesMediaQuery("(min-width: 1px)", undefined)).toBe(false);
    expect(matchesMediaQuery("(min-width: 1px)", {} as Pick<Window, "matchMedia">)).toBe(false);
  });
});
