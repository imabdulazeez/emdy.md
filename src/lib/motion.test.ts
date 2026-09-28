import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  collapseElement,
  COLLAPSE_FALLBACK_MS,
  COLLAPSE_MS,
  prefersReducedMotion,
  REDUCED_MOTION_QUERY,
} from "./motion";

const mediaList = (matching: readonly string[]) => (query: string) =>
  ({ matches: matching.includes(query), media: query }) as MediaQueryList;

interface FakeAnimation {
  element: Element;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  finish(): void;
  cancel(): void;
  cancelled: boolean;
}

function stubAnimate(): FakeAnimation[] {
  const started: FakeAnimation[] = [];
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    writable: true,
    value(this: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      let finish!: () => void;
      let cancel!: () => void;
      const finished = new Promise<Animation>((resolve, reject) => {
        finish = () => resolve(this as unknown as Animation);
        cancel = () => reject(new DOMException("cancelled", "AbortError"));
      });
      const record: FakeAnimation = {
        element: this,
        keyframes,
        options,
        finish,
        cancel,
        cancelled: false,
      };
      started.push(record);
      return {
        finished,
        cancel() {
          record.cancelled = true;
          cancel();
        },
      } as unknown as Animation;
    },
  });
  return started;
}

function stubRowGap(gap: string) {
  const original = window.getComputedStyle;
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
    const style = original(element);
    return new Proxy(style, {
      get: (target, key) => (key === "rowGap" ? gap : Reflect.get(target, key)),
    });
  });
}

function list(count: number) {
  const ul = document.createElement("ul");
  for (let index = 0; index < count; index += 1) ul.append(document.createElement("li"));
  document.body.append(ul);
  return ul;
}

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "animate");
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("prefersReducedMotion", () => {
  it("reads the reduced-motion media query", () => {
    expect(prefersReducedMotion({ matchMedia: mediaList([REDUCED_MOTION_QUERY]) })).toBe(true);
    expect(prefersReducedMotion({ matchMedia: mediaList([]) })).toBe(false);
  });

  it("assumes motion is fine where media queries are unavailable", () => {
    expect(prefersReducedMotion({})).toBe(false);
  });
});

describe("collapseElement", () => {
  it("does not animate without Web Animations support", () => {
    const [item] = list(1).children;
    expect(collapseElement(item as HTMLElement)).toBeUndefined();
  });

  it("does not animate when the user prefers reduced motion", () => {
    const started = stubAnimate();
    vi.spyOn(window, "matchMedia").mockImplementation(mediaList([REDUCED_MOTION_QUERY]));
    const [item] = list(2).children;
    expect(collapseElement(item as HTMLElement)).toBeUndefined();
    expect(started).toHaveLength(0);
  });

  it("collapses height, padding, and the parent's gap while fading out", () => {
    const started = stubAnimate();
    stubRowGap("1px");
    const item = list(3).children[1] as HTMLElement;
    vi.spyOn(item, "getBoundingClientRect").mockReturnValue({ height: 36 } as DOMRect);

    expect(collapseElement(item)?.finished).toBeInstanceOf(Promise);
    expect(started).toHaveLength(1);
    const [{ element, keyframes, options }] = started;
    expect(element).toBe(item);
    expect(item.style.overflow).toBe("hidden");
    expect(keyframes[0]).toMatchObject({ height: "36px", marginBottom: "0px", opacity: 1 });
    expect(keyframes[1]).toMatchObject({
      height: "0px",
      paddingTop: "0px",
      paddingBottom: "0px",
      marginBottom: "-1px",
      opacity: 0,
    });
    expect(options).toMatchObject({ duration: COLLAPSE_MS, fill: "forwards" });
    expect(options.easing).toMatch(/^cubic-bezier/);
  });

  it("leaves the margin alone for an only child, which has no gap to absorb", () => {
    const started = stubAnimate();
    stubRowGap("1px");
    const [item] = list(1).children;
    void collapseElement(item as HTMLElement);
    expect(started[0].keyframes[1]).toMatchObject({ marginBottom: "0px" });
  });

  it("resolves when the animation finishes", async () => {
    vi.useFakeTimers();
    const started = stubAnimate();
    const done = vi.fn();
    void collapseElement(list(2).children[0] as HTMLElement)!.finished.then(done);
    await vi.advanceTimersByTimeAsync(0);
    expect(done).not.toHaveBeenCalled();
    started[0].finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("resolves when the animation is cancelled", async () => {
    const started = stubAnimate();
    const collapse = collapseElement(list(2).children[0] as HTMLElement)!;
    started[0].cancel();
    await expect(collapse.finished).resolves.toBeUndefined();
  });

  it("reverts to the element's own layout when it stays in the page", () => {
    const started = stubAnimate();
    const item = list(2).children[0] as HTMLElement;
    item.style.overflow = "auto";
    const collapse = collapseElement(item)!;
    expect(item.style.overflow).toBe("hidden");
    collapse.revert();
    expect(started[0].cancelled).toBe(true);
    expect(item.style.overflow).toBe("auto");
  });

  it("falls back to a timer when the animation never reports back", async () => {
    vi.useFakeTimers();
    stubAnimate();
    const done = vi.fn();
    void collapseElement(list(2).children[0] as HTMLElement)!.finished.then(done);
    await vi.advanceTimersByTimeAsync(COLLAPSE_MS + COLLAPSE_FALLBACK_MS - 1);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalledOnce();
  });
});
