import { defineConfig, devices } from "@playwright/test";

// Kept in a plain Node module so its fail-closed behavior can be unit-tested
// without importing Playwright's browser runtime into Jest.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAssessmentReportE2eWebServer } = require("./scripts/report-style-e2e-server-contract.cjs") as {
  createAssessmentReportE2eWebServer: (env: NodeJS.ProcessEnv) => ReturnType<typeof defineConfig>["webServer"];
};

/**
 * Playwright configuration for E2E tests
 * @see https://playwright.dev/docs/test-configuration
 */
const configuredWorkers = Number(process.env.PLAYWRIGHT_WORKERS || "1");
const workers = Number.isFinite(configuredWorkers) && configuredWorkers > 0 ? configuredWorkers : 1;

function previewBaseUrl(override: string | undefined): string | undefined {
  if (override === undefined || override === "") return undefined;
  if (override.trim() !== override) {
    throw new Error("PLAYWRIGHT_BASE_URL must be an absolute http: or https: URL.");
  }

  let parsed: URL;
  try {
    parsed = new URL(override);
  } catch {
    throw new Error("PLAYWRIGHT_BASE_URL must be an absolute http: or https: URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("PLAYWRIGHT_BASE_URL must be an absolute http: or https: URL.");
  }
  return override;
}

const authorizedPreviewBaseUrl = previewBaseUrl(process.env.PLAYWRIGHT_BASE_URL);

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
    baseURL: authorizedPreviewBaseUrl || "http://localhost:3000",
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
    {
      name: "responsive-compact",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 320, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: "responsive-medium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
        hasTouch: true,
      },
    },
    {
      name: "responsive-tablet-wide",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1024, height: 768 },
        hasTouch: true,
      },
    },
    {
      name: "responsive-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    // Enable for full cross-browser testing
    // {
    //   name: "Mobile Safari",
    //   use: { ...devices["iPhone 12"] },
    // },
  ],

  /* Build and run a production server only after the disposable DB guard. */
  webServer: authorizedPreviewBaseUrl ? undefined : createAssessmentReportE2eWebServer(process.env),
});
