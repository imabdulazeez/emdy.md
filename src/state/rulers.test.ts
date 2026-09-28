import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { flush } from "solid-js";
import { findPreference } from "./preferences";
import {
  isRulersPreference,
  resetRulersState,
  rulers,
  setShowRulers,
  showRulers,
  toggleRulers,
} from "./rulers";

afterEach(() => resetRulersState());

describe("rulers preference", () => {
  it("defaults to hidden and registers a toggle on the settings page", () => {
    expect(showRulers()).toBe(false);
    expect(findPreference("rulers")).toBe(rulers);
    expect(rulers.label).toBe("Line and column rulers");
    expect(rulers.control).toEqual({ kind: "toggle" });
  });

  it("accepts only booleans", () => {
    expect(isRulersPreference(true)).toBe(true);
    expect(isRulersPreference(false)).toBe(true);
    expect(isRulersPreference("true")).toBe(false);
    expect(isRulersPreference(1)).toBe(false);
    expect(isRulersPreference(null)).toBe(false);
  });

  it("sets and toggles the value", () => {
    flush(() => setShowRulers(true));
    expect(showRulers()).toBe(true);
    flush(() => toggleRulers());
    expect(showRulers()).toBe(false);
    flush(() => toggleRulers());
    expect(showRulers()).toBe(true);
  });

  it("persists the value and restores it from storage", async () => {
    flush(() => setShowRulers(true));
    expect(window.localStorage.getItem("emdy:pref:rulers")).toBe("true");
    vi.resetModules();
    const fresh = await import("./rulers");
    expect(fresh.showRulers()).toBe(true);
    window.localStorage.setItem("emdy:pref:rulers", '"yes"');
    vi.resetModules();
    const invalid = await import("./rulers");
    expect(invalid.showRulers()).toBe(false);
    invalid.resetRulersState();
    expect(window.localStorage.getItem("emdy:pref:rulers")).toBeNull();
  });
});
