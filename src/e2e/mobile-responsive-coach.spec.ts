import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { assertNoDocumentOverflow } from "./helpers/overflow";

const COACH_EMAIL = process.env.E2E_COACH_EMAIL || "coach@example.com";
const COACH_PASSWORD = process.env.E2E_COACH_PASSWORD || "demo123";

test.setTimeout(120_000);

for (const width of [320, 390]) {
  test(`coach workshop surfaces fit a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await loginAs(page, {
      email: COACH_EMAIL,
      password: COACH_PASSWORD,
      expectedUrl: /\/portal\//,
    });

    for (const route of [
      "/portal/home",
      "/portal/workshops",
      "/portal/request",
      "/portal/settings",
    ]) {
      await page.goto(route);
      await expect(page.locator("body")).toHaveAttribute(
        "data-mobile-responsive",
        "on",
      );
      await assertNoDocumentOverflow(page, `${route} at ${width}`);
      if (route === "/portal/workshops") {
        await expect(page.getByRole("list", { name: "Workshops" })).toBeVisible();
      }
    }

    await page.goto("/portal/workshops");
    const detailLinks = page.locator('a[href^="/portal/workshops/"]');
    await expect(
      detailLinks.first(),
      "the coach fixture must include a populated workshop detail link",
    ).toBeVisible();
    const detailHref = await detailLinks.first().getAttribute("href");
    expect(detailHref).toMatch(/^\/portal\/workshops\/[^/]+$/);

    await page.goto(detailHref!);
    await assertNoDocumentOverflow(page, `${detailHref} at ${width}`);
  });
}
