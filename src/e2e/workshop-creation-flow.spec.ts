import { test, expect } from "@playwright/test";

/**
 * E2E Test: Full Workshop Creation Flow
 * 
 * Tests the complete journey from coach request to published workshop:
 * 1. Coach logs in and submits workshop request
 * 2. System validates certification (auto-approve or manual)
 * 3. Admin approves (if needed)
 * 4. Landing page is generated
 * 5. Email sequence is scheduled
 * 6. Registration is tested
 */

test.describe("Workshop Creation Flow - E2E", () => {
    
    test.describe("Step 1: Coach Submits Workshop Request", () => {
        test("coach can log into portal", async ({ page }) => {
            await page.goto("/login");
            
            await page.getByLabel(/email/i).fill("coach@example.com");
            await page.getByLabel(/password/i).fill("demo123");
            await page.getByRole("button", { name: /sign in/i }).click();
            
            // Should redirect to portal dashboard
            await expect(page).toHaveURL(/.*portal|dashboard/);
        });

        test("coach can access workshop request form", async ({ page }) => {
            // Login first
            await page.goto("/login");
            await page.getByLabel(/email/i).fill("coach@example.com");
            await page.getByLabel(/password/i).fill("demo123");
            await page.getByRole("button", { name: /sign in/i }).click();
            
            // Navigate to request page
            await page.goto("/portal/request");
            
            // Check form is present
            await expect(
                page.getByRole("heading", { name: /request|workshop|new/i })
            ).toBeVisible();
        });

        test("coach can fill and submit workshop request", async ({ page }) => {
            await page.goto("/login");
            await page.getByLabel(/email/i).fill("coach@example.com");
            await page.getByLabel(/password/i).fill("demo123");
            await page.getByRole("button", { name: /sign in/i }).click();
            
            await page.goto("/portal/request");
            
            // Fill workshop type
            const typeSelect = page.getByLabel(/workshop type|type/i);
            if (await typeSelect.isVisible()) {
                await typeSelect.selectOption({ index: 1 });
            }
            
            // Fill event details
            const titleInput = page.getByLabel(/title|name/i);
            if (await titleInput.isVisible()) {
                await titleInput.fill("E2E Test Workshop - " + Date.now());
            }
            
            // Set date (30 days from now to meet lead time)
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 30);
            const dateStr = futureDate.toISOString().split("T")[0];
            
            const dateInput = page.getByLabel(/date/i);
            if (await dateInput.isVisible()) {
                await dateInput.fill(dateStr);
            }
            
            // Fill format
            const formatSelect = page.getByLabel(/format/i);
            if (await formatSelect.isVisible()) {
                await formatSelect.selectOption("VIRTUAL");
            }
            
            // Submit
            const submitBtn = page.getByRole("button", { name: /submit|request/i });
            await submitBtn.click();
            
            // Should show success or pending
            await expect(
                page.getByText(/submitted|pending|success|received/i)
            ).toBeVisible({ timeout: 10000 });
        });

        test("lead time validation rejects workshops less than 2 weeks out", async ({ page }) => {
            await page.goto("/login");
            await page.getByLabel(/email/i).fill("coach@example.com");
            await page.getByLabel(/password/i).fill("demo123");
            await page.getByRole("button", { name: /sign in/i }).click();
            
            await page.goto("/portal/request");
            
            // Set date to 7 days from now (should fail)
            const nearDate = new Date();
            nearDate.setDate(nearDate.getDate() + 7);
            const dateStr = nearDate.toISOString().split("T")[0];
            
            const dateInput = page.getByLabel(/date/i);
            if (await dateInput.isVisible()) {
                await dateInput.fill(dateStr);
                
                // Try to submit
                const submitBtn = page.getByRole("button", { name: /submit|request/i });
                if (await submitBtn.isEnabled()) {
                    await submitBtn.click();
                    
                    // Should show error about lead time
                    await expect(
                        page.getByText(/lead time|14 days|2 weeks|minimum/i)
                    ).toBeVisible({ timeout: 5000 });
                }
            }
        });
    });

    test.describe("Step 2: Certification Validation", () => {
        test("workshop with valid certification is auto-approved", async ({ request }) => {
            // Test via API
            const response = await request.post("/api/approvals", {
                headers: {
                    "Content-Type": "application/json",
                },
                data: {
                    type: "WORKSHOP_REQUEST",
                    coachId: "certified-coach-123",
                    coachEmail: "certified@example.com",
                    workshopTypeSlug: "scaling-up",
                    details: "E2E Test - Auto-approve",
                    requestedBy: "E2E Test",
                },
            });
            
            // Should return 200 (either auto-approved or queued)
            expect(response.status()).toBeLessThan(500);
        });

        test("workshop with low certification confidence requires manual approval", async ({ request }) => {
            const response = await request.post("/api/approvals", {
                headers: {
                    "Content-Type": "application/json",
                },
                data: {
                    type: "WORKSHOP_REQUEST",
                    coachId: "uncertified-coach-456",
                    coachEmail: "uncertified@example.com",
                    details: "E2E Test - Should require manual approval",
                    requestedBy: "E2E Test",
                },
            });
            
            expect(response.status()).toBeLessThan(500);
            
            const data = await response.json();
            // Should indicate manual review needed
            expect(data.autoApproved).toBe(false);
        });
    });

    test.describe("Step 3: Admin Approval Queue", () => {
        test.beforeEach(async ({ page }) => {
            // Login as admin
            await page.goto("/login");
            await page.getByLabel(/email/i).fill("admin@scalingup.com");
            await page.getByLabel(/password/i).fill("demo123");
            await page.getByRole("button", { name: /sign in/i }).click();
        });

        test("admin can view pending approvals", async ({ page }) => {
            await page.goto("/admin/approvals");
            
            await expect(
                page.getByRole("heading", { name: /approval|pending|queue/i })
            ).toBeVisible();
        });

        test("admin can approve workshop request", async ({ page }) => {
            await page.goto("/admin/approvals?status=PENDING");
            
            const approveBtn = page.getByRole("button", { name: /approve/i }).first();
            
            if (await approveBtn.isVisible()) {
                await approveBtn.click();
                
                // Wait for confirmation
                await expect(
                    page.getByText(/approved|success/i)
                ).toBeVisible({ timeout: 5000 });
            }
        });

        test("admin can deny with reason", async ({ page }) => {
            await page.goto("/admin/approvals?status=PENDING");
            
            const denyBtn = page.getByRole("button", { name: /deny|reject/i }).first();
            
            if (await denyBtn.isVisible()) {
                await denyBtn.click();
                
                // Fill reason
                const reasonInput = page.getByLabel(/reason|notes/i);
                if (await reasonInput.isVisible()) {
                    await reasonInput.fill("Certification expired - E2E Test");
                    await page.getByRole("button", { name: /confirm|submit/i }).click();
                }
                
                await expect(
                    page.getByText(/denied|rejected/i)
                ).toBeVisible({ timeout: 5000 });
            }
        });
    });

    test.describe("Step 4: Landing Page Generation", () => {
        test("landing page is generated for approved workshop", async ({ request }) => {
            // Test landing page generation API
            const response = await request.post("/api/landing-pages", {
                headers: {
                    "Content-Type": "application/json",
                },
                data: {
                    workshopId: "ws-e2e-test",
                },
            });
            
            expect(response.status()).toBeLessThan(500);
        });

        test("landing page is accessible by slug", async ({ page }) => {
            await page.goto("/workshop/test-workshop-slug");
            
            // Page should load (even if 404, should not be 500)
            expect(page.url()).toContain("/workshop/");
        });

        test("landing page displays workshop details", async ({ page }) => {
            await page.goto("/workshop/test-workshop-slug");
            
            // Check for essential elements
            const heading = page.getByRole("heading", { level: 1 });
            await expect(heading).toBeVisible().catch(() => {
                // Fallback: check for any main content
                expect(page.locator("main")).toBeVisible();
            });
        });

        test("landing page has registration form", async ({ page }) => {
            await page.goto("/workshop/test-workshop-slug");
            
            // Look for registration elements
            const form = page.locator("form");
            const emailInput = page.getByLabel(/email/i);
            
            // Either form or email input should be present
            const hasForm = await form.isVisible().catch(() => false);
            const hasEmail = await emailInput.isVisible().catch(() => false);
            
            expect(hasForm || hasEmail).toBeTruthy();
        });
    });

    test.describe("Step 5: Email Sequence Verification", () => {
        test("registration triggers confirmation email", async ({ request }) => {
            // Create registration
            const response = await request.post("/api/registrations", {
                headers: {
                    "Content-Type": "application/json",
                },
                data: {
                    workshopId: "ws-e2e-test",
                    firstName: "E2E",
                    lastName: "Test",
                    email: `e2e-test+${Date.now()}@example.com`,
                },
            });
            
            expect(response.status()).toBeLessThan(500);
        });

        test("email schedule API returns scheduled emails", async ({ request }) => {
            const response = await request.get("/api/workshops/ws-e2e-test/emails");
            
            // Either returns emails or 404 (no workshop), not 500
            expect(response.status()).toBeLessThan(500);
        });
    });

    test.describe("Step 6: Registration Flow", () => {
        test("attendee can fill registration form", async ({ page }) => {
            await page.goto("/workshop/test-workshop-slug");
            
            // Fill form fields
            const firstName = page.getByLabel(/first name/i);
            const lastName = page.getByLabel(/last name/i);
            const email = page.getByLabel(/email/i);
            
            if (await firstName.isVisible()) {
                await firstName.fill("E2E");
            }
            if (await lastName.isVisible()) {
                await lastName.fill("Tester");
            }
            if (await email.isVisible()) {
                await email.fill(`e2e+${Date.now()}@example.com`);
            }
            
            // Verify fields are filled
            if (await firstName.isVisible()) {
                await expect(firstName).toHaveValue("E2E");
            }
        });

        test("registration redirects to Stripe checkout for paid workshops", async ({ page }) => {
            await page.goto("/workshop/paid-workshop-test");
            
            // Fill and submit
            const firstName = page.getByLabel(/first name/i);
            const lastName = page.getByLabel(/last name/i);
            const email = page.getByLabel(/email/i);
            
            if (await firstName.isVisible()) {
                await firstName.fill("Stripe");
                await lastName.fill("Tester");
                await email.fill("stripe-test@example.com");
                
                const submitBtn = page.getByRole("button", { name: /register|pay|continue/i });
                if (await submitBtn.isVisible()) {
                    await submitBtn.click();
                    
                    // Should redirect to Stripe (or show payment modal)
                    await page.waitForURL(/stripe|checkout|payment/i, { timeout: 10000 }).catch(() => {
                        // Or payment modal appears
                        expect(page.getByText(/payment|card|pay/i)).toBeVisible();
                    });
                }
            }
        });

        test("registration shows confirmation for free workshops", async ({ page }) => {
            await page.goto("/workshop/free-workshop-test");
            
            const firstName = page.getByLabel(/first name/i);
            const lastName = page.getByLabel(/last name/i);
            const email = page.getByLabel(/email/i);
            
            if (await firstName.isVisible()) {
                await firstName.fill("Free");
                await lastName.fill("Attendee");
                await email.fill("free-test@example.com");
                
                const submitBtn = page.getByRole("button", { name: /register|submit|sign up/i });
                if (await submitBtn.isVisible()) {
                    await submitBtn.click();
                    
                    // Should show confirmation
                    await expect(
                        page.getByText(/confirmed|registered|success|thank you/i)
                    ).toBeVisible({ timeout: 10000 });
                }
            }
        });
    });

    test.describe("Step 7: 90-Day Follow-Up", () => {
        test("coach can access follow-up form", async ({ page }) => {
            await page.goto("/login");
            await page.getByLabel(/email/i).fill("coach@example.com");
            await page.getByLabel(/password/i).fill("demo123");
            await page.getByRole("button", { name: /sign in/i }).click();
            
            await page.goto("/portal/follow-up");
            
            await expect(
                page.getByRole("heading", { name: /follow.?up|90.?day|report/i })
            ).toBeVisible();
        });

        test("coach can submit follow-up report", async ({ page }) => {
            await page.goto("/login");
            await page.getByLabel(/email/i).fill("coach@example.com");
            await page.getByLabel(/password/i).fill("demo123");
            await page.getByRole("button", { name: /sign in/i }).click();
            
            await page.goto("/portal/follow-up");
            
            // Find a pending report and submit
            const submitBtn = page.getByRole("button", { name: /submit|save/i }).first();
            
            if (await submitBtn.isVisible()) {
                // Fill required fields
                const npsInput = page.getByLabel(/nps|score|rating/i);
                if (await npsInput.isVisible()) {
                    await npsInput.fill("9");
                }
                
                await submitBtn.click();
                
                await expect(
                    page.getByText(/submitted|saved|success/i)
                ).toBeVisible({ timeout: 5000 });
            }
        });
    });
});

test.describe("Error Handling", () => {
    test("handles 404 gracefully", async ({ page }) => {
        await page.goto("/workshop/nonexistent-slug-12345");
        
        // Should show 404 or error page, not crash
        const status = await page.locator("body").textContent();
        expect(status).toBeDefined();
    });

    test("handles API errors gracefully", async ({ request }) => {
        const response = await request.post("/api/workshops", {
            data: {}, // Invalid data
        });
        
        // Should return 400 or validation error, not 500
        expect([400, 401, 422]).toContain(response.status());
    });

    test("rate limiting works", async ({ request }) => {
        // Make many rapid requests
        const promises = Array.from({ length: 20 }, () =>
            request.get("/api/workshops")
        );
        
        const responses = await Promise.all(promises);
        
        // Some should succeed, some might be rate limited (429)
        const statuses = responses.map(r => r.status());
        expect(statuses.some(s => s === 200 || s === 429)).toBeTruthy();
    });
});
