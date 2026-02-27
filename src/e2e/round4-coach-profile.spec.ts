import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";

const COACH_EMAIL = process.env.E2E_COACH_EMAIL || "coach@example.com";
const COACH_PASSWORD = process.env.E2E_COACH_PASSWORD || "demo123";

test.describe("Round 4: Coach Profile (Sprint 4)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, { email: COACH_EMAIL, password: COACH_PASSWORD, expectedUrl: /\/portal/ });
    await page.goto("/portal/settings");
    await page.waitForLoadState("networkidle");
  });

  test("4.2 — No Circle.so text anywhere", async ({ page }) => {
    // Should NOT mention Circle.so anywhere on the settings page
    await expect(page.getByText(/circle\.so/i)).not.toBeVisible();
    await expect(page.getByText(/imported from circle/i)).not.toBeVisible();
  });

  test("4.3 — No image URL text field (only file upload)", async ({ page }) => {
    // Should NOT have a text input for image URL
    await expect(page.getByLabel(/image url/i)).not.toBeVisible();
    await expect(page.getByPlaceholder(/image url|paste.*url/i)).not.toBeVisible();

    // Should have a file upload button/input
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached();
  });

  test("4.5 — LinkedIn URL field exists", async ({ page }) => {
    const linkedinField = page.getByLabel(/linkedin/i).or(
      page.locator('[name="linkedinUrl"]')
    );
    await expect(linkedinField).toBeVisible();
  });

  test("4.6 — Show Book a Call CTA toggle exists", async ({ page }) => {
    const ctaToggle = page.getByText(/book a call|show.*cta/i).or(
      page.locator('[name="showBookCallCta"]')
    );
    await expect(ctaToggle).toBeVisible();
  });
});
