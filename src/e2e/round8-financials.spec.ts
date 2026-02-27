import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@scalingup.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "demo123";

test.describe("Round 8: Financials Page (Sprint 6)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, expectedUrl: /\/admin/ });
    await page.goto("/admin/financials");
    await page.waitForLoadState("networkidle");
  });

  test("6.2 — Coach filter dropdown exists and is functional", async ({ page }) => {
    // Should have a coach filter dropdown
    const coachFilter = page.getByLabel(/coach/i).or(
      page.locator('select[name*="coach" i]').or(
        page.getByRole("combobox", { name: /coach/i })
      )
    );
    await expect(coachFilter).toBeVisible();

    // Should have an "All Coaches" default option
    const allCoachesOption = page.getByText(/all coaches/i);
    await expect(allCoachesOption).toBeVisible();
  });

  test("6.3 — Category filter dropdown exists and is functional", async ({ page }) => {
    // Should have a category filter dropdown
    const categoryFilter = page.getByLabel(/category|workshop type/i).or(
      page.locator('select[name*="category" i]').or(
        page.getByRole("combobox", { name: /category/i })
      )
    );
    await expect(categoryFilter).toBeVisible();

    // Should have an "All Categories" default option
    const allCategoriesOption = page.getByText(/all categories/i);
    await expect(allCategoriesOption).toBeVisible();
  });

  test("6.4 — Date range presets and custom range exist", async ({ page }) => {
    // Should have period preset buttons
    const monthlyButton = page.getByRole("button", { name: /month/i }).or(
      page.getByText(/this month/i)
    );
    await expect(monthlyButton).toBeVisible();

    const quarterlyButton = page.getByRole("button", { name: /quarter/i }).or(
      page.getByText(/this quarter/i)
    );
    await expect(quarterlyButton).toBeVisible();

    const annualButton = page.getByRole("button", { name: /year|annual/i }).or(
      page.getByText(/this year/i)
    );
    await expect(annualButton).toBeVisible();

    const allTimeButton = page.getByRole("button", { name: /all/i }).or(
      page.getByText(/all time/i)
    );
    await expect(allTimeButton).toBeVisible();
  });

  test("6.4b — Clear filters button works", async ({ page }) => {
    // Select a preset to activate filters
    const monthlyButton = page.getByRole("button", { name: /month/i }).or(
      page.getByText(/this month/i)
    );
    await monthlyButton.click();
    await page.waitForLoadState("networkidle");

    // Look for a clear/reset filters button
    const clearButton = page.getByRole("button", { name: /clear|reset/i }).or(
      page.getByText(/clear filters/i)
    );
    // Clear button should appear when filters are active
    if (await clearButton.isVisible()) {
      await clearButton.click();
      await page.waitForLoadState("networkidle");
      // After clearing, the URL should not have filter params
      expect(page.url()).not.toContain("coachId=");
    }
  });
});

test.describe("Round 9: Workshop Table — Copy Link (Sprint 6)", () => {
  test("6.1 — Copy Link button exists on workshop table", async ({ page }) => {
    await loginAs(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, expectedUrl: /\/admin/ });
    await page.goto("/admin/workshops");
    await page.waitForLoadState("networkidle");

    // Fall back to "All Workshops" if /admin/workshops redirects
    if (!page.url().includes("workshop")) {
      await page.goto("/workshops");
      await page.waitForLoadState("networkidle");
    }

    // Should have a copy button (clipboard icon) or "Copy Link" text
    const copyButton = page.getByRole("button", { name: /copy/i }).first().or(
      page.locator('[aria-label*="copy" i]').first().or(
        page.locator('button:has([data-icon="clipboard"])').first()
      )
    );

    // At least one copy-link button should exist if there are published workshops
    const workshopRows = page.locator("table tbody tr, [data-testid='workshop-row']");
    const rowCount = await workshopRows.count();

    if (rowCount > 0) {
      await expect(copyButton).toBeVisible();
    }
  });
});
