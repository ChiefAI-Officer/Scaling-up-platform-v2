import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { expectResponsiveRoute, firstMatchingHref } from "./helpers/overflow";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "admin@scalingup.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "demo123";
const COACH_EMAIL = process.env.E2E_COACH_EMAIL || "coach@example.com";
const COACH_PASSWORD = process.env.E2E_COACH_PASSWORD || "demo123";

test.setTimeout(180_000);

async function loginCoach(page: Page): Promise<void> {
  await loginAs(page, { email: COACH_EMAIL, password: COACH_PASSWORD, expectedUrl: /\/portal\// });
}

async function loginAdmin(page: Page): Promise<void> {
  await loginAs(page, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, expectedUrl: /\/admin|\/dashboard/ });
}

test.describe("authenticated state survives responsive presentation changes", () => {
  test("workshop search, filter, and result count survive compact-medium-compact resize", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginCoach(page);
    await expectResponsiveRoute(page, { role: "coach", route: "/portal/workshops", project: test.info().project.name, width: 390 });

    const search = page.getByPlaceholder("Search workshops...");
    await search.fill("a");
    await page.getByRole("button", { name: /filters/i }).click();
    const status = page.getByRole("combobox", { name: /status/i });
    await status.selectOption({ index: 1 });
    const count = page.getByText(/^Showing \d+ of \d+ workshops$/);
    const initialCount = await count.textContent();

    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(search).toHaveValue("a");
    await expect(status).not.toHaveValue("");
    await expect(count).toHaveText(initialCount ?? "");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(search).toHaveValue("a");
    await expect(status).not.toHaveValue("");
    await expect(count).toHaveText(initialCount ?? "");
  });

  test("selected organization and loaded member remain without another fetch", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginCoach(page);
    let respondentFetches = 0;
    page.on("request", (request) => {
      if (/\/api\/organizations\/[^/]+\/respondents(?:\?|$)/.test(request.url())) respondentFetches += 1;
    });
    await expectResponsiveRoute(page, { role: "coach", route: "/portal/members", project: test.info().project.name, width: 390 });

    const availableOrganization = page.locator('[data-testid="members-browse-panel"] button[aria-pressed]').first();
    await expect(availableOrganization, "the coach fixture must expose a populated organization").toBeVisible();
    const selectedOrganizationName = await availableOrganization.getAttribute("aria-label");
    expect(selectedOrganizationName, "the organization selector needs an accessible identity").toBeTruthy();
    const organization = page.getByRole("button", { name: selectedOrganizationName!, exact: true });
    await organization.click();
    await expect(organization).toHaveAttribute("aria-pressed", "true");
    const detail = page.getByTestId("members-detail-panel");
    await expect(detail).toBeVisible();
    await expect(detail.getByRole("heading", { name: selectedOrganizationName! })).toBeVisible();
    const selectedMember = detail.locator('[data-testid^="member-row-"]').first();
    await expect(selectedMember, "the selected fixture organization must expose a member").toBeVisible();
    const selectedMemberTestId = await selectedMember.getAttribute("data-testid");
    expect(selectedMemberTestId, "the selected member needs a stable rendered identity").toMatch(/^member-row-/);
    const loadedMember = (await selectedMember.textContent())?.trim();
    expect(loadedMember, "the selected member needs visible detail content").toBeTruthy();
    const fetchCount = respondentFetches;

    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(organization).toHaveAttribute("aria-pressed", "true");
    await expect(detail).toBeVisible();
    await expect(detail.getByRole("heading", { name: selectedOrganizationName! })).toBeVisible();
    await expect(page.getByTestId(selectedMemberTestId!)).toBeVisible();
    await expect(page.getByTestId(selectedMemberTestId!)).toContainText(loadedMember!);
    expect(respondentFetches, "medium resize must not reload the selected member domain").toBe(fetchCount);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(organization).toHaveAttribute("aria-pressed", "true");
    await expect(detail).toBeVisible();
    await expect(detail.getByRole("heading", { name: selectedOrganizationName! })).toBeVisible();
    await expect(page.getByTestId(selectedMemberTestId!)).toBeVisible();
    await expect(page.getByTestId(selectedMemberTestId!)).toContainText(loadedMember!);
    expect(respondentFetches, "resizing must not reload the selected member domain").toBe(fetchCount);
  });

  test("campaign wizard organization and template survive rotation with the same step", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginCoach(page);
    await expectResponsiveRoute(page, { role: "coach", route: "/portal/assessments/new", project: test.info().project.name, width: 390 });

    const organization = page.locator('input[name="org"]').first();
    await expect(organization, "the coach fixture must expose an organization choice").toBeVisible();
    const organizationId = await organization.getAttribute("value");
    await organization.check();
    await page.getByRole("button", { name: /^next/i }).click();
    const template = page.locator('input[name="template"]').first();
    await expect(template, "the coach fixture must expose an accessible assessment template").toBeVisible();
    const templateId = await template.getAttribute("value");
    await template.check();
    const stepSummary = page.getByTestId("campaign-step-summary");
    await expect(stepSummary).toContainText(/Step 2 of \d+/);

    await page.setViewportSize({ width: 844, height: 390 });
    await expect(stepSummary).toContainText(/Step 2 of \d+/);
    await expect(page.locator(`input[name="template"][value="${templateId}"]`)).toBeChecked();
    await page.getByRole("button", { name: /^back/i }).click();
    await expect(page.locator(`input[name="org"][value="${organizationId}"]`)).toBeChecked();
    await page.getByRole("button", { name: /^next/i }).click();
    await expect(page.locator(`input[name="template"][value="${templateId}"]`)).toBeChecked();
    await expect(page.getByText(/^Template$/, { exact: true })).toBeVisible();
  });

  test("mobile navigation and action menus restore keyboard focus", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginCoach(page);
    await expectResponsiveRoute(page, { role: "coach", route: "/portal/home", project: test.info().project.name, width: 390 });
    const coachNav = page.locator('header button[aria-label="Open menu"]');
    await coachNav.focus();
    await page.keyboard.press("Enter");
    await expect(coachNav).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("coach-mobile-nav-backdrop")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(coachNav).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("coach-mobile-nav-backdrop")).toBeHidden();
    await expect(coachNav).toBeFocused();

    const campaignDetail = await firstMatchingHref(page, "/portal/assessments", /^\/portal\/assessments\/[^/?#]+$/, "coach campaign detail");
    await expectResponsiveRoute(page, { role: "coach", route: campaignDetail, project: test.info().project.name, width: 390 });
    const actions = page.getByRole("button", { name: "More campaign actions" });
    await actions.focus();
    await page.keyboard.press("Enter");
    await expect(actions).toHaveAttribute("aria-expanded", "true");
    const actionMenu = page.getByRole("menu");
    await expect(actionMenu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(actions).toHaveAttribute("aria-expanded", "false");
    await expect(actionMenu).toBeHidden();
    await expect(actions).toBeFocused();

    await page.context().clearCookies();
    await loginAdmin(page);
    await expectResponsiveRoute(page, { role: "admin", route: "/admin/dashboard", project: test.info().project.name, width: 390 });
    const adminNav = page.locator('nav button[aria-label="Open menu"]');
    await adminNav.focus();
    await page.keyboard.press("Enter");
    await expect(adminNav).toHaveAttribute("aria-expanded", "true");
    const adminOverlay = adminNav.locator("xpath=following-sibling::div[1]");
    await expect(adminOverlay).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(adminNav).toHaveAttribute("aria-expanded", "false");
    await expect(adminOverlay).toBeHidden();
    await expect(adminNav).toBeFocused();
  });

  test("validation and retryable-failure state survive resize", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginCoach(page);
    await expectResponsiveRoute(page, { role: "coach", route: "/portal/members", project: test.info().project.name, width: 390 });
    const organization = page.locator('[data-testid="members-browse-panel"] button[aria-pressed]').first();
    await organization.click();

    await page.getByRole("button", { name: "Add Member" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Member" });
    await dialog.getByRole("button", { name: "Add member" }).click();
    await expect(dialog.getByRole("alert", { name: "Add member error summary" })).toContainText("First name is required");
    await dialog.getByLabel("First name *").fill("Responsive");
    await dialog.getByLabel("Last name *").fill("Fixture");
    await dialog.getByLabel("E-mail *").fill("responsive.fixture@example.test");

    await page.route(/\/api\/organizations\/[^/]+\/respondents$/, async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ success: false, error: "Temporary fixture failure" }) });
        return;
      }
      await route.continue();
    });
    await dialog.getByRole("button", { name: "Add member" }).click();
    await expect(dialog.getByRole("alert", { name: "Add member error summary" })).toContainText("Temporary fixture failure");
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(dialog.getByLabel("First name *")).toHaveValue("Responsive");
    await expect(dialog.getByLabel("Last name *")).toHaveValue("Fixture");
    await expect(dialog.getByLabel("E-mail *")).toHaveValue("responsive.fixture@example.test");
    await expect(dialog.getByRole("alert", { name: "Add member error summary" })).toContainText("Temporary fixture failure");
  });
});
