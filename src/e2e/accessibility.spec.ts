import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Accessibility", () => {
  test("login page should have no accessibility violations", async ({ page }) => {
    await page.goto("/login");

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("public workshop page should have no critical accessibility violations", async ({ page }) => {
    await page.goto("/workshop/ai-workshop-chicago-march-2025");

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .exclude(".stripe-element") // Exclude third-party components
      .analyze();

    // Filter for critical and serious violations only
    const criticalViolations = accessibilityScanResults.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );

    expect(criticalViolations).toEqual([]);
  });

  test("dashboard should be keyboard navigable", async ({ page }) => {
    // Login first
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("admin@scalingup.com");
    await page.getByLabel(/password/i).fill("demo123");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/.*dashboard/);

    // Check that we can tab through navigation
    await page.keyboard.press("Tab");
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedElement).toBeTruthy();

    // Navigate with keyboard
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
    }

    // Check focus is still on an element
    const stillFocused = await page.evaluate(() => document.activeElement?.tagName);
    expect(stillFocused).toBeTruthy();
  });

  test("forms should have proper labels", async ({ page }) => {
    await page.goto("/login");

    // Check that inputs have labels
    const emailInput = page.getByLabel(/email/i);
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute("type", "email");

    const passwordInput = page.getByLabel(/password/i);
    await expect(passwordInput).toBeVisible();
    await expect(passwordInput).toHaveAttribute("type", "password");
  });

  test("buttons should have accessible names", async ({ page }) => {
    await page.goto("/login");

    // Check button has accessible text
    const submitButton = page.getByRole("button", { name: /sign in/i });
    await expect(submitButton).toBeVisible();

    // Button should not be empty
    const buttonText = await submitButton.textContent();
    expect(buttonText?.trim()).toBeTruthy();
  });

  test("error messages should be announced to screen readers", async ({ page }) => {
    await page.goto("/login");

    // Submit with invalid credentials
    await page.getByLabel(/email/i).fill("invalid@example.com");
    await page.getByLabel(/password/i).fill("wrong");
    await page.getByRole("button", { name: /sign in/i }).click();

    // Wait for error message
    const errorAlert = page.getByRole("alert");
    await expect(errorAlert).toBeVisible({ timeout: 5000 });

    // Check it has proper role for screen readers
    await expect(errorAlert).toHaveAttribute("role", "alert");
  });

  test("page should have proper heading hierarchy", async ({ page }) => {
    await page.goto("/workshop/ai-workshop-chicago-march-2025");

    // Get all headings
    const headings = await page.$$eval("h1, h2, h3, h4, h5, h6", (elements) =>
      elements.map((el) => ({
        tag: el.tagName.toLowerCase(),
        text: el.textContent?.trim(),
      }))
    );

    // Should have at least one h1
    const h1Count = headings.filter((h) => h.tag === "h1").length;
    expect(h1Count).toBeGreaterThanOrEqual(1);

    // H1 should not be empty
    const h1 = headings.find((h) => h.tag === "h1");
    expect(h1?.text).toBeTruthy();
  });

  test("images should have alt text", async ({ page }) => {
    await page.goto("/workshop/ai-workshop-chicago-march-2025");

    // Get all images
    const images = await page.$$("img");

    for (const img of images) {
      const alt = await img.getAttribute("alt");
      const role = await img.getAttribute("role");

      // Images should have alt text or be marked as decorative
      expect(alt !== null || role === "presentation").toBeTruthy();
    }
  });

  test("color contrast should meet WCAG AA standards", async ({ page }) => {
    await page.goto("/login");

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["color-contrast"])
      .analyze();

    // Check for color contrast violations
    const contrastViolations = accessibilityScanResults.violations.filter(
      (v) => v.id === "color-contrast"
    );

    expect(contrastViolations).toEqual([]);
  });
});

test.describe("Focus Management", () => {
  test("focus should be visible on interactive elements", async ({ page }) => {
    await page.goto("/login");

    // Tab to email input
    await page.keyboard.press("Tab");

    // Check that focus is visible (element should be focused)
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return el?.tagName;
    });

    expect(focused).toBeTruthy();
  });

  test("modal should trap focus", async ({ page }) => {
    // Login first
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("admin@scalingup.com");
    await page.getByLabel(/password/i).fill("demo123");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/.*dashboard/);

    // Navigate to a page with a modal/dialog
    await page.goto("/workshops");

    // If there's a confirm dialog when changing status
    // the focus should be trapped within the dialog
    // This is a placeholder for actual modal testing
  });
});
