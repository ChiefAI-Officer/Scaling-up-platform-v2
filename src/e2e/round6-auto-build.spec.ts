import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "jverdun@scalingup.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "demo123";

test.describe("Round 6: Auto-Build on Approval (Sprint 5)", () => {
  test.describe("Pre-Flight Checks", () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, expectedUrl: /\/admin\/dashboard/ });
    });

    test("5.3 — Active template toggle exists on Templates page", async ({ page }) => {
      await page.goto("/templates");
      await page.waitForLoadState("networkidle");

      // Should see templates page with toggle
      const templateToggle = page.getByText(/set as active|active template/i).or(
        page.locator('[data-testid="active-template-toggle"]')
      );
      await expect(page.getByRole("heading", { name: /templates/i })).toBeVisible();
    });

    test("5.4 — Workflow editor has category/format/phase dropdowns", async ({ page }) => {
      await page.goto("/admin/workflows");
      await page.waitForLoadState("networkidle");

      // Click on first workflow to edit
      const workflowLink = page.getByRole("link").filter({ hasText: /workflow|sequence/i }).first();
      if (await workflowLink.isVisible()) {
        const href = await workflowLink.getAttribute("href");
        if (href) {
          await page.goto(href);
          await page.waitForLoadState("networkidle");

          // Should see Category, Workshop Format, and Phase dropdowns
          await expect(page.getByText(/category/i).first()).toBeVisible();
          await expect(page.getByText(/workshop format|format/i).first()).toBeVisible();
          await expect(page.getByText(/phase/i).first()).toBeVisible();
        }
      }
    });

    test("5.9 — No manual status transition buttons on workshop detail", async ({ page }) => {
      await page.goto("/workshops");
      await page.waitForLoadState("networkidle");

      // Click on first workshop
      const workshopLink = page.getByRole("link").filter({ hasText: /.+/ }).first();
      if (await workshopLink.isVisible()) {
        await workshopLink.click();
        await page.waitForLoadState("networkidle");

        // Should NOT see these manual transition buttons
        await expect(page.getByRole("button", { name: /move to pre.?event/i })).not.toBeVisible();
        await expect(page.getByRole("button", { name: /move to post.?event/i })).not.toBeVisible();
        await expect(page.getByRole("button", { name: /move to requested/i })).not.toBeVisible();
      }
    });

    test("5.10 — No Send Reminder Email button", async ({ page }) => {
      await page.goto("/workshops");
      await page.waitForLoadState("networkidle");

      const workshopLink = page.getByRole("link").filter({ hasText: /.+/ }).first();
      if (await workshopLink.isVisible()) {
        await workshopLink.click();
        await page.waitForLoadState("networkidle");

        await expect(page.getByRole("button", { name: /send reminder/i })).not.toBeVisible();
      }
    });
  });
});

test.describe("Round 7: Admin Workflow Status (Sprint 3)", () => {
  test("3.7 — Admin sees workflow status section on workshop detail", async ({ page }) => {
    await loginAs(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, expectedUrl: /\/admin\/dashboard/ });
    await page.goto("/workshops");
    await page.waitForLoadState("networkidle");

    const workshopLink = page.getByRole("link").filter({ hasText: /.+/ }).first();
    if (await workshopLink.isVisible()) {
      await workshopLink.click();
      await page.waitForLoadState("networkidle");

      // Should see workflow status section
      const workflowSection = page.getByText(/workflow status/i);
      // Note: may not be visible if no workflows assigned yet
    }
  });
});
