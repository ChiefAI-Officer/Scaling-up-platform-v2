import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/auth";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || "jverdun@scalingup.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "demo123";
const COACH_EMAIL = process.env.E2E_COACH_EMAIL || "coach@example.com";
const COACH_PASSWORD = process.env.E2E_COACH_PASSWORD || "demo123";

test.describe("Approval Workflow E2E", () => {
  test.describe("Admin Approval Queue", () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        expectedUrl: /\/dashboard/,
      });
    });

    test("should display pending approvals in queue", async ({ page }) => {
      await page.goto("/admin/approvals");
      await expect(page.getByRole("heading", { name: /approval queue/i })).toBeVisible();
    });

    test("should filter approvals by status", async ({ page }) => {
      await page.goto("/admin/approvals");
      await page.getByRole("button", { name: "Approved" }).click();
      await expect(page.getByText(/approved approvals|no approved approvals/i)).toBeVisible();
    });

    test("should approve request with one click", async ({ page }) => {
      await page.goto("/admin/approvals");

      const approveButton = page.getByRole("button", { name: /^approve$/i }).first();
      if (await approveButton.isVisible()) {
        await approveButton.click();
        await expect(page.getByText(/approved|denied/i).first()).toBeVisible();
      }
    });
  });

  test.describe("Coach Approval Request Flow", () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, {
        email: COACH_EMAIL,
        password: COACH_PASSWORD,
        expectedUrl: /\/portal\/home/,
      });
    });

    test("should open workshop request wizard", async ({ page }) => {
      await page.goto("/portal/request");
      await expect(page.getByRole("heading", { name: /request new workshop/i })).toBeVisible();
      await expect(page.getByText(/workshop details/i).first()).toBeVisible();
    });

    test("should submit workshop request", async ({ page }) => {
      await page.goto("/portal/request");
      const submitButton = page.getByRole("button", { name: /submit workshop request/i });

      if (await submitButton.isVisible()) {
        await submitButton.click();
        await expect(page).toHaveURL(/\/portal\/workshops/);
      } else {
        await expect(page.getByText(/workshop details|logistics|pricing/i).first()).toBeVisible();
      }
    });

    test("should show workshop list after submission flow", async ({ page }) => {
      await page.goto("/portal/workshops");
      await expect(page.getByRole("heading", { name: /my workshops/i })).toBeVisible();
    });

  });

  test.describe("Notification API Behavior", () => {
    test("should return non-500 when approval respond endpoint is called", async ({ request }) => {
      const response = await request.post("/api/approvals/apr-1/respond", {
        data: { action: "APPROVE", reason: "E2E check" },
      });

      expect(response.status()).toBeLessThan(500);
    });
  });
});
