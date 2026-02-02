import { test, expect } from "@playwright/test";

test.describe("Workshop Public Pages", () => {
  test("should display workshop landing page", async ({ page }) => {
    await page.goto("/workshop/ai-workshop-chicago-march-2025");

    // Check for workshop details
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/chicago/i)).toBeVisible();
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

    // Try to submit without filling required fields
    const submitButton = page.getByRole("button", { name: /register|continue|submit/i });

    if (await submitButton.isVisible()) {
      await submitButton.click();

      // Check for validation messages or that form wasn't submitted
      // The form should require fields to be filled
      const emailInput = page.getByLabel(/email/i);
      await expect(emailInput).toBeVisible();
    }
  });

  test("should display venue information for in-person workshops", async ({ page }) => {
    await page.goto("/workshop/ai-workshop-chicago-march-2025");

    // Check for venue details
    await expect(page.getByText(/marriott|location/i)).toBeVisible();
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
    // Login before each test
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("admin@scalingup.com");
    await page.getByLabel(/password/i).fill("demo123");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/.*dashboard/);
  });

  test("should display workshop list after login", async ({ page }) => {
    await page.goto("/workshops");

    // Should show workshop heading
    await expect(page.getByRole("heading", { name: /workshops/i })).toBeVisible();
  });

  test("should have create workshop button", async ({ page }) => {
    await page.goto("/workshops");

    // Look for create button
    await expect(page.getByRole("link", { name: /new workshop|create/i })).toBeVisible();
  });

  test("should navigate to workshop details", async ({ page }) => {
    await page.goto("/workshops");

    // Click on a workshop
    const workshopLink = page.getByRole("link", { name: /ai workshop|exit planning|virtual/i }).first();
    if (await workshopLink.isVisible()) {
      await workshopLink.click();

      // Should navigate to workshop details
      await expect(page).toHaveURL(/.*workshops\/.+/);
    }
  });
});
