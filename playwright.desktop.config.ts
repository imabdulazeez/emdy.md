import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/desktop",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: "list",
  timeout: 60_000,
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
