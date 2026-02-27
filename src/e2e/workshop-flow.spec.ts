import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "jverdun@scalingup.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "demo123";

test.describe("Workshop Public Pages", () => {
  test("should display workshop landing page", async ({ page }) => {
    await page.goto("/workshop/ai-workshop-chicago-march-2025");

    // Check for workshop details
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
    await expect(heading).toContainText(/chicago/i);
  });

  test("should show registration form on workshop page", async ({ page }) => {
    await page.goto("/workshop/ai-workshop-chicago-march-2025");

    // Check for registration form fields
    await expect(page.getByLabel(/first name/i)).toBeVisible();
    await expect(page.getByLabel(/last name/i)).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });

  test("should validate required fields", async ({ page }) => {
    await page.goto("/workshop/ai-workshop-chicago-march-2025");

    // Browser-level required attributes prevent empty submission.
    await expect(page.getByLabel(/first name/i)).toHaveAttribute("required", "");
    await expect(page.getByLabel(/last name/i)).toHaveAttribute("required", "");
    await expect(page.getByLabel(/email/i)).toHaveAttribute("required", "");
  });

  test("should display venue information for in-person workshops", async ({ page }) => {
    await page.goto("/workshop/ai-workshop-chicago-march-2025");

    // Check for venue details
    await expect(page.getByText(/marriott chicago downtown/i)).toBeVisible();
  });

  test("should display pricing information", async ({ page }) => {
    await page.goto("/workshop/ai-workshop-chicago-march-2025");

    // Check for price display
    await expect(page.getByText(/\$|price|free/i)).toBeVisible();
  });
});

test.describe("Workshop Registration", () => {
  test("should fill registration form", async ({ page }) => {
    await page.goto("/workshop/virtual-ai-intro-feb-2025");

    // Fill registration form
    await page.getByLabel(/first name/i).fill("Test");
    await page.getByLabel(/last name/i).fill("User");
    await page.getByLabel(/email/i).fill("test@example.com");

    // Optional fields
    const companyField = page.getByLabel(/company/i);
    if (await companyField.isVisible()) {
      await companyField.fill("Test Company");
    }

    // Verify form is filled
    await expect(page.getByLabel(/first name/i)).toHaveValue("Test");
    await expect(page.getByLabel(/last name/i)).toHaveValue("User");
    await expect(page.getByLabel(/email/i)).toHaveValue("test@example.com");
  });
});

test.describe("Dashboard Workshops (Authenticated)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      expectedUrl: /\/dashboard/,
    });
  });

  test("should display workshop list after login", async ({ page }) => {
    await page.goto("/workshops");

    // Should show workshop heading
    await expect(page.getByRole("heading", { name: /all workshops|workshops/i })).toBeVisible();
  });

  test("should have create workshop button", async ({ page }) => {
    await page.goto("/workshops");

    // Look for create button
    await expect(page.getByRole("link", { name: /new workshop|create workshop|create new workshop/i }).first()).toBeVisible();
  });

  test("should navigate to workshop details", async ({ page }) => {
    await page.goto("/workshops");

    const workshopLink = page
      .locator('a[href^="/workshops/"]')
      .filter({ hasNotText: "New Workshop" })
      .first();

    if (await workshopLink.isVisible()) {
      await workshopLink.click();

      // Should navigate to workshop details
      await expect(page).toHaveURL(/.*workshops\/.+/);
    }
  });
});
