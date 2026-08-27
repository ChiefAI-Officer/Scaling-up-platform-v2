import { defineConfig, devices } from "@playwright/test";

// This proof owns its loopback app and temporary PostgreSQL cluster. Never
// reuse a developer server (or its environment/database) for these mutations.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "summary-reporting.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: "list",
  use: { screenshot: "only-on-failure", trace: "retain-on-failure" },
  // Full Chromium new-headless includes the PDF viewer; headless-shell does not.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chromium" } }],
});
