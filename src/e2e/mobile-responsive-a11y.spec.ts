import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { firstMatchingHref } from "./helpers/overflow";
import {
  assertMinimumTouchTargets,
  AUTHENTICATED_ACTION_TARGET_SELECTOR,
} from "./helpers/touch-targets";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@scalingup.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "demo123";
const COACH_EMAIL = process.env.E2E_COACH_EMAIL || "coach@example.com";
const COACH_PASSWORD = process.env.E2E_COACH_PASSWORD || "demo123";

const COACH_AXE_ROUTES = ["/portal/home", "/portal/workshops", "/portal/members"] as const;
const ADMIN_AXE_ROUTES = ["/admin/dashboard", "/workshops", "/admin/assessments/organizations"] as const;

test.setTimeout(5 * 60_000);

async function loginCoach(page: Page): Promise<void> {
  await loginAs(page, { email: COACH_EMAIL, password: COACH_PASSWORD, expectedUrl: /\/portal\// });
}

async function loginAdmin(page: Page): Promise<void> {
  await loginAs(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, expectedUrl: /\/admin|\/dashboard/ });
}

async function auditPage(page: Page, label: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations, `${label}: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);
  await assertMinimumTouchTargets(page, label, AUTHENTICATED_ACTION_TARGET_SELECTOR);
}

test("representative coach and admin surfaces pass Axe and action target checks", async ({ page }, testInfo) => {
  await loginCoach(page);
  for (const route of COACH_AXE_ROUTES) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await auditPage(page, `role=coach, route=${route}, project=${testInfo.project.name}`);
  }

  await page.context().clearCookies();
  await loginAdmin(page);
  for (const route of ADMIN_AXE_ROUTES) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await auditPage(page, `role=admin, route=${route}, project=${testInfo.project.name}`);
  }
  const template = await firstMatchingHref(
    page,
    "/admin/assessments/templates",
    /^\/admin\/assessments\/templates\/[^/?#]+$/,
    "seeded assessment template detail",
  );
  await page.goto(template, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/admin\/assessments\/templates\/[^/]+\/versions\/[^/]+\/edit/);
  await auditPage(page, `role=admin, route=${new URL(page.url()).pathname}, project=${testInfo.project.name}`);
});

test("compact overlays close with Escape and restore focus to their trigger", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "responsive-compact", "Compact overlay controls are hidden in wider projects");
  await page.setViewportSize({ width: 390, height: 844 });
  await loginCoach(page);

  await page.goto("/portal/home");
  const coachDrawer = page.locator('header button[aria-label="Open menu"]');
  await coachDrawer.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(coachDrawer).toBeFocused();

  await page.goto("/portal/members");
  const organization = page.locator('[data-testid="members-browse-panel"] button[aria-pressed]').first();
  await organization.click();
  const dialogTrigger = page.getByRole("button", { name: "Add Member" });
  await dialogTrigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Add Member" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialogTrigger).toBeFocused();

  const campaign = await firstMatchingHref(page, "/portal/assessments", /^\/portal\/assessments\/[^/?#]+$/, "coach campaign detail");
  await page.goto(campaign);
  const actionMenu = page.getByRole("button", { name: "More campaign actions" });
  await actionMenu.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await assertMinimumTouchTargets(
    page,
    `role=coach, route=${campaign}, overlay=campaign-actions, project=${testInfo.project.name}`,
    '[role="menuitem"]',
  );
  await page.keyboard.press("Escape");
  await expect(actionMenu).toBeFocused();

  await page.context().clearCookies();
  await loginAdmin(page);
  await page.goto("/admin/dashboard");
  const adminDrawer = page.locator('nav button[aria-label="Open menu"]');
  await adminDrawer.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(adminDrawer).toBeFocused();

  await page.goto("/admin/assessments");
  const disclosure = page.getByRole("button", { name: /Assessment section:/ });
  await disclosure.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(disclosure).toBeFocused();
});
