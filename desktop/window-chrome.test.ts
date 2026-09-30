import { describe, expect, it } from "vite-plus/test";
import { TRAFFIC_LIGHT_POSITION, windowChrome } from "./window-chrome";

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
