import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { firstMatchingHref } from "./helpers/overflow";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@scalingup.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "demo123";
const COACH_EMAIL = process.env.E2E_COACH_EMAIL || "coach@example.com";
const COACH_PASSWORD = process.env.E2E_COACH_PASSWORD || "demo123";

async function screenshot(page: Page, role: string, surface: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot(`${role}-${surface}-${test.info().project.name}.png`, {
    animations: "disabled",
    fullPage: true,
    mask: [page.locator("time"), page.locator("[data-volatile]")],
  });
}

test("representative coach and admin domains match responsive baselines", async ({ page }) => {
  await loginAs(page, { email: COACH_EMAIL, password: COACH_PASSWORD, expectedUrl: /\/portal\// });
  for (const [surface, route] of [["home", "/portal/home"], ["workshops", "/portal/workshops"]] as const) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await screenshot(page, "coach", surface);
  }

  await page.context().clearCookies();
  await loginAs(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, expectedUrl: /\/admin|\/dashboard/ });
  for (const [surface, route] of [
    ["dashboard", "/admin/dashboard"],
    ["workshops", "/workshops"],
    ["assessment-organizations", "/admin/assessments/organizations"],
  ] as const) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await screenshot(page, "admin", surface);
  }

  const template = await firstMatchingHref(
    page,
    "/admin/assessments/templates",
    /^\/admin\/assessments\/templates\/[^/?#]+$/,
    "seeded assessment template detail",
  );
  await page.goto(template, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/admin\/assessments\/templates\/[^/]+\/versions\/[^/]+\/edit/);
  await screenshot(page, "admin", "assessment-editor");
});
