/**
 * Unit Tests: Lead Time Validator
 * Tests the 2-week minimum lead time and date change validation.
 */

import {
    validateLeadTime,
    validateDateChange,
    MINIMUM_LEAD_TIME_DAYS,
} from "@/lib/lead-time-validator";

describe("Lead Time Validator", () => {
    describe("validateLeadTime", () => {
        it("should return valid for events 14+ days in the future", () => {
            const referenceDate = new Date("2026-01-15");
            const eventDate = new Date("2026-01-30"); // 15 days later

            const result = validateLeadTime(eventDate, referenceDate);

            expect(result.valid).toBe(true);
            expect(result.leadTimeDays).toBe(15);
            expect(result.requiresApproval).toBe(false);
        });

        it("should return invalid for events less than 14 days out", () => {
            const referenceDate = new Date("2026-01-15");
            const eventDate = new Date("2026-01-25"); // 10 days later

            const result = validateLeadTime(eventDate, referenceDate);

            expect(result.valid).toBe(false);
            expect(result.leadTimeDays).toBe(10);
            expect(result.requiresApproval).toBe(true);
            expect(result.reason).toContain("Minimum lead time");
        });

        it("should return invalid for past dates", () => {
            const referenceDate = new Date("2026-01-15");
            const eventDate = new Date("2026-01-10"); // 5 days ago

            const result = validateLeadTime(eventDate, referenceDate);

            expect(result.valid).toBe(false);
            expect(result.leadTimeDays).toBeLessThan(0);
            expect(result.reason).toContain("cannot be in the past");
        });

        it("should handle exactly 14 days lead time as valid", () => {
            const referenceDate = new Date("2026-01-15");
            const eventDate = new Date("2026-01-29"); // exactly 14 days

            const result = validateLeadTime(eventDate, referenceDate);

            expect(result.valid).toBe(true);
            expect(result.leadTimeDays).toBe(14);
        });

        it("should use current date when referenceDate not provided", () => {
            const eventDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

            const result = validateLeadTime(eventDate);

            expect(result.valid).toBe(true);
            expect(result.leadTimeDays).toBeGreaterThanOrEqual(29);
        });
    });

    describe("validateDateChange", () => {
        it("should require approval when changing date within 2 weeks of original event", () => {
            const referenceDate = new Date("2026-01-15");
            const currentDate = new Date("2026-01-20"); // 5 days from now (original)
            const newDate = new Date("2026-02-15"); // Good new date

            const result = validateDateChange(currentDate, newDate, referenceDate);

            expect(result.requiresApproval).toBe(true);
            expect(result.reason).toContain("requires admin approval");
        });

        it("should allow changes when original event is 14+ days away", () => {
            const referenceDate = new Date("2026-01-15");
            const currentDate = new Date("2026-02-01"); // 17 days from now (original)
            const newDate = new Date("2026-02-15"); // New date

            const result = validateDateChange(currentDate, newDate, referenceDate);

            expect(result.valid).toBe(true);
            // Since new date is valid and original is far enough, no approval needed
        });

        it("should reject if new date is in the past", () => {
            const referenceDate = new Date("2026-01-15");
            const currentDate = new Date("2026-02-01");
            const newDate = new Date("2026-01-10"); // Past date

            const result = validateDateChange(currentDate, newDate, referenceDate);

            expect(result.valid).toBe(false);
            expect(result.reason).toContain("cannot be in the past");
        });
    });

    describe("MINIMUM_LEAD_TIME_DAYS constant", () => {
        it("should be 14 days", () => {
            expect(MINIMUM_LEAD_TIME_DAYS).toBe(14);
        });
    });
});
