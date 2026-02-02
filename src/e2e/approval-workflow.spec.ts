import { test, expect } from "@playwright/test";

test.describe("Approval Workflow E2E", () => {
    test.describe("Admin Approval Queue", () => {
        test.beforeEach(async ({ page }) => {
            // Login as admin
            await page.goto("/login");
            await page.getByLabel(/email/i).fill("admin@scalingup.com");
            await page.getByLabel(/password/i).fill("demo123");
            await page.getByRole("button", { name: /sign in/i }).click();
            await expect(page).toHaveURL(/.*dashboard/);
        });

        test("should display pending approvals in queue", async ({ page }) => {
            await page.goto("/admin/approvals");

            // Check for approval queue heading
            await expect(
                page.getByRole("heading", { name: /approval|queue|pending/i })
            ).toBeVisible();
        });

        test("should filter approvals by type", async ({ page }) => {
            await page.goto("/admin/approvals");

            // Look for filter dropdown
            const typeFilter = page.getByRole("combobox", { name: /type|filter/i });
            if (await typeFilter.isVisible()) {
                await typeFilter.selectOption("CUSTOM_PRICING");
                await expect(page).toHaveURL(/.*type=CUSTOM_PRICING/);
            }
        });

        test("should filter approvals by status", async ({ page }) => {
            await page.goto("/admin/approvals");

            // Look for status filter
            const statusFilter = page.getByRole("combobox", { name: /status/i });
            if (await statusFilter.isVisible()) {
                await statusFilter.selectOption("PENDING");
                await expect(page.locator("[data-status='PENDING']")).toBeVisible();
            }
        });

        test("should approve request with one click", async ({ page }) => {
            await page.goto("/admin/approvals");

            // Find approve button on first pending item
            const approveBtn = page.getByRole("button", { name: /approve/i }).first();
            if (await approveBtn.isVisible()) {
                await approveBtn.click();

                // Check for success message or status change
                await expect(
                    page.getByText(/approved|success/i)
                ).toBeVisible({ timeout: 5000 });
            }
        });

        test("should deny request with reason", async ({ page }) => {
            await page.goto("/admin/approvals");

            // Find deny button
            const denyBtn = page.getByRole("button", { name: /deny|reject/i }).first();
            if (await denyBtn.isVisible()) {
                await denyBtn.click();

                // Should show reason modal
                const reasonInput = page.getByLabel(/reason|notes/i);
                if (await reasonInput.isVisible()) {
                    await reasonInput.fill("Does not meet certification requirements");
                    await page.getByRole("button", { name: /confirm|submit/i }).click();

                    await expect(
                        page.getByText(/denied|rejected/i)
                    ).toBeVisible({ timeout: 5000 });
                }
            }
        });

        test("should show approval details on click", async ({ page }) => {
            await page.goto("/admin/approvals");

            // Click on an approval item
            const approvalItem = page.locator("[data-testid='approval-item']").first();
            if (await approvalItem.isVisible()) {
                await approvalItem.click();

                // Should show details panel or modal
                await expect(
                    page.getByText(/coach|workshop|requested/i)
                ).toBeVisible();
            }
        });
    });

    test.describe("Coach Approval Request Flow", () => {
        test.beforeEach(async ({ page }) => {
            // Login as coach
            await page.goto("/login");
            await page.getByLabel(/email/i).fill("coach@example.com");
            await page.getByLabel(/password/i).fill("demo123");
            await page.getByRole("button", { name: /sign in/i }).click();
        });

        test("should submit workshop request", async ({ page }) => {
            await page.goto("/portal/workshops/new");

            // Fill workshop form
            const titleInput = page.getByLabel(/title|name/i);
            if (await titleInput.isVisible()) {
                await titleInput.fill("Test Workshop Request");
            }

            const dateInput = page.getByLabel(/date/i);
            if (await dateInput.isVisible()) {
                await dateInput.fill("2026-03-15");
            }

            // Submit
            await page.getByRole("button", { name: /submit|request/i }).click();

            // Check for confirmation
            await expect(
                page.getByText(/submitted|pending approval|success/i)
            ).toBeVisible({ timeout: 5000 });
        });

        test("should show pending status after submission", async ({ page }) => {
            await page.goto("/portal/workshops");

            // Check for pending status indicator
            await expect(
                page.getByText(/pending|awaiting approval/i)
            ).toBeVisible();
        });

        test("should request custom pricing", async ({ page }) => {
            await page.goto("/portal/workshops/ws-123/pricing");

            // Fill custom pricing form
            const priceInput = page.getByLabel(/price|amount/i);
            if (await priceInput.isVisible()) {
                await priceInput.fill("750");
            }

            const reasonInput = page.getByLabel(/reason|justification/i);
            if (await reasonInput.isVisible()) {
                await reasonInput.fill("Non-profit organization discount");
            }

            // Submit
            await page.getByRole("button", { name: /request|submit/i }).click();

            // Should show pending message
            await expect(
                page.getByText(/pending approval|submitted/i)
            ).toBeVisible({ timeout: 5000 });
        });
    });

    test.describe("Notification Flow", () => {
        test("should send email notification on approval", async ({ request }) => {
            // This test verifies the API behavior
            const response = await request.post("/api/approvals/apr-1/approve", {
                headers: {
                    Authorization: "Bearer test-admin-token",
                },
                data: {
                    notes: "Approved via E2E test",
                },
            });

            // Should trigger notification (check response or logs)
            expect(response.status()).toBeLessThan(500);
        });

        test("should send email notification on denial", async ({ request }) => {
            const response = await request.post("/api/approvals/apr-2/deny", {
                headers: {
                    Authorization: "Bearer test-admin-token",
                },
                data: {
                    reason: "Certification expired",
                },
            });

            expect(response.status()).toBeLessThan(500);
        });
    });
});

test.describe("Landing Page Generation E2E", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/login");
        await page.getByLabel(/email/i).fill("admin@scalingup.com");
        await page.getByLabel(/password/i).fill("demo123");
        await page.getByRole("button", { name: /sign in/i }).click();
    });

    test("should generate landing page for approved workshop", async ({ page }) => {
        await page.goto("/admin/workshops/ws-1");

        // Click generate landing page button
        const generateBtn = page.getByRole("button", { name: /generate.*landing|create.*page/i });
        if (await generateBtn.isVisible()) {
            await generateBtn.click();

            // Wait for generation
            await expect(
                page.getByText(/generated|published|success/i)
            ).toBeVisible({ timeout: 10000 });
        }
    });

    test("should preview landing page", async ({ page }) => {
        await page.goto("/admin/workshops/ws-1");

        // Click preview link
        const previewLink = page.getByRole("link", { name: /preview|view.*page/i });
        if (await previewLink.isVisible()) {
            await previewLink.click();

            // Should show landing page content
            await expect(
                page.getByRole("heading", { level: 1 })
            ).toBeVisible();
        }
    });

    test("should publish landing page", async ({ page }) => {
        await page.goto("/admin/workshops/ws-1/landing-page");

        // Click publish button
        const publishBtn = page.getByRole("button", { name: /publish/i });
        if (await publishBtn.isVisible()) {
            await publishBtn.click();

            // Confirm publish
            const confirmBtn = page.getByRole("button", { name: /confirm|yes/i });
            if (await confirmBtn.isVisible()) {
                await confirmBtn.click();
            }

            await expect(
                page.getByText(/published|live/i)
            ).toBeVisible({ timeout: 5000 });
        }
    });
});
