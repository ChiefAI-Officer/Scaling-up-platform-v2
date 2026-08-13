import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { assertNoDocumentOverflow } from "./helpers/overflow";
import { assertMinimumTouchTargets } from "./helpers/touch-targets";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@scalingup.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "demo123";

test.setTimeout(120_000);

const remainingAdminRoutes = [
  "/dashboard",
  "/coaches",
  "/coaches/new",
  "/contacts",
  "/partners",
  "/templates",
  "/templates/new",
  "/bio",
  "/admin/approvals",
  "/admin/categories",
  "/admin/pricing",
  "/admin/financials",
  "/admin/refunds-needed",
  "/admin/registrations",
  "/admin/settings",
  "/admin/surveys",
  "/admin/surveys/aggregate",
  "/admin/transactional-emails",
  "/surveys",
  "/admin/workflows",
];

const discoveredAdminRoutes = [
  { source: "/coaches", selector: 'a[href^="/coaches/"]:not([href="/coaches/new"])', label: "coach detail" },
  { source: "/bio", selector: 'a[href^="/bio/"]', label: "bio detail" },
  { source: "/templates", selector: 'a[href^="/templates/"][href$="/edit"]', label: "template edit" },
  { source: "/admin/workflows", selector: 'a[href^="/admin/workflows/"]:not([href="/admin/workflows/new"])', label: "workflow detail" },
  { source: "/admin/transactional-emails", selector: 'a[href^="/admin/transactional-emails/"]', label: "transactional email editor" },
];

const assessmentAdminRoutes = [
  "/admin/assessments",
  "/admin/assessments/access-groups",
  "/admin/assessments/aggregate",
  "/admin/assessments/campaigns",
  "/admin/assessments/import",
  "/admin/assessments/observability",
  "/admin/assessments/organizations",
  "/admin/assessments/public-campaigns",
  "/admin/assessments/templates",
  "/admin/assessments/templates/new",
];

const discoveredAssessmentRoutes = [
  {
    source: "/admin/assessments/access-groups",
    selector: 'a[href^="/admin/assessments/access-groups/"]',
    label: "assessment access-group detail",
  },
  {
    source: "/admin/assessments/campaigns",
    selector: 'a[href^="/admin/assessments/campaigns/"]',
    label: "assessment campaign detail",
  },
  {
    source: "/admin/assessments/templates",
    selector: 'a[href^="/admin/assessments/templates/"]',
    label: "assessment template detail",
  },
];

for (const width of [320, 390, 640, 768, 1023]) {
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
      await assertMinimumTouchTargets(page, `${route} at ${width}`);
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
    await assertMinimumTouchTargets(page, `${detailHref} at ${width}`);
    await expect(page.getByRole("region", { name: "Workshop registrations" })).toBeVisible();
  });
}

for (const width of [320, 390, 640, 768, 1023]) {
  test(`assessment workspace routes fit a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await loginAs(page, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      expectedUrl: /\/admin|\/dashboard/,
    });

    for (const route of assessmentAdminRoutes) {
      await page.goto(route);
      await expect(page.locator("body")).toHaveAttribute(
        "data-mobile-responsive",
        "on",
      );
      await assertNoDocumentOverflow(page, `${route} at ${width}`);
      await assertMinimumTouchTargets(page, `${route} at ${width}`);
    }

    for (const discovered of discoveredAssessmentRoutes) {
      await page.goto(discovered.source);
      const link = page.locator(discovered.selector).first();
      await expect(
        link,
        `the admin fixture must include a populated ${discovered.label} link`,
      ).toBeVisible();
      const href = await link.getAttribute("href");
      expect(href, `${discovered.label} link href`).toBeTruthy();

      await page.goto(href!);
      await assertNoDocumentOverflow(page, `${href} at ${width}`);
      await assertMinimumTouchTargets(page, `${href} at ${width}`);

      if (discovered.label === "assessment template detail") {
        await expect(page).toHaveURL(
          /\/admin\/assessments\/templates\/[^/]+\/versions\/[^/]+\/edit/,
        );
        await assertNoDocumentOverflow(page, `template version editor at ${width}`);
        await assertMinimumTouchTargets(page, `template version editor at ${width}`);
      }
    }
  });
}

for (const width of [320, 390, 640, 768, 1023]) {
  test(`remaining admin collections fit a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await loginAs(page, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      expectedUrl: /\/admin|\/dashboard/,
    });

    for (const route of remainingAdminRoutes) {
      await page.goto(route);
      await expect(page.locator("body")).toHaveAttribute("data-mobile-responsive", "on");
      await assertNoDocumentOverflow(page, `${route} at ${width}`);
      await assertMinimumTouchTargets(page, `${route} at ${width}`);
    }

    for (const discovered of discoveredAdminRoutes) {
      await page.goto(discovered.source);
      const link = page.locator(discovered.selector).first();
      await expect(
        link,
        `the admin fixture must include a populated ${discovered.label} link`,
      ).toBeVisible();
      const href = await link.getAttribute("href");
      expect(href, `${discovered.label} link href`).toBeTruthy();

      await page.goto(href!);
      await assertNoDocumentOverflow(page, `${href} at ${width}`);
      await assertMinimumTouchTargets(page, `${href} at ${width}`);

      if (discovered.label === "coach detail") {
        const editLink = page.locator('a[href^="/coaches/"][href$="/edit"]').first();
        await expect(editLink, "the coach detail must expose its edit route").toBeVisible();
        const editHref = await editLink.getAttribute("href");
        expect(editHref, "coach edit link href").toBeTruthy();
        await page.goto(editHref!);
        await assertNoDocumentOverflow(page, `${editHref} at ${width}`);
        await assertMinimumTouchTargets(page, `${editHref} at ${width}`);
      }
    }
  });
}
