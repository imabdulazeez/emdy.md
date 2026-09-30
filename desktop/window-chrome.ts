import type { BrowserWindowConstructorOptions } from "electron";

export const TRAFFIC_LIGHT_POSITION = { x: 18, y: 24 } as const;

export function windowChrome(platform: NodeJS.Platform): BrowserWindowConstructorOptions {
  if (platform === "darwin") {
    return { titleBarStyle: "hidden", trafficLightPosition: { ...TRAFFIC_LIGHT_POSITION } };
  }
  return { autoHideMenuBar: true };
}
