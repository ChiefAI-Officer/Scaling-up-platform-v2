import { expect, test, type Locator } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { assertNoDocumentOverflow } from "./helpers/overflow";
import { assertMinimumTouchTargets } from "./helpers/touch-targets";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@scalingup.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "demo123";
const COACH_EMAIL = process.env.E2E_COACH_EMAIL || "coach@example.com";
const COACH_PASSWORD = process.env.E2E_COACH_PASSWORD || "demo123";

async function expectTouchTarget(locator: Locator, label: string) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label} has a bounding box`).not.toBeNull();
  expect(box?.width, `${label} width`).toBeGreaterThanOrEqual(44);
  expect(box?.height, `${label} height`).toBeGreaterThanOrEqual(44);
}

for (const width of [320, 300, 260, 639, 640, 1023, 1024]) {
  test(`admin and coach shells fit a ${width}px viewport`, async ({ page }) => {
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
    await assertMinimumTouchTargets(page, `admin dashboard at ${width}`);
    if (width <= 639) {
      await expectTouchTarget(page.getByRole("button", { name: /toggle theme|switch to (dark|light) mode/i }), "admin theme toggle");
      await expectTouchTarget(page.locator('nav button[aria-label="Open menu"]'), "admin menu toggle");
    }

    await page.context().clearCookies();
    await loginAs(page, { email: COACH_EMAIL, password: COACH_PASSWORD, expectedUrl: /\/portal/ });
    await page.goto("/portal/home");
    await expect(page.locator("body")).toHaveAttribute("data-mobile-responsive", "on");
    await expect(page.locator('[data-auth-shell="coach"]')).toBeVisible();
    await assertNoDocumentOverflow(page, `coach home at ${width}`);
    await assertMinimumTouchTargets(page, `coach home at ${width}`);
    if (width <= 639) {
      await expectTouchTarget(page.getByRole("button", { name: /toggle theme|switch to (dark|light) mode/i }), "coach theme toggle");
      await expectTouchTarget(page.locator('header button[aria-label="Open menu"]'), "coach menu toggle");
    }
  });
}
