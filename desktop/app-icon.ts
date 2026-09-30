import { join } from "node:path";

export function developmentIcon(appRoot: string, platform: NodeJS.Platform): string {
  const file = platform === "darwin" ? "icon-mac.png" : "icon.png";
  return join(appRoot, "..", "..", "..", "desktop", "resources", file);
}
