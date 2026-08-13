import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { assertNoDocumentOverflow } from "./helpers/overflow";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@scalingup.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "demo123";
const COACH_EMAIL = process.env.E2E_COACH_EMAIL || "coach@example.com";
const COACH_PASSWORD = process.env.E2E_COACH_PASSWORD || "demo123";

for (const width of [320, 300, 260]) {
  test(`admin and coach shells fit a ${width}px zoom-equivalent viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });

    await loginAs(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, expectedUrl: /\/admin|\/dashboard/ });
    await page.goto("/admin/dashboard");
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      "content",
      /width=device-width.*initial-scale=1/,
    );
    await expect(page.locator("body")).toHaveAttribute("data-mobile-responsive", "on");
    await expect(page.locator('[data-auth-shell="admin"]')).toBeVisible();
    await assertNoDocumentOverflow(page, `admin dashboard at ${width}`);

    await page.context().clearCookies();
    await loginAs(page, { email: COACH_EMAIL, password: COACH_PASSWORD, expectedUrl: /\/portal/ });
    await page.goto("/portal/home");
    await expect(page.locator("body")).toHaveAttribute("data-mobile-responsive", "on");
    await expect(page.locator('[data-auth-shell="coach"]')).toBeVisible();
    await assertNoDocumentOverflow(page, `coach home at ${width}`);
  });
}
