import { describe, expect, it, vi } from "vite-plus/test";
import {
  nextZoomLevel,
  syncTrafficLights,
  TRAFFIC_LIGHT_POSITION,
  trafficLightInset,
  trafficLightPosition,
  windowChrome,
  type ButtonWindow,
} from "./window-chrome";

function buttonWindow(zoomFactor: number, state: { destroyed?: boolean; fullScreen?: boolean }) {
  const setWindowButtonPosition = vi.fn();
  const window: ButtonWindow = {
    isDestroyed: () => state.destroyed ?? false,
    isFullScreen: () => state.fullScreen ?? false,
    setWindowButtonPosition,
    webContents: { getZoomFactor: () => zoomFactor },
  };
  return { window, setWindowButtonPosition };
}

describe("windowChrome", () => {
  it("hides the macOS title bar and insets the traffic lights into the app", () => {
    expect(windowChrome("darwin")).toEqual({
      titleBarStyle: "hidden",
      trafficLightPosition: TRAFFIC_LIGHT_POSITION,
    });
  });

  it("keeps the native frame elsewhere and hides the menu bar", () => {
    expect(windowChrome("win32")).toEqual({ autoHideMenuBar: true });
    expect(windowChrome("linux")).toEqual({ autoHideMenuBar: true });
  });
});

describe("trafficLightPosition", () => {
  it("centres the buttons on the title bar row at the default zoom", () => {
    expect(trafficLightPosition(1)).toEqual({ x: 18, y: 23 });
    expect(TRAFFIC_LIGHT_POSITION).toEqual({ x: 18, y: 23 });
  });

  it("follows the zoomed row centre while keeping the left edge", () => {
    expect(trafficLightPosition(0.5)).toEqual({ x: 18, y: 8 });
    expect(trafficLightPosition(1.5)).toEqual({ x: 18, y: 38 });
    expect(trafficLightPosition(0.2)).toEqual({ x: 18, y: 0 });
  });

  it("falls back to the default zoom on an unusable factor", () => {
    expect(trafficLightPosition(0)).toEqual(TRAFFIC_LIGHT_POSITION);
    expect(trafficLightPosition(Number.NaN)).toEqual(TRAFFIC_LIGHT_POSITION);
  });
});

describe("syncTrafficLights", () => {
  it("moves the buttons to match the page zoom", () => {
    const { window, setWindowButtonPosition } = buttonWindow(0.8, {});
    syncTrafficLights(window);
    expect(setWindowButtonPosition).toHaveBeenCalledWith({ x: 18, y: 17 });
  });

  it("leaves destroyed and full-screen windows alone", () => {
    for (const state of [{ destroyed: true }, { fullScreen: true }]) {
      const { window, setWindowButtonPosition } = buttonWindow(1, state);
      syncTrafficLights(window);
      expect(setWindowButtonPosition).not.toHaveBeenCalled();
    }
  });
});

describe("nextZoomLevel", () => {
  it("steps by half a level and resets to zero", () => {
    expect(nextZoomLevel(0, "in")).toBe(0.5);
    expect(nextZoomLevel(0.5, "out")).toBe(0);
    expect(nextZoomLevel(-1, "out")).toBe(-1.5);
    expect(nextZoomLevel(2, "reset")).toBe(0);
  });
});

describe("trafficLightInset", () => {
  it("keeps the reserved space constant in screen points", () => {
    expect(trafficLightInset(1)).toBe("96px");
    expect(trafficLightInset(0.5)).toBe("192px");
    expect(trafficLightInset(2)).toBe("48px");
    expect(trafficLightInset(0)).toBe("96px");
  });
});
