import { EventEmitter } from "node:events";
import type { spawn } from "node:child_process";
import { describe, expect, it, vi } from "vite-plus/test";
import { devServerUrl, electronDevPlugin } from "./dev-plugin";

describe("devServerUrl", () => {
  it("builds a localhost URL from the bound port", () => {
    expect(devServerUrl({ address: "::1", family: "IPv6", port: 5173 }, false)).toBe(
      "http://localhost:5173/",
    );
    expect(devServerUrl({ address: "127.0.0.1", family: "IPv4", port: 4000 }, true)).toBe(
      "https://localhost:4000/",
    );
  });

  it("gives up on pipes and unbound servers", () => {
    expect(devServerUrl("/tmp/vite.sock", false)).toBeNull();
    expect(devServerUrl(null, false)).toBeNull();
  });
});

function fakeServer() {
  const http = Object.assign(new EventEmitter(), {
    address: () => ({ address: "::1", family: "IPv6", port: 5173 }),
  });
  const close = vi.fn(async () => {});
  return { http, server: { httpServer: http, config: { server: { https: undefined } }, close } };
}

function fakeChild() {
  return Object.assign(new EventEmitter(), { exitCode: null as number | null, kill: vi.fn() });
}

describe("electronDevPlugin", () => {
  it("opens Electron on the dev server once it listens, and stops together", async () => {
    const child = fakeChild();
    const launch = vi.fn(() => child);
    const exit = vi.fn();
    const plugin = electronDevPlugin({
      main: "out/desktop/app/main.mjs",
      electronPath: () => "/bin/electron",
      launch: launch as unknown as typeof spawn,
      exit,
    });
    expect(plugin.apply).toBe("serve");
    const { http, server } = fakeServer();
    (plugin.configureServer as (value: unknown) => void)(server);
    expect(launch).not.toHaveBeenCalled();
    http.emit("listening");
    expect(launch).toHaveBeenCalledWith(
      "/bin/electron",
      ["out/desktop/app/main.mjs"],
      expect.objectContaining({
        stdio: "inherit",
        env: expect.objectContaining({ EMDY_DEV_SERVER_URL: "http://localhost:5173/" }),
      }),
    );
    child.emit("exit", 0);
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect(server.close).toHaveBeenCalled();
  });

  it("closes Electron when the dev server shuts down first", () => {
    const child = fakeChild();
    const plugin = electronDevPlugin({
      main: "main.mjs",
      electronPath: () => "/bin/electron",
      launch: (() => child) as unknown as typeof spawn,
      exit: vi.fn(),
    });
    const { http, server } = fakeServer();
    (plugin.configureServer as (value: unknown) => void)(server);
    http.emit("listening");
    http.emit("close");
    expect(child.kill).toHaveBeenCalled();
  });

  it("does nothing in middleware mode without an HTTP server", () => {
    const launch = vi.fn();
    const plugin = electronDevPlugin({
      main: "main.mjs",
      launch: launch as unknown as typeof spawn,
    });
    (plugin.configureServer as (value: unknown) => void)({ httpServer: null });
    expect(launch).not.toHaveBeenCalled();
  });
});
