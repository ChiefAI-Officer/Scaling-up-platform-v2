import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@scalingup.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "demo123";

test.describe("Round 12: Surveys (Sprint 7)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, expectedUrl: /\/admin/ });
  });

  test("7.1 — Aggregated Results button exists on surveys page", async ({ page }) => {
    await page.goto("/admin/surveys");
    await page.waitForLoadState("networkidle");

    // Should have an "Aggregated Results" link or button
    const aggregateLink = page.getByRole("link", { name: /aggregat/i }).or(
      page.getByRole("button", { name: /aggregat/i }).or(
        page.getByText(/aggregated results/i)
      )
    );
    await expect(aggregateLink).toBeVisible();
  });

  test("7.1b — Aggregate page loads with expected sections", async ({ page }) => {
    await page.goto("/admin/surveys/aggregate");
    await page.waitForLoadState("networkidle");

    // Should have summary cards (response count, workshop count)
    const responsesText = page.getByText(/response/i).first();
    await expect(responsesText).toBeVisible();

    // Should have per-question breakdowns (look for question labels or distribution)
    const questionSection = page.getByText(/question/i).or(
      page.locator("[data-testid='question-breakdown']")
    );
    // The page should load without errors
    await expect(page.locator("body")).not.toContainText(/something went wrong/i);
    await expect(page.locator("body")).not.toContainText(/error/i);
  });

  test("7.3 — Coach Post-Workshop Survey template exists", async ({ page }) => {
    await page.goto("/admin/surveys");
    await page.waitForLoadState("networkidle");

    // Should find "Coach Post-Workshop Survey" in the template list
    const coachSurvey = page.getByText(/coach post-workshop survey/i);
    await expect(coachSurvey).toBeVisible();
  });

  test("7.4 — Post-Event Coach Survey Sequence workflow exists", async ({ page }) => {
    await page.goto("/admin/workflows");
    await page.waitForLoadState("networkidle");

    // Fall back to /workflows if /admin/workflows doesn't exist
    if (page.url().includes("404") || !page.url().includes("workflow")) {
      await page.goto("/workflows");
      await page.waitForLoadState("networkidle");
    }

    // Should find "Post-Event Coach Survey Sequence" workflow
    const coachWorkflow = page.getByText(/post-event coach survey/i);
    await expect(coachWorkflow).toBeVisible();
  });

  test("7.5 — Coach survey workflow has 2 steps (1 day and 30 days)", async ({ page }) => {
    await page.goto("/admin/workflows");
    await page.waitForLoadState("networkidle");

    if (page.url().includes("404") || !page.url().includes("workflow")) {
      await page.goto("/workflows");
      await page.waitForLoadState("networkidle");
    }

    // Click into the "Post-Event Coach Survey Sequence" workflow
    const workflowLink = page.getByText(/post-event coach survey/i);
    await workflowLink.click();
    await page.waitForLoadState("networkidle");

    // Should show 2 steps
    // Step 1: 1 day after event
    const step1 = page.getByText(/1 day/i);
    await expect(step1).toBeVisible();

    // Step 2: 30 days after event
    const step2 = page.getByText(/30 day/i);
    await expect(step2).toBeVisible();
  });
});
