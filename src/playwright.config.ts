import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for E2E tests
 * @see https://playwright.dev/docs/test-configuration
 */
const configuredWorkers = Number(process.env.PLAYWRIGHT_WORKERS || "1");
const workers = Number.isFinite(configuredWorkers) && configuredWorkers > 0 ? configuredWorkers : 1;

export default defineConfig({
  testDir: "./e2e",
  /* Run tests in files in parallel */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Keep local/dev runs deterministic and avoid flaky shared-session failures. */
  workers,
  /* Reporter to use */
  reporter: [
    ["html", { outputFolder: "playwright-report" }],
    ["list"],
  ],
  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: "http://localhost:3000",
    /* Collect trace when retrying the failed test */
    trace: "on-first-retry",
    /* Screenshot on failure */
    screenshot: "only-on-failure",
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // Enable for full cross-browser testing
    // {
    //   name: "firefox",
    //   use: { ...devices["Desktop Firefox"] },
    // },
    // {
    //   name: "webkit",
    //   use: { ...devices["Desktop Safari"] },
    // },
    /* Test against mobile viewports */
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
    },
    // Enable for full cross-browser testing
    // {
    //   name: "Mobile Safari",
    //   use: { ...devices["iPhone 12"] },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
