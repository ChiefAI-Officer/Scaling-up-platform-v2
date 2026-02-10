import { expect, Page } from "@playwright/test";

interface LoginOptions {
  email: string;
  password: string;
  expectedUrl?: RegExp;
}

export async function loginAs(page: Page, options: LoginOptions): Promise<void> {
  await page.goto("/login");
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.getByLabel(/password/i)).toBeVisible();

  await page.getByLabel(/email/i).fill(options.email);
  await page.getByLabel(/password/i).fill(options.password);
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 10000 });

  if (options.expectedUrl) {
    await expect(page).toHaveURL(options.expectedUrl, { timeout: 10000 });
  }
}
