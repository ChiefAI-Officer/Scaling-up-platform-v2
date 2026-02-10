import { expect, test } from "@playwright/test";

test.describe("Auth Boundary Smoke", () => {
  test("redirects unauthenticated dashboard traffic to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("allows access to public registration success route", async ({ page }) => {
    await page.goto("/registration/success");
    await expect(page).not.toHaveURL(/\/login/);
  });
});
