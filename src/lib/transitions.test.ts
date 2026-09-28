import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { NO_TRANSITIONS_ATTRIBUTE, holdTransitions } from "./transitions";

function queueFrames() {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  return () => frames.splice(0).forEach((callback) => callback(0));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("holdTransitions", () => {
  it("suppresses transitions until two frames after release", () => {
    const runFrames = queueFrames();
    const root = document.createElement("div");
    const release = holdTransitions(root);
    expect(root.hasAttribute(NO_TRANSITIONS_ATTRIBUTE)).toBe(true);
    runFrames();
    expect(root.hasAttribute(NO_TRANSITIONS_ATTRIBUTE)).toBe(true);
    release();
    runFrames();
    expect(root.hasAttribute(NO_TRANSITIONS_ATTRIBUTE)).toBe(true);
    runFrames();
    expect(root.hasAttribute(NO_TRANSITIONS_ATTRIBUTE)).toBe(false);
  });

  it("keeps the attribute while any hold is outstanding", () => {
    const runFrames = queueFrames();
    const root = document.createElement("div");
    const first = holdTransitions(root);
    const second = holdTransitions(root);
    first();
    runFrames();
    runFrames();
    expect(root.hasAttribute(NO_TRANSITIONS_ATTRIBUTE)).toBe(true);
    second();
    runFrames();
    runFrames();
    expect(root.hasAttribute(NO_TRANSITIONS_ATTRIBUTE)).toBe(false);
  });

  it("ignores repeated releases of the same hold", () => {
    const runFrames = queueFrames();
    const root = document.createElement("div");
    const first = holdTransitions(root);
    const second = holdTransitions(root);
    first();
    first();
    runFrames();
    runFrames();
    expect(root.hasAttribute(NO_TRANSITIONS_ATTRIBUTE)).toBe(true);
    second();
    runFrames();
    runFrames();
    expect(root.hasAttribute(NO_TRANSITIONS_ATTRIBUTE)).toBe(false);
  });

  it("releases immediately without animation frames", () => {
    const root = document.implementation.createHTMLDocument().documentElement;
    const release = holdTransitions(root);
    expect(root.hasAttribute(NO_TRANSITIONS_ATTRIBUTE)).toBe(true);
    release();
    expect(root.hasAttribute(NO_TRANSITIONS_ATTRIBUTE)).toBe(false);
  });

  it("defaults to the document element", () => {
    const runFrames = queueFrames();
    const release = holdTransitions();
    expect(document.documentElement.hasAttribute(NO_TRANSITIONS_ATTRIBUTE)).toBe(true);
    release();
    runFrames();
    runFrames();
    expect(document.documentElement.hasAttribute(NO_TRANSITIONS_ATTRIBUTE)).toBe(false);
  });
});
