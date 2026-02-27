import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@scalingup.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "demo123";

test.describe("Round 2: Category Admin Editor (Sprint 2)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, expectedUrl: /\/admin/ });
    await page.goto("/admin/categories");
    await page.waitForLoadState("networkidle");
  });

  test("2.10 — Default Title and Default Description fields exist in category editor", async ({ page }) => {
    // Click edit on the first category row (or "New Category" if none exist)
    const editButton = page.getByRole("button", { name: /edit/i }).first();
    const newButton = page.getByRole("button", { name: /new category|add category|create/i }).first();

    if (await editButton.isVisible()) {
      await editButton.click();
    } else {
      await newButton.click();
    }

    await page.waitForLoadState("networkidle");

    // Should have Default Title field
    const defaultTitleField = page.getByLabel(/default title/i).or(
      page.locator('[name="defaultTitle"]')
    );
    await expect(defaultTitleField).toBeVisible();

    // Should have Default Description field
    const defaultDescField = page.getByLabel(/default description/i).or(
      page.locator('[name="defaultDescription"]')
    );
    await expect(defaultDescField).toBeVisible();
  });

  test("2.10b — Default Title and Description persist after save", async ({ page }) => {
    // Click edit on the first category
    const editButton = page.getByRole("button", { name: /edit/i }).first();
    await expect(editButton).toBeVisible();
    await editButton.click();
    await page.waitForLoadState("networkidle");

    const uniqueTitle = `E2E Test Title ${Date.now()}`;
    const uniqueDesc = `E2E Test Description ${Date.now()}`;

    // Fill in default title
    const defaultTitleField = page.getByLabel(/default title/i).or(
      page.locator('[name="defaultTitle"]')
    );
    await defaultTitleField.fill(uniqueTitle);

    // Fill in default description
    const defaultDescField = page.getByLabel(/default description/i).or(
      page.locator('[name="defaultDescription"]')
    );
    await defaultDescField.fill(uniqueDesc);

    // Save
    const saveButton = page.getByRole("button", { name: /save|update/i });
    await saveButton.click();
    await page.waitForLoadState("networkidle");

    // Refresh and re-open the editor
    await page.goto("/admin/categories");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /edit/i }).first().click();
    await page.waitForLoadState("networkidle");

    // Verify persistence
    const titleField = page.getByLabel(/default title/i).or(
      page.locator('[name="defaultTitle"]')
    );
    await expect(titleField).toHaveValue(uniqueTitle);

    const descField = page.getByLabel(/default description/i).or(
      page.locator('[name="defaultDescription"]')
    );
    await expect(descField).toHaveValue(uniqueDesc);
  });
});
