import { defineConfig } from "vite-plus";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import solid from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { electronDevPlugin } from "./desktop/dev-plugin";
import { desktopHtmlPlugin } from "./desktop/html";
import { markdownHtmlStubPlugin } from "./src/lib/editor/html-stub-plugin";
import { lucideGroupsPlugin } from "./src/lib/lucide-groups";
import { firstPaintThemesPlugin } from "./src/lib/themes/first-paint";

import { lazyPlugins } from "vite-plus";
import type { PackUserConfig } from "vite-plus/pack";

const LUCIDE_ICONS = "/node_modules/lucide/dist/esm/icons";
const DESKTOP_APP = "out/desktop/app";

function desktopEntry(name: "main" | "preload", format: "esm" | "cjs"): PackUserConfig {
  return {
    entry: { [name]: `desktop/${name}.ts` },
    format,
    platform: "node",
    outDir: DESKTOP_APP,
    deps: { neverBundle: ["electron"] },
    clean: false,
    hash: false,
    dts: false,
  };
}

export default defineConfig(({ mode }) => {
  const isTest = mode === "test";
  const isDesktop = mode === "desktop";
  return {
    staged: {
      "*": "vp check --fix",
    },
    fmt: {},
    lint: {
      jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
      rules: { "vite-plus/prefer-vite-plus-imports": "error" },
      options: { typeAware: true, typeCheck: true },
    },
    ...(isDesktop
      ? { publicDir: false, build: { outDir: `${DESKTOP_APP}/renderer`, emptyOutDir: true } }
      : {}),
    pack: [desktopEntry("main", "esm"), desktopEntry("preload", "cjs")],
    resolve: {
      alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) },
      ...(isTest ? { conditions: ["browser", "development", "module"] } : {}),
    },
    test: {
      environment: "jsdom",
      include: ["src/**/*.test.{ts,tsx}", "desktop/**/*.test.ts"],
      setupFiles: ["./src/test-setup.ts"],
      server: { deps: { inline: [/solid-js/, /@solidjs\/(?:signals|web)/] } },
    },
    plugins: lazyPlugins(() => [
      markdownHtmlStubPlugin(
        fileURLToPath(new URL("./src/lib/editor/html-stub.ts", import.meta.url)),
      ),
      lucideGroupsPlugin(
        LUCIDE_ICONS,
        readdirSync(fileURLToPath(new URL(`.${LUCIDE_ICONS}`, import.meta.url))),
      ),
      solid(),
      tailwindcss(),
      firstPaintThemesPlugin(),
      ...(isDesktop
        ? [desktopHtmlPlugin(), electronDevPlugin({ main: `${DESKTOP_APP}/main.mjs` })]
        : []),
    ]),
  };
});
