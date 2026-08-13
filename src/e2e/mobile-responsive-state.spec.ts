import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { firstMatchingHref } from "./helpers/overflow";

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
    await page.goto("/portal/workshops");

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
    await page.goto("/portal/members");

    const organization = page.locator('[data-testid="members-browse-panel"] button[aria-pressed]').first();
    await expect(organization, "the coach fixture must expose a populated organization").toBeVisible();
    const organizationName = await organization.getAttribute("aria-label");
    await organization.click();
    const detail = page.getByTestId("members-detail-panel");
    await expect(detail).toContainText(organizationName ?? "");
    await expect(detail.locator('[data-testid^="member-row-"]').first(), "the selected fixture organization must expose a member").toBeVisible();
    const loadedMember = await detail.locator('[data-testid^="member-row-"]').first().textContent();
    const fetchCount = respondentFetches;

    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(detail).toContainText(organizationName ?? "");
    await expect(detail).toContainText(loadedMember?.trim() ?? "");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(detail).toContainText(loadedMember?.trim() ?? "");
    expect(respondentFetches, "resizing must not reload the selected member domain").toBe(fetchCount);
  });

  test("campaign wizard organization and template survive rotation with the same step", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginCoach(page);
    await page.goto("/portal/assessments/new");

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
    await page.goto("/portal/home");
    const coachNav = page.locator('header button[aria-label="Open menu"]');
    await coachNav.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await expect(coachNav).toBeFocused();

    const campaignDetail = await firstMatchingHref(page, "/portal/assessments", /^\/portal\/assessments\/[^/?#]+$/, "coach campaign detail");
    await page.goto(campaignDetail);
    const actions = page.getByRole("button", { name: "More campaign actions" });
    await actions.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(actions).toBeFocused();

    await page.context().clearCookies();
    await loginAdmin(page);
    await page.goto("/admin/dashboard");
    const adminNav = page.locator('nav button[aria-label="Open menu"]');
    await adminNav.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await expect(adminNav).toBeFocused();
  });

  test("validation and retryable-failure state survive resize", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginCoach(page);
    await page.goto("/portal/members");
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
