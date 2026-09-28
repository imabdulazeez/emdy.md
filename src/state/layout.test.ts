import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { flush } from "solid-js";
import {
  isLayoutMode,
  isEditable,
  isLivePreview,
  LAYOUT_LABELS,
  LAYOUT_MODES,
  layoutMode,
  resetLayoutState,
  setLayoutMode,
} from "./layout";

afterEach(() => resetLayoutState());

describe("layout state", () => {
  it("defaults to the editor", () => {
    expect(layoutMode()).toBe("editor");
  });

  it("transitions between modes", () => {
    flush(() => setLayoutMode("editor"));
    expect(layoutMode()).toBe("editor");
    flush(() => setLayoutMode("preview"));
    expect(layoutMode()).toBe("preview");
    flush(() => setLayoutMode("reader"));
    expect(layoutMode()).toBe("reader");
  });

  it("persists the mode and restores it from storage", async () => {
    flush(() => setLayoutMode("reader"));
    expect(window.localStorage.getItem("emdy:pref:layout")).toBe('"reader"');
    vi.resetModules();
    const fresh = await import("./layout");
    expect(fresh.layoutMode()).toBe("reader");
    window.localStorage.setItem("emdy:pref:layout", '"split"');
    vi.resetModules();
    const invalid = await import("./layout");
    expect(invalid.layoutMode()).toBe("editor");
    invalid.resetLayoutState();
    expect(window.localStorage.getItem("emdy:pref:layout")).toBeNull();
  });

  it("knows which modes render the preview and which can be edited", () => {
    expect(isEditable("editor")).toBe(true);
    expect(isEditable("preview")).toBe(true);
    expect(isEditable("reader")).toBe(false);
    expect(isLivePreview("editor")).toBe(false);
    expect(isLivePreview("preview")).toBe(true);
    expect(isLivePreview("reader")).toBe(true);
  });

  it("labels every mode", () => {
    for (const mode of LAYOUT_MODES) expect(LAYOUT_LABELS[mode]).toBeTruthy();
    expect(new Set(Object.values(LAYOUT_LABELS)).size).toBe(LAYOUT_MODES.length);
  });

  it("validates modes", () => {
    expect(isLayoutMode("editor")).toBe(true);
    expect(isLayoutMode("preview")).toBe(true);
    expect(isLayoutMode("reader")).toBe(true);
    expect(isLayoutMode("split")).toBe(false);
    expect(isLayoutMode("nope")).toBe(false);
    expect(isLayoutMode(2)).toBe(false);
  });
});
