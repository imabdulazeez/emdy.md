import type { BrowserWindowConstructorOptions, Point } from "electron";

export const TITLE_BAR_CENTER = 30;
export const TRAFFIC_LIGHT_X = 18;
export const TRAFFIC_LIGHT_RADIUS = 7;
export const TRAFFIC_LIGHT_INSET = 96;
export const ZOOM_STEP = 0.5;

export type ZoomDirection = "in" | "out" | "reset";

export interface ButtonWindow {
  isDestroyed(): boolean;
  isFullScreen(): boolean;
  setWindowButtonPosition(position: Point | null): void;
  webContents: { getZoomFactor(): number };
}

export function trafficLightPosition(zoomFactor: number): Point {
  const zoom = Number.isFinite(zoomFactor) && zoomFactor > 0 ? zoomFactor : 1;
  return {
    x: TRAFFIC_LIGHT_X,
    y: Math.max(0, Math.round(TITLE_BAR_CENTER * zoom - TRAFFIC_LIGHT_RADIUS)),
  };
}

export const TRAFFIC_LIGHT_POSITION = trafficLightPosition(1);

export function windowChrome(platform: NodeJS.Platform): BrowserWindowConstructorOptions {
  if (platform === "darwin") {
    return { titleBarStyle: "hidden", trafficLightPosition: { ...TRAFFIC_LIGHT_POSITION } };
  }
  return { autoHideMenuBar: true };
}

export function syncTrafficLights(window: ButtonWindow): void {
  if (window.isDestroyed() || window.isFullScreen()) return;
  window.setWindowButtonPosition(trafficLightPosition(window.webContents.getZoomFactor()));
}

export function nextZoomLevel(current: number, direction: ZoomDirection): number {
  if (direction === "reset") return 0;
  return current + (direction === "in" ? ZOOM_STEP : -ZOOM_STEP);
}

export function trafficLightInset(zoomFactor: number): string {
  const zoom = Number.isFinite(zoomFactor) && zoomFactor > 0 ? zoomFactor : 1;
  return `${TRAFFIC_LIGHT_INSET / zoom}px`;
}
