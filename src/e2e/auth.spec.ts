import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("should redirect unauthenticated users to login", async ({ page }) => {
    await page.goto("/dashboard");

    // Should be redirected to login page
    await expect(page).toHaveURL(/.*login/);
  });

  test("should show login form", async ({ page }) => {
    await page.goto("/login");

    // Check for form elements
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("should show error for invalid credentials", async ({ page }) => {
    await page.goto("/login");

    // Fill in invalid credentials
    await page.getByLabel(/email/i).fill("invalid@example.com");
    await page.getByLabel(/password/i).fill("wrongpassword");
    await page.getByRole("button", { name: /sign in/i }).click();

    // Should show error message
    await expect(page.getByRole("alert")).toContainText(/invalid/i);
  });

  test("should login successfully with valid credentials", async ({ page }) => {
    await page.goto("/login");

    // Fill in valid credentials (demo user)
    await page.getByLabel(/email/i).fill("admin@scalingup.com");
    await page.getByLabel(/password/i).fill("demo123");
    await page.getByRole("button", { name: /sign in/i }).click();

    // Should redirect to dashboard
    await expect(page).toHaveURL(/.*dashboard/);
  });

  test("should display demo credentials hint", async ({ page }) => {
    await page.goto("/login");

    // Check for demo credentials info
    await expect(page.getByText(/demo credentials/i)).toBeVisible();
    await expect(page.getByText(/admin@scalingup\.com/)).toBeVisible();
  });
});

test.describe("Protected Routes", () => {
  test("should protect /workshops route", async ({ page }) => {
    await page.goto("/workshops");
    await expect(page).toHaveURL(/.*login/);
  });

  test("should protect /coaches route", async ({ page }) => {
    await page.goto("/coaches");
    await expect(page).toHaveURL(/.*login/);
  });

  test("should allow access to public workshop landing pages", async ({ page }) => {
    // Public landing pages should be accessible without login
    await page.goto("/workshop/ai-workshop-chicago-march-2025");

    // Should not redirect to login
    await expect(page).not.toHaveURL(/.*login/);
  });

  test("should allow access to registration success page", async ({ page }) => {
    await page.goto("/registration/success");

    // Should not redirect to login (though may show "not found" message)
    await expect(page).not.toHaveURL(/.*login/);
  });
});
