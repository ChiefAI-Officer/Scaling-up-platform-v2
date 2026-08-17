import {
  expect,
  test,
  type Page,
  type Response,
  type TestInfo,
} from "@playwright/test";
import { loginAs } from "./helpers/auth";
import {
  cuidDetailHrefPattern,
  discoverSettledHref,
  nonReservedDetailHrefPattern,
} from "./helpers/live-href-discovery-contract";
import {
  expectResponsiveRoute,
  firstMatchingHref,
  type OverflowContext,
} from "./helpers/overflow";
import {
  assertResponsiveNavigationContract,
  isShelllessAssessmentReportRoute,
} from "./helpers/responsive-route-contract";
import {
  coachDetailHrefPattern,
  coachEditHrefPattern,
} from "./helpers/coach-route-contract";
import {
  workshopChildHref,
  workshopDetailHrefPattern,
} from "./helpers/workshop-route-contract";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@scalingup.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "demo123";
const PUBLIC_CAMPAIGN_CREATE_ROUTE = "/admin/assessments/public-campaigns/new";

export const ADMIN_ROUTES = [
  "/dashboard", "/admin/dashboard", "/admin/approvals", "/admin/files", "/admin/financials",
  "/admin/pricing", "/admin/refunds-needed", "/admin/registrations", "/admin/settings",
  "/admin/surveys", "/admin/surveys/aggregate", "/admin/transactional-emails",
  "/admin/workflows", "/admin/assessments", "/admin/assessments/access-groups",
  "/admin/assessments/aggregate", "/admin/assessments/campaigns",
  "/admin/assessments/import", "/admin/assessments/observability",
  "/admin/assessments/organizations", "/admin/assessments/public-campaigns",
  "/admin/assessments/delivery-holds",
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
    ...(isShelllessAssessmentReportRoute(route)
      ? { responsiveSurface: "shellless-report" as const }
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

async function pageHrefs(page: Page): Promise<string[]> {
  return page.locator("a[href]").evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")).filter((href): href is string => Boolean(href)),
  );
}

function collectionResponse(page: Page, apiPath: string): Promise<Response> {
  return page.waitForResponse((response) =>
    response.request().method() === "GET"
    && new URL(response.url()).pathname === apiPath,
  );
}

async function settledApiCount(
  responsePromise: Promise<Response>,
  label: string,
): Promise<number> {
  const response = await responsePromise;
  expect(response.ok(), `${label} readiness returned HTTP ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { success?: unknown; data?: unknown };
  expect(body.success, `${label} readiness did not report success`).toBe(true);
  expect(Array.isArray(body.data), `${label} readiness did not return a data array`).toBe(true);
  return (body.data as unknown[]).length;
}

async function discoverApiCollectionHref(
  page: Page,
  source: string,
  apiPath: string,
  pattern: RegExp,
  label: string,
): Promise<string | null> {
  let readiness: Promise<Response> | null = null;
  return discoverSettledHref({
    navigate: async () => {
      readiness = collectionResponse(page, apiPath);
      const response = await page.goto(source, { waitUntil: "domcontentloaded" });
      return {
        requestedRoute: source,
        finalUrl: page.url(),
        responsePresent: response !== null,
        status: response?.status() ?? null,
      };
    },
    settle: async () => {
      if (!readiness) throw new Error(`${label} readiness was not initialized.`);
      return settledApiCount(readiness, label);
    },
    readHrefs: () => pageHrefs(page),
    pattern,
    label,
  });
}

async function discoverDomCollectionHref(
  page: Page,
  source: string,
  pattern: RegExp,
  emptyState: RegExp,
  label: string,
): Promise<string | null> {
  let settledCount: number | null = null;
  return discoverSettledHref({
    navigate: async () => {
      const response = await page.goto(source, { waitUntil: "domcontentloaded" });
      return {
        requestedRoute: source,
        finalUrl: page.url(),
        responsePresent: response !== null,
        status: response?.status() ?? null,
      };
    },
    settle: async () => {
      await expect.poll(async () => {
        const hrefs = await pageHrefs(page);
        const hasCandidate = hrefs.some((href) => {
          pattern.lastIndex = 0;
          return pattern.test(href);
        });
        if (hasCandidate) settledCount = 1;
        else if (await page.getByText(emptyState).first().isVisible().catch(() => false)) {
          settledCount = 0;
        }
        return settledCount;
      }, {
        message: `${source} did not settle to a populated or explicit empty ${label} collection`,
      }).not.toBeNull();
      return settledCount!;
    },
    readHrefs: () => pageHrefs(page),
    pattern,
    label,
  });
}

async function optionalHrefs(
  page: Page,
  source: string,
  patterns: RegExp[],
  readinessApiPath?: string,
): Promise<string[]> {
  const readiness = readinessApiPath
    ? collectionResponse(page, readinessApiPath)
    : null;
  const response = await page.goto(source, { waitUntil: "domcontentloaded" });
  assertResponsiveNavigationContract({
    requestedRoute: source,
    finalUrl: page.url(),
    responsePresent: response !== null,
    status: response?.status() ?? null,
  });
  if (readiness) await settledApiCount(readiness, `${source} optional links`);
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

  const workshopDetail = await discoverDomCollectionHref(
    page,
    "/workshops",
    workshopDetailHrefPattern("admin"),
    /No workshops yet/,
    "admin workshop detail",
  );
  const workshopRoutes: string[] = [];
  if (workshopDetail) {
    const workshopSurvey = workshopChildHref(workshopDetail, "surveys");
    const landingManager = workshopChildHref(workshopDetail, "landing-pages");
    await expectResponsiveRoute(page, context(testInfo, landingManager, widths[0]));
    const editorButton = page.getByRole("button", { name: /^(Create|Edit) Page$/ }).first();
    await expect(editorButton, "the populated admin workshop must expose a landing-page editor action").toBeVisible();
    await editorButton.click();
    await expect(page).toHaveURL(new RegExp(`${landingManager}/[^/?#]+$`));
    workshopRoutes.push(
      workshopDetail,
      workshopSurvey,
      landingManager,
      new URL(page.url()).pathname,
    );
  }

  const coachDetail = await discoverDomCollectionHref(
    page,
    "/coaches",
    coachDetailHrefPattern(),
    /No coaches yet/,
    "coach detail",
  );
  const coachRoutes: string[] = [];
  if (coachDetail) {
    const coachEdit = await firstMatchingHref(
      page,
      coachDetail,
      coachEditHrefPattern(coachDetail),
      "coach edit",
    );
    coachRoutes.push(coachDetail, coachEdit);
  }

  const templateDetail = await discoverApiCollectionHref(
    page,
    "/admin/assessments/templates",
    "/api/admin/assessment-templates",
    cuidDetailHrefPattern("/admin/assessments/templates"),
    "assessment template detail",
  );
  const templateRoutes: string[] = [];
  if (templateDetail) {
    await page.goto(templateDetail, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/admin\/assessments\/templates\/[^/]+\/versions\/[^/]+\/edit/);
    templateRoutes.push(
      templateDetail,
      new URL(page.url()).pathname + new URL(page.url()).search,
    );
  }

  const accessGroupDetail = await discoverApiCollectionHref(
    page,
    "/admin/assessments/access-groups",
    "/api/admin/access-groups",
    cuidDetailHrefPattern("/admin/assessments/access-groups"),
    "access-group detail",
  );
  const campaignDetail = await discoverDomCollectionHref(
    page,
    "/admin/assessments/campaigns",
    cuidDetailHrefPattern("/admin/assessments/campaigns"),
    /No campaigns in this status/,
    "admin campaign detail",
  );
  const workflowDetail = await discoverDomCollectionHref(
    page,
    "/admin/workflows",
    nonReservedDetailHrefPattern("/admin/workflows"),
    /No workflows yet/,
    "workflow detail",
  );
  const surveyTemplateDetail = await discoverDomCollectionHref(
    page,
    "/admin/surveys",
    nonReservedDetailHrefPattern("/admin/surveys/templates"),
    /No survey templates/,
    "survey-template detail",
  );
  const emailEditor = await firstMatchingHref(page, "/admin/transactional-emails", /^\/admin\/transactional-emails\/[^/?#]+$/, "transactional-email editor");
  const publicCampaignCreateRoutes = await optionalHrefs(
    page,
    "/admin/assessments/public-campaigns",
    [new RegExp(`^${PUBLIC_CAMPAIGN_CREATE_ROUTE}$`)],
    "/api/admin/public-campaigns",
  );

  const optionalCampaignLinks = campaignDetail
    ? await optionalHrefs(page, campaignDetail, [
        /^\/assessments\/[^/]+\/report(?:[?#].*)?$/,
        /^\/assessments\/[^/]+\/respondents\/[^/]+\/report(?:[?#].*)?$/,
        /^\/portal\/assessments\/respondents\/[^/]+\/longitudinal(?:[?#].*)?$/,
      ])
    : [];
  const dynamicRoutes = [...new Set([
    ...workshopRoutes,
    ...coachRoutes,
    ...templateRoutes,
    ...[accessGroupDetail, campaignDetail, workflowDetail, surveyTemplateDetail]
      .filter((route): route is string => route !== null),
    emailEditor,
    ...publicCampaignCreateRoutes,
    ...optionalCampaignLinks,
  ])];

  for (const width of widths) {
    await page.setViewportSize({ width, height: width >= 1024 ? 900 : 844 });
    for (const route of dynamicRoutes) {
      await expectResponsiveRoute(page, {
        ...context(testInfo, route, width),
        ...(templateDetail !== null && route === templateDetail
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
