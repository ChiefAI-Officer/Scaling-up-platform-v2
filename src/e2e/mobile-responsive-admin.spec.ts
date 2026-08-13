import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import {
  expectResponsiveRoute,
  firstMatchingHref,
  type OverflowContext,
} from "./helpers/overflow";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@scalingup.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "demo123";

export const ADMIN_ROUTES = [
  "/dashboard", "/admin/dashboard", "/admin/approvals", "/admin/files", "/admin/financials",
  "/admin/pricing", "/admin/refunds-needed", "/admin/registrations", "/admin/settings",
  "/admin/surveys", "/admin/surveys/aggregate", "/admin/transactional-emails",
  "/admin/workflows", "/admin/assessments", "/admin/assessments/access-groups",
  "/admin/assessments/aggregate", "/admin/assessments/campaigns",
  "/admin/assessments/import", "/admin/assessments/observability",
  "/admin/assessments/organizations", "/admin/assessments/public-campaigns",
  "/admin/assessments/public-campaigns/new", "/admin/assessments/delivery-holds",
  "/admin/assessments/templates", "/admin/assessments/templates/new",
  "/admin/categories", "/coaches", "/coaches/new", "/contacts",
  "/partners", "/surveys", "/templates", "/templates/new", "/workshops", "/workshops/new", "/bio",
  "/admin/workflows/new", "/admin/surveys/templates/new",
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
    role: "admin",
    route,
    project: testInfo.project.name,
    width,
    ...(route === "/dashboard"
      ? { allowedFinalPathnames: ["/admin/dashboard"] }
      : {}),
  };
}

async function loginAdmin(page: Page): Promise<void> {
  await loginAs(page, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    expectedUrl: /\/admin|\/dashboard/,
  });
}

async function optionalHrefs(page: Page, source: string, patterns: RegExp[]): Promise<string[]> {
  await page.goto(source, { waitUntil: "domcontentloaded" });
  const hrefs = await page.locator("a[href]").evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")).filter((href): href is string => Boolean(href)),
  );
  return hrefs.filter((href) => patterns.some((pattern) => pattern.test(href)));
}

test("complete admin static route inventory has no document overflow", async ({ page }, testInfo) => {
  const widths = widthsFor(testInfo);
  await page.setViewportSize({ width: widths[0], height: 844 });
  await loginAdmin(page);

  for (const width of widths) {
    await page.setViewportSize({ width, height: width >= 1024 ? 900 : 844 });
    for (const route of ADMIN_ROUTES) {
      await expectResponsiveRoute(page, context(testInfo, route, width));
    }
  }
});

test("populated admin routes are discovered from live links and fit every width", async ({ page }, testInfo) => {
  const widths = widthsFor(testInfo);
  await page.setViewportSize({ width: widths[0], height: 844 });
  await loginAdmin(page);

  const workshopDetail = await firstMatchingHref(page, "/workshops", /^\/workshops\/[^/?#]+$/, "admin workshop detail");
  const workshopSurvey = await firstMatchingHref(
    page,
    workshopDetail,
    /^\/workshops\/[^/?#]+\/surveys(?:[?#].*)?$/,
    "admin workshop survey",
  );
  await page.goto(workshopDetail, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Edit Landing Page" }).click();
  await expect(page).toHaveURL(/\/workshops\/[^/]+\/landing-pages$/);
  const landingManager = new URL(page.url()).pathname;
  const editorButton = page.getByRole("button", { name: /^(Create|Edit) Page$/ }).first();
  await expect(editorButton, "the populated admin workshop must expose a landing-page editor action").toBeVisible();
  await editorButton.click();
  await expect(page).toHaveURL(/\/workshops\/[^/]+\/landing-pages\/[^/]+$/);
  const landingEditor = new URL(page.url()).pathname;
  const coachDetail = await firstMatchingHref(page, "/coaches", /^\/coaches\/[^/?#]+$/, "coach detail");
  const coachEdit = await firstMatchingHref(page, coachDetail, /^\/coaches\/[^/?#]+\/edit$/, "coach edit");
  const templateDetail = await firstMatchingHref(page, "/admin/assessments/templates", /^\/admin\/assessments\/templates\/[^/?#]+$/, "assessment template detail");
  const accessGroupDetail = await firstMatchingHref(page, "/admin/assessments/access-groups", /^\/admin\/assessments\/access-groups\/[^/?#]+$/, "access-group detail");
  const campaignDetail = await firstMatchingHref(page, "/admin/assessments/campaigns", /^\/admin\/assessments\/campaigns\/[^/?#]+$/, "admin campaign detail");
  const workflowDetail = await firstMatchingHref(page, "/admin/workflows", /^\/admin\/workflows\/[^/?#]+(?:\?[^#]*)?$/, "workflow detail");
  const surveyTemplateDetail = await firstMatchingHref(page, "/admin/surveys", /^\/admin\/surveys\/templates\/[^/?#]+$/, "survey-template detail");
  const emailEditor = await firstMatchingHref(page, "/admin/transactional-emails", /^\/admin\/transactional-emails\/[^/?#]+$/, "transactional-email editor");

  await page.goto(templateDetail, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/admin\/assessments\/templates\/[^/]+\/versions\/[^/]+\/edit/);
  const versionEditor = new URL(page.url()).pathname + new URL(page.url()).search;
  const optionalCampaignLinks = await optionalHrefs(page, campaignDetail, [
    /^\/assessments\/[^/]+\/report(?:[?#].*)?$/,
    /^\/assessments\/[^/]+\/respondents\/[^/]+\/report(?:[?#].*)?$/,
    /^\/portal\/assessments\/respondents\/[^/]+\/longitudinal(?:[?#].*)?$/,
  ]);
  const dynamicRoutes = [...new Set([
    workshopDetail,
    workshopSurvey,
    landingManager,
    landingEditor,
    coachDetail,
    coachEdit,
    templateDetail,
    versionEditor,
    accessGroupDetail,
    campaignDetail,
    workflowDetail,
    surveyTemplateDetail,
    emailEditor,
    ...optionalCampaignLinks,
  ])];

  for (const width of widths) {
    await page.setViewportSize({ width, height: width >= 1024 ? 900 : 844 });
    for (const route of dynamicRoutes) {
      await expectResponsiveRoute(page, {
        ...context(testInfo, route, width),
        ...(route === templateDetail
          ? {
              allowedFinalPathnames: [
                /^\/admin\/assessments\/templates\/[^/]+\/versions\/[^/]+\/edit$/,
              ],
            }
          : {}),
      });
    }
  }
});
