import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import {
  expectResponsiveRoute,
  firstMatchingHref,
  type OverflowContext,
} from "./helpers/overflow";
import {
  workshopChildHrefPattern,
  workshopDetailHrefPattern,
} from "./helpers/workshop-route-contract";
import { responsivePresentationContext } from "./helpers/responsive-route-contract";

const COACH_EMAIL = process.env.E2E_COACH_EMAIL || "coach@example.com";
const COACH_PASSWORD = process.env.E2E_COACH_PASSWORD || "demo123";
const REFERRED_RESULTS_ROUTE = "/portal/assessments/referred-results";

export const COACH_ROUTES = [
  "/portal/home",
  "/portal/workshops",
  "/portal/request",
  "/portal/assessments",
  "/portal/assessments/new",
  "/portal/assessments/trends",
  "/portal/members",
  "/portal/members/import",
  "/portal/registrations",
  "/portal/follow-up",
  "/portal/templates",
  "/portal/coach/resources",
  "/portal/settings",
] as const;

const PROJECT_WIDTHS: Record<string, readonly number[]> = {
  "responsive-compact": [320, 375, 390, 430],
  "responsive-medium": [600, 768, 1023],
  "responsive-tablet-wide": [1024, 1366],
  "responsive-desktop": [1440],
};

test.setTimeout(10 * 60_000);

function widthsFor(testInfo: TestInfo): readonly number[] {
  const widths = PROJECT_WIDTHS[testInfo.project.name];
  expect(widths, `Responsive route matrix requires an explicit width inventory for ${testInfo.project.name}`).toBeTruthy();
  return widths;
}

function context(testInfo: TestInfo, route: string, width: number): OverflowContext {
  return {
    ...responsivePresentationContext("coach", route),
    route,
    project: testInfo.project.name,
    width,
  };
}

async function loginCoach(page: Page): Promise<void> {
  await loginAs(page, {
    email: COACH_EMAIL,
    password: COACH_PASSWORD,
    expectedUrl: /\/portal\//,
  });
}

async function optionalHrefs(page: Page, source: string, pattern: RegExp): Promise<string[]> {
  await page.goto(source, { waitUntil: "domcontentloaded" });
  return page.locator("a[href]").evaluateAll(
    (links, sourcePattern) => links
      .map((link) => link.getAttribute("href"))
      .filter((href): href is string => Boolean(href))
      .filter((href) => new RegExp(sourcePattern).test(href)),
    pattern.source,
  );
}

test("complete coach static route inventory has no document overflow", async ({ page }, testInfo) => {
  const widths = widthsFor(testInfo);
  await page.setViewportSize({ width: widths[0], height: 844 });
  await loginCoach(page);

  for (const width of widths) {
    await page.setViewportSize({ width, height: width >= 1024 ? 900 : 844 });
    for (const route of COACH_ROUTES) {
      await expectResponsiveRoute(page, context(testInfo, route, width));
    }
  }
});

test("populated coach routes are discovered from live links and fit every width", async ({ page }, testInfo) => {
  const widths = widthsFor(testInfo);
  await page.setViewportSize({ width: widths[0], height: 844 });
  await loginCoach(page);

  const workshopDetail = await firstMatchingHref(
    page,
    "/portal/workshops",
    workshopDetailHrefPattern("coach"),
    "coach-owned workshop detail",
  );
  const workshopSurvey = await firstMatchingHref(
    page,
    workshopDetail,
    workshopChildHrefPattern(workshopDetail, "surveys"),
    "coach workshop survey",
  );
  const campaignDetail = await firstMatchingHref(
    page,
    "/portal/assessments",
    /^\/portal\/assessments\/[^/?#]+$/,
    "coach campaign detail",
  );
  const referredResultsRoutes = await optionalHrefs(
    page,
    "/portal/assessments",
    new RegExp(`^${REFERRED_RESULTS_ROUTE}$`),
  );

  const optionalCampaignLinks = [
    ...(await optionalHrefs(page, campaignDetail, /^\/assessments\/[^/]+\/report(?:[?#].*)?$/)),
    ...(await optionalHrefs(page, campaignDetail, /^\/assessments\/[^/]+\/respondents\/[^/]+\/report(?:[?#].*)?$/)),
    ...(await optionalHrefs(page, campaignDetail, /^\/portal\/assessments\/respondents\/[^/]+\/longitudinal(?:[?#].*)?$/)),
  ];
  const dynamicRoutes = [...new Set([
    workshopDetail,
    workshopSurvey,
    campaignDetail,
    ...referredResultsRoutes,
    ...optionalCampaignLinks,
  ])];

  for (const width of widths) {
    await page.setViewportSize({ width, height: width >= 1024 ? 900 : 844 });
    for (const route of dynamicRoutes) {
      await expectResponsiveRoute(page, context(testInfo, route, width));
    }
  }
});
