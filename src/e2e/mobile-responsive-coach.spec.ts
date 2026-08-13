import { expect, test, type Locator } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { assertNoDocumentOverflow } from "./helpers/overflow";

const COACH_EMAIL = process.env.E2E_COACH_EMAIL || "coach@example.com";
const COACH_PASSWORD = process.env.E2E_COACH_PASSWORD || "demo123";

test.setTimeout(120_000);

async function expectTouchTarget(locator: Locator, label: string) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label} has a bounding box`).not.toBeNull();
  expect(box?.width, `${label} width`).toBeGreaterThanOrEqual(44);
  expect(box?.height, `${label} height`).toBeGreaterThanOrEqual(44);
}

for (const width of [320, 390, 1024]) {
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
        if (width < 1024) {
          const cards = page.getByRole("list", { name: "Workshops" });
          await expect(cards).toBeVisible();
          await expectTouchTarget(
            cards.getByRole("listitem").first().getByRole("link").first(),
            "compact workshop title",
          );
        } else {
          const tableRegion = page.getByRole("region", { name: "Workshop table" });
          await expect(tableRegion).toBeVisible();
          await expect(tableRegion).toHaveAttribute("tabindex", "0");
        }
        await expectTouchTarget(
          page.getByPlaceholder("Search workshops..."),
          "workshop search",
        );
        await page.getByRole("button", { name: /filters/i }).click();
        await expectTouchTarget(
          page.getByRole("combobox", { name: /status/i }),
          "workshop status filter",
        );
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
    await expectTouchTarget(
      page.getByRole("link", { name: "Back to Workshops" }),
      "detail footer back link",
    );
  });
}
