import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { expectResponsiveRoute, firstMatchingHref } from "./helpers/overflow";
import {
  assertDesktopParityEnvironment,
  type ResponsiveDesktopParityMode,
} from "./helpers/responsive-route-contract";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@scalingup.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "demo123";
const COACH_EMAIL = process.env.E2E_COACH_EMAIL || "coach@example.com";
const COACH_PASSWORD = process.env.E2E_COACH_PASSWORD || "demo123";
const MOBILE_RESPONSIVE_DESKTOP_PARITY_MODE = process.env
  .MOBILE_RESPONSIVE_DESKTOP_PARITY_MODE as ResponsiveDesktopParityMode | undefined;

async function screenshot(page: Page, role: string, surface: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot(`${role}-${surface}-${test.info().project.name}.png`, {
    animations: "disabled",
    fullPage: true,
  });
}

async function navigateForScreenshot(
  page: Page,
  role: "coach" | "admin",
  route: string,
  responsiveMode: "on" | "off" = "on",
  allowedFinalPathnames?: readonly (string | RegExp)[],
): Promise<void> {
  await expectResponsiveRoute(page, {
    role,
    route,
    project: test.info().project.name,
    responsiveMode,
    allowedFinalPathnames,
  });
}

async function navigateForLegacyParity(
  page: Page,
  role: "coach" | "admin",
  route: string,
): Promise<void> {
  await expectResponsiveRoute(page, {
    role,
    route,
    project: test.info().project.name,
    responsiveMode: "off",
  });
}

test("representative coach and admin domains match responsive baselines", async ({ page }) => {
  test.skip(Boolean(MOBILE_RESPONSIVE_DESKTOP_PARITY_MODE), "The OFF/KILL lane owns its legacy baseline contract");
  await loginAs(page, { email: COACH_EMAIL, password: COACH_PASSWORD, expectedUrl: /\/portal\// });
  for (const [surface, route] of [["home", "/portal/home"], ["workshops", "/portal/workshops"]] as const) {
    await navigateForScreenshot(page, "coach", route);
    await screenshot(page, "coach", surface);
  }

  await page.context().clearCookies();
  await loginAs(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, expectedUrl: /\/admin|\/dashboard/ });
  for (const [surface, route] of [
    ["dashboard", "/admin/dashboard"],
    ["workshops", "/workshops"],
    ["assessment-organizations", "/admin/assessments/organizations"],
  ] as const) {
    await navigateForScreenshot(page, "admin", route);
    await screenshot(page, "admin", surface);
  }

  const template = await firstMatchingHref(
    page,
    "/admin/assessments/templates",
    /^\/admin\/assessments\/templates\/[^/?#]+$/,
    "seeded assessment template detail",
  );
  await navigateForScreenshot(page, "admin", template, "on", [
    /^\/admin\/assessments\/templates\/[^/]+\/versions\/[^/]+\/edit$/,
  ]);
  await screenshot(page, "admin", "assessment-editor");
});

test("responsive OFF and KILL modes share the legacy desktop parity baselines", async ({ page }, testInfo) => {
  test.skip(!MOBILE_RESPONSIVE_DESKTOP_PARITY_MODE, "Run explicitly with MOBILE_RESPONSIVE_DESKTOP_PARITY_MODE=off|kill");
  test.skip(testInfo.project.name !== "responsive-desktop", "Desktop parity has one isolated project");
  assertDesktopParityEnvironment(MOBILE_RESPONSIVE_DESKTOP_PARITY_MODE!, process.env);

  await loginAs(page, { email: COACH_EMAIL, password: COACH_PASSWORD, expectedUrl: /\/portal\// });
  await navigateForLegacyParity(page, "coach", "/portal/home");
  await screenshot(page, "legacy-coach", "home");

  await page.context().clearCookies();
  await loginAs(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, expectedUrl: /\/admin|\/dashboard/ });
  await navigateForLegacyParity(page, "admin", "/admin/dashboard");
  await screenshot(page, "legacy-admin", "dashboard");
});
