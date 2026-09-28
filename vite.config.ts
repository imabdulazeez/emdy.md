import { defineConfig } from "vite-plus";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import solid from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { markdownHtmlStubPlugin } from "./src/lib/editor/html-stub-plugin";
import { lucideGroupsPlugin } from "./src/lib/lucide-groups";
import { firstPaintThemesPlugin } from "./src/lib/themes/first-paint";

import { lazyPlugins } from "vite-plus";

const LUCIDE_ICONS = "/node_modules/lucide/dist/esm/icons";

export default defineConfig(({ mode }) => {
  const isTest = mode === "test";
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
    resolve: {
      alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) },
      ...(isTest ? { conditions: ["browser", "development", "module"] } : {}),
    },
    test: {
      environment: "jsdom",
      include: ["src/**/*.test.{ts,tsx}"],
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
    ]),
  };
});
