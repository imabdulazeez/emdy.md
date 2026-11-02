import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import type { Plugin } from "vite-plus";

export interface ElectronDevOptions {
  main: string;
  electronPath?: () => string;
  launch?: typeof spawn;
  exit?: (code: number) => void;
}

export function devServerUrl(
  address: string | AddressInfo | null | undefined,
  secure: boolean,
): string | null {
  if (!address || typeof address === "string") return null;
  return `${secure ? "https" : "http"}://localhost:${address.port}/`;
}

function installedElectron(): string {
  return createRequire(import.meta.url)("electron") as string;
}

export function electronDevPlugin(options: ElectronDevOptions): Plugin {
  return {
    name: "emdy-electron-dev",
    apply: "serve",
    configureServer(server) {
      const http = server.httpServer;
      if (!http) return;
      http.once("listening", () => {
        const url = devServerUrl(http.address(), Boolean(server.config.server.https));
        if (!url) return;
        const launch = options.launch ?? spawn;
        const child = launch((options.electronPath ?? installedElectron)(), [options.main], {
          stdio: "inherit",
          env: { ...process.env, EMDY_DEV_SERVER_URL: url },
        });
        child.on("exit", (code) => {
          const exit = options.exit ?? ((status: number) => process.exit(status));
          void server.close().finally(() => exit(code ?? 0));
        });
        http.once("close", () => {
          if (child.exitCode === null) child.kill();
        });
      });
    },
  };
}
