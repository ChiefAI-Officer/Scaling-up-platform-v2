import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/auth";

test.describe("Workshop Creation & Registration Flow", () => {
  test("coach can log into portal", async ({ page }) => {
    await loginAs(page, {
      email: "coach@example.com",
      password: "demo123",
      expectedUrl: /\/portal\/home/,
    });
  });

  test("coach can access workshop request form", async ({ page }) => {
    await loginAs(page, {
      email: "coach@example.com",
      password: "demo123",
      expectedUrl: /\/portal\/home/,
    });

    await page.goto("/portal/request");
    await expect(page.getByRole("heading", { name: /request new workshop/i })).toBeVisible();
    await expect(page.getByText(/workshop details/i).first()).toBeVisible();
  });

  test("admin can view approval queue", async ({ page }) => {
    await loginAs(page, {
      email: "admin@scalingup.com",
      password: "demo123",
      expectedUrl: /\/dashboard/,
    });

    await page.goto("/admin/approvals");
    await expect(page.getByRole("heading", { name: /approval queue/i })).toBeVisible();
  });

  test("coach can access follow-up form", async ({ page }) => {
    await loginAs(page, {
      email: "coach@example.com",
      password: "demo123",
      expectedUrl: /\/portal\/home/,
    });

    await page.goto("/portal/follow-up");
    await expect(page.getByRole("heading", { name: /90-day follow-up report/i })).toBeVisible();
  });
});

test.describe("Public Landing & Registration", () => {
  test("landing page is accessible by slug", async ({ page }) => {
    await page.goto("/workshop/ai-workshop-chicago-march-2025");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("landing page has registration form", async ({ page }) => {
    await page.goto("/workshop/ai-workshop-chicago-march-2025");
    await expect(page.getByLabel(/first name/i)).toBeVisible();
    await expect(page.getByLabel(/last name/i)).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });

  test("free workshop registration returns non-500", async ({ page }) => {
    await page.goto("/workshop/virtual-ai-intro-feb-2025");
    await page.getByLabel(/first name/i).fill("E2E");
    await page.getByLabel(/last name/i).fill("Tester");
    await page.getByLabel(/email/i).fill(`e2e-${Date.now()}@example.com`);

    const registrationResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/registrations") &&
        response.request().method() === "POST"
    );

    await page.getByRole("button", { name: /register now/i }).click();
    const response = await registrationResponse;

    expect(response.status()).toBeLessThan(500);
  });
});

test.describe("API Error Handling", () => {
  test("approval creation handles malformed payload without 500", async ({ request }) => {
    const response = await request.post("/api/approvals", {
      data: { type: "INVALID_TYPE" },
    });

    expect(response.status()).toBeLessThan(500);
  });

  test("workshop creation API rejects invalid payload gracefully", async ({ request }) => {
    const response = await request.post("/api/workshops", {
      data: {},
    });

    expect(response.status()).toBeLessThan(500);
    expect(response.status()).not.toBe(200);
  });

  test("handles 404 slug gracefully", async ({ page }) => {
    await page.goto("/workshop/nonexistent-slug-12345");
    await expect(page.locator("body")).toBeVisible();
  });
});
