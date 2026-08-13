import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { assertNoDocumentOverflow } from "./helpers/overflow";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@scalingup.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "demo123";

test.setTimeout(120_000);

for (const width of [320, 390]) {
  test(`admin workshop and file collections fit a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await loginAs(page, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      expectedUrl: /\/admin|\/dashboard/,
    });

    for (const route of ["/admin/dashboard", "/workshops", "/admin/files"]) {
      await page.goto(route);
      await expect(page.locator("body")).toHaveAttribute("data-mobile-responsive", "on");
      await assertNoDocumentOverflow(page, `${route} at ${width}`);
    }

    await page.goto("/workshops");
    const workshops = page.getByRole("list", { name: "Admin workshops" });
    await expect(workshops).toBeVisible();
    const detailLink = workshops.locator('a[href^="/workshops/"]').first();
    await expect(
      detailLink,
      "the admin fixture must include a populated workshop detail link",
    ).toBeVisible();
    const detailHref = await detailLink.getAttribute("href");
    expect(detailHref).toMatch(/^\/workshops\/[^/#?]+$/);

    await page.goto(detailHref!);
    await assertNoDocumentOverflow(page, `${detailHref} at ${width}`);
    await expect(page.getByRole("region", { name: "Workshop registrations" })).toBeVisible();
  });
}
