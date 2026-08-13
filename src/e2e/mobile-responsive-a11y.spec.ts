import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { expectResponsiveRoute, firstMatchingHref } from "./helpers/overflow";
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

async function navigateForAudit(
  page: Page,
  role: "coach" | "admin",
  route: string,
  project: string,
  allowedFinalPathnames?: readonly (string | RegExp)[],
): Promise<void> {
  await expectResponsiveRoute(page, {
    role,
    route,
    project,
    allowedFinalPathnames,
  });
}

test("representative coach and admin surfaces pass Axe and action target checks", async ({ page }, testInfo) => {
  await loginCoach(page);
  for (const route of COACH_AXE_ROUTES) {
    await navigateForAudit(page, "coach", route, testInfo.project.name);
    await auditPage(page, `role=coach, route=${route}, project=${testInfo.project.name}`);
  }

  await page.context().clearCookies();
  await loginAdmin(page);
  for (const route of ADMIN_AXE_ROUTES) {
    await navigateForAudit(page, "admin", route, testInfo.project.name);
    await auditPage(page, `role=admin, route=${route}, project=${testInfo.project.name}`);
  }
  const template = await firstMatchingHref(
    page,
    "/admin/assessments/templates",
    /^\/admin\/assessments\/templates\/[^/?#]+$/,
    "seeded assessment template detail",
  );
  await navigateForAudit(page, "admin", template, testInfo.project.name, [
    /^\/admin\/assessments\/templates\/[^/]+\/versions\/[^/]+\/edit$/,
  ]);
  await auditPage(page, `role=admin, route=${new URL(page.url()).pathname}, project=${testInfo.project.name}`);
});

test("compact overlays close with Escape and restore focus to their trigger", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "responsive-compact", "Compact overlay controls are hidden in wider projects");
  await page.setViewportSize({ width: 390, height: 844 });
  await loginCoach(page);

  await navigateForAudit(page, "coach", "/portal/home", testInfo.project.name);
  const coachDrawer = page.locator('header button[aria-label="Open menu"]');
  await coachDrawer.focus();
  await page.keyboard.press("Enter");
  await expect(coachDrawer).toHaveAttribute("aria-expanded", "true");
  const coachOverlay = page.getByTestId("coach-mobile-nav-backdrop");
  await expect(coachOverlay).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(coachDrawer).toHaveAttribute("aria-expanded", "false");
  await expect(coachOverlay).toBeHidden();
  await expect(coachDrawer).toBeFocused();

  await navigateForAudit(page, "coach", "/portal/members", testInfo.project.name);
  const organization = page.locator('[data-testid="members-browse-panel"] button[aria-pressed]').first();
  await organization.click();
  const dialogTrigger = page.getByRole("button", { name: "Add Member" });
  await dialogTrigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Add Member" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(dialogTrigger).toBeFocused();

  const campaign = await firstMatchingHref(page, "/portal/assessments", /^\/portal\/assessments\/[^/?#]+$/, "coach campaign detail");
  await navigateForAudit(page, "coach", campaign, testInfo.project.name);
  const actionMenu = page.getByRole("button", { name: "More campaign actions" });
  await actionMenu.focus();
  await page.keyboard.press("Enter");
  await expect(actionMenu).toHaveAttribute("aria-expanded", "true");
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await assertMinimumTouchTargets(
    page,
    `role=coach, route=${campaign}, overlay=campaign-actions, project=${testInfo.project.name}`,
    '[role="menuitem"]',
  );
  await page.keyboard.press("Escape");
  await expect(actionMenu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeHidden();
  await expect(actionMenu).toBeFocused();

  await page.context().clearCookies();
  await loginAdmin(page);
  await navigateForAudit(page, "admin", "/admin/dashboard", testInfo.project.name);
  const adminDrawer = page.locator('nav button[aria-label="Open menu"]');
  await adminDrawer.focus();
  await page.keyboard.press("Enter");
  await expect(adminDrawer).toHaveAttribute("aria-expanded", "true");
  const adminOverlay = adminDrawer.locator("xpath=following-sibling::div[1]");
  await expect(adminOverlay).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(adminDrawer).toHaveAttribute("aria-expanded", "false");
  await expect(adminOverlay).toBeHidden();
  await expect(adminDrawer).toBeFocused();

  await navigateForAudit(page, "admin", "/admin/assessments", testInfo.project.name);
  const disclosure = page.getByRole("button", { name: /Assessment section:/ });
  await disclosure.focus();
  await page.keyboard.press("Enter");
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  const assessmentOverlay = page.locator("#assessments-compact-navigation");
  await expect(assessmentOverlay).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await expect(assessmentOverlay).toBeHidden();
  await expect(disclosure).toBeFocused();
});
