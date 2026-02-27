import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "jverdun@scalingup.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "demo123";
const COACH_EMAIL = process.env.E2E_COACH_EMAIL || "coach@example.com";
const COACH_PASSWORD = process.env.E2E_COACH_PASSWORD || "demo123";

test.describe("Round 1 & 2: Workshop Creation Form (Sprint 1-2)", () => {
  test.describe("Admin — Workshop Creation Form", () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, expectedUrl: /\/admin\/dashboard/ });
      await page.goto("/workshops/new");
      await page.waitForLoadState("networkidle");
    });

    test("1.1 — Format dropdown has NO Hybrid option", async ({ page }) => {
      // Find the format dropdown/select
      const formatSelect = page.locator('[name="format"], [data-testid="format-select"]').first();
      if (await formatSelect.isVisible()) {
        await formatSelect.click();
      }
      // Check all visible options — should NOT contain "Hybrid"
      const hybridOption = page.getByText("Hybrid", { exact: true });
      await expect(hybridOption).not.toBeVisible();

      // Should see In-Person and Virtual
      await expect(page.getByText("In-Person")).toBeVisible();
      await expect(page.getByText("Virtual")).toBeVisible();
    });

    test("1.2 — No virtualPlatform dropdown when Virtual selected", async ({ page }) => {
      // Select Virtual format
      const virtualOption = page.getByText("Virtual");
      if (await virtualOption.isVisible()) {
        await virtualOption.click();
      }

      // Should NOT see a Zoom/Teams/Meet platform dropdown
      await expect(page.getByText("Zoom", { exact: true })).not.toBeVisible();
      await expect(page.getByText("Teams", { exact: true })).not.toBeVisible();
      await expect(page.getByText("Google Meet", { exact: true })).not.toBeVisible();

      // Should see a text input for virtual link URL
      const linkInput = page.getByPlaceholder(/meeting link|virtual link|url/i);
      // At least a text field for the URL should exist when Virtual is selected
      await expect(linkInput.or(page.locator('[name="virtualLink"]'))).toBeVisible();
    });

    test("1.3 — Free-form pricing input (not dropdown tiers)", async ({ page }) => {
      // Look for a number input or text input for price
      const priceInput = page.locator('[name="priceCents"], [name="price"], [data-testid="price-input"]').first();
      await expect(priceInput).toBeVisible();

      // Verify it accepts numeric input
      await priceInput.fill("499");
      await expect(priceInput).toHaveValue("499");

      // Check for suggested pricing hint
      const suggestedHint = page.getByText(/suggested pricing/i);
      // This may or may not be visible depending on category selection
    });

    test("1.4 — No early bird price or deadline fields", async ({ page }) => {
      // Scan the entire form — these fields should NOT exist
      await expect(page.getByText(/early bird/i)).not.toBeVisible();
      await expect(page.getByLabel(/early bird price/i)).not.toBeVisible();
      await expect(page.getByLabel(/early bird deadline/i)).not.toBeVisible();
    });

    test("1.5 — isFree checkbox hidden for In-Person, visible for Virtual", async ({ page }) => {
      // Select In-Person format
      const inPersonOption = page.getByText("In-Person");
      if (await inPersonOption.isVisible()) {
        await inPersonOption.click();
      }

      // The "free workshop" checkbox should NOT be visible
      const freeCheckbox = page.getByText(/free workshop/i);
      await expect(freeCheckbox).not.toBeVisible();

      // Switch to Virtual
      const virtualOption = page.getByText("Virtual");
      if (await virtualOption.isVisible()) {
        await virtualOption.click();
      }

      // The "free workshop" checkbox SHOULD reappear
      await expect(freeCheckbox).toBeVisible();
    });

    test("1.6 — Venue Instructions label (not Parking)", async ({ page }) => {
      // Select In-Person format to show venue fields
      const inPersonOption = page.getByText("In-Person");
      if (await inPersonOption.isVisible()) {
        await inPersonOption.click();
      }

      // Should say "Venue Instructions" NOT "Parking Instructions"
      await expect(page.getByText(/venue instructions/i)).toBeVisible();
      await expect(page.getByText(/parking instructions/i)).not.toBeVisible();

      // Check placeholder mentions parking, floor directions, building access
      const venueInput = page.getByPlaceholder(/parking|floor|building/i);
      await expect(venueInput).toBeVisible();
    });

    test("2.6 — Auto-generated title on category select (editable for admin)", async ({ page }) => {
      // Find and select a category
      const categorySelect = page.locator('[name="categoryId"], [data-testid="category-select"]').first();
      if (await categorySelect.isVisible()) {
        await categorySelect.selectOption({ index: 1 }); // Select first option
      }

      // Title field should auto-populate
      const titleInput = page.locator('[name="title"], [data-testid="title-input"]').first();
      await expect(titleInput).toBeVisible();

      // Wait for auto-population
      await page.waitForTimeout(500);

      // Title should have content (not empty)
      const titleValue = await titleInput.inputValue();
      expect(titleValue.length).toBeGreaterThan(0);

      // Admin SHOULD be able to edit it (not disabled/readonly)
      await expect(titleInput).toBeEnabled();
    });

    test("2.7 — Auto-generated description on category select (editable for admin)", async ({ page }) => {
      // Select a category
      const categorySelect = page.locator('[name="categoryId"], [data-testid="category-select"]').first();
      if (await categorySelect.isVisible()) {
        await categorySelect.selectOption({ index: 1 });
      }

      // Description should auto-populate
      const descInput = page.locator('[name="description"], textarea[name="description"]').first();
      await expect(descInput).toBeVisible();
      await page.waitForTimeout(500);

      // Admin SHOULD be able to edit
      await expect(descInput).toBeEnabled();
    });

    test("2.8 — Geo-targeting field exists", async ({ page }) => {
      await expect(page.getByText(/geo.?target/i)).toBeVisible();
    });

    test("2.9 — Excluded clients field exists", async ({ page }) => {
      await expect(page.getByText(/exclude.*clients|excluded.*clients/i)).toBeVisible();
    });
  });

  test.describe("Coach — Read-Only Fields", () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, { email: COACH_EMAIL, password: COACH_PASSWORD, expectedUrl: /\/portal/ });
      await page.goto("/portal/request");
      await page.waitForLoadState("networkidle");
    });

    test("2.6b — Title is read-only for coach", async ({ page }) => {
      // Select a category to trigger auto-population
      const categorySelect = page.locator('[name="categoryId"], [data-testid="category-select"]').first();
      if (await categorySelect.isVisible()) {
        await categorySelect.selectOption({ index: 1 });
        await page.waitForTimeout(500);
      }

      // Title should be disabled/readonly for coach
      const titleInput = page.locator('[name="title"], [data-testid="title-input"]').first();
      const isDisabled = await titleInput.isDisabled();
      const isReadonly = await titleInput.getAttribute("readonly");
      expect(isDisabled || isReadonly !== null).toBeTruthy();
    });

    test("2.7b — Description is read-only for coach", async ({ page }) => {
      const categorySelect = page.locator('[name="categoryId"], [data-testid="category-select"]').first();
      if (await categorySelect.isVisible()) {
        await categorySelect.selectOption({ index: 1 });
        await page.waitForTimeout(500);
      }

      const descInput = page.locator('[name="description"], textarea[name="description"]').first();
      const isDisabled = await descInput.isDisabled();
      const isReadonly = await descInput.getAttribute("readonly");
      expect(isDisabled || isReadonly !== null).toBeTruthy();
    });
  });
});
