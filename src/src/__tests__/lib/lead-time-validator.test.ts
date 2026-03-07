/**
 * Unit Tests: Lead Time Validator
 * Tests the March 60/90-day scheduling policy and 14-day date-change window.
 */

import {
    validateLeadTime,
    validateDateChange,
    DATE_CHANGE_APPROVAL_WINDOW_DAYS,
    VIRTUAL_WORKSHOP_LEAD_TIME_DAYS,
    IN_PERSON_WORKSHOP_LEAD_TIME_DAYS,
    HYBRID_WORKSHOP_LEAD_TIME_DAYS,
    MINIMUM_LEAD_TIME_DAYS,
} from "@/lib/lead-time-validator";

describe("Lead Time Validator", () => {
    describe("validateLeadTime", () => {
        it("returns valid for virtual events scheduled 60+ days out", () => {
            const referenceDate = new Date("2026-01-15");
            const eventDate = new Date("2026-03-16"); // 60 days later

            const result = validateLeadTime(eventDate, "VIRTUAL", referenceDate);

            expect(result.valid).toBe(true);
            expect(result.leadTimeDays).toBe(60);
            expect(result.requiredLeadTimeDays).toBe(
                VIRTUAL_WORKSHOP_LEAD_TIME_DAYS
            );
            expect(result.requiresApproval).toBe(false);
        });

        it("returns invalid for virtual events scheduled less than 60 days out", () => {
            const referenceDate = new Date("2026-01-15");
            const eventDate = new Date("2026-03-14"); // 58 days later

            const result = validateLeadTime(eventDate, "VIRTUAL", referenceDate);

            expect(result.valid).toBe(false);
            expect(result.leadTimeDays).toBe(58);
            expect(result.requiredLeadTimeDays).toBe(
                VIRTUAL_WORKSHOP_LEAD_TIME_DAYS
            );
            expect(result.requiresApproval).toBe(true);
            expect(result.reason).toContain("60 days");
        });

        it("returns valid for in-person events scheduled 90+ days out", () => {
            const referenceDate = new Date("2026-01-15");
            const eventDate = new Date("2026-04-15"); // 90 days later

            const result = validateLeadTime(eventDate, "IN_PERSON", referenceDate);

            expect(result.valid).toBe(true);
            expect(result.leadTimeDays).toBe(90);
            expect(result.requiredLeadTimeDays).toBe(
                IN_PERSON_WORKSHOP_LEAD_TIME_DAYS
            );
        });

        it("returns invalid for in-person events scheduled less than 90 days out", () => {
            const referenceDate = new Date("2026-01-15");
            const eventDate = new Date("2026-04-13"); // 88 days later

            const result = validateLeadTime(eventDate, "IN_PERSON", referenceDate);

            expect(result.valid).toBe(false);
            expect(result.leadTimeDays).toBe(88);
            expect(result.requiredLeadTimeDays).toBe(
                IN_PERSON_WORKSHOP_LEAD_TIME_DAYS
            );
            expect(result.reason).toContain("90 days");
        });

        it("uses the 90-day rule for hybrid workshops", () => {
            const referenceDate = new Date("2026-01-15");
            const eventDate = new Date("2026-04-15"); // 90 days later

            const result = validateLeadTime(eventDate, "HYBRID", referenceDate);

            expect(result.valid).toBe(true);
            expect(result.requiredLeadTimeDays).toBe(
                HYBRID_WORKSHOP_LEAD_TIME_DAYS
            );
        });

        it("returns invalid for past dates", () => {
            const referenceDate = new Date("2026-01-15");
            const eventDate = new Date("2026-01-10"); // 5 days ago

            const result = validateLeadTime(eventDate, "IN_PERSON", referenceDate);

            expect(result.valid).toBe(false);
            expect(result.leadTimeDays).toBeLessThan(0);
            expect(result.reason).toContain("cannot be in the past");
        });

        it("uses current date when referenceDate not provided", () => {
            const eventDate = new Date(
                Date.now() + 95 * 24 * 60 * 60 * 1000
            );

            const result = validateLeadTime(eventDate, "IN_PERSON");

            expect(result.valid).toBe(true);
            expect(result.leadTimeDays).toBeGreaterThanOrEqual(94);
        });
    });

    describe("validateDateChange", () => {
        it("requires approval when changing date within 14 days of the original event", () => {
            const referenceDate = new Date("2026-01-15");
            const currentDate = new Date("2026-01-20"); // 5 days from now (original)
            const newDate = new Date("2026-04-20"); // Good new date for in-person

            const result = validateDateChange(
                currentDate,
                newDate,
                "IN_PERSON",
                referenceDate
            );

            expect(result.requiresApproval).toBe(true);
            expect(result.reason).toContain("requires admin approval");
        });

        it("allows changes when original event is outside the approval window and new date satisfies lead time", () => {
            const referenceDate = new Date("2026-01-15");
            const currentDate = new Date("2026-02-20");
            const newDate = new Date("2026-04-20");

            const result = validateDateChange(
                currentDate,
                newDate,
                "IN_PERSON",
                referenceDate
            );

            expect(result.valid).toBe(true);
            expect(result.requiresApproval).toBe(false);
        });

        it("rejects if the new date does not satisfy the format lead-time rule", () => {
            const referenceDate = new Date("2026-01-15");
            const currentDate = new Date("2026-03-01");
            const newDate = new Date("2026-03-10");

            const result = validateDateChange(
                currentDate,
                newDate,
                "VIRTUAL",
                referenceDate
            );

            expect(result.valid).toBe(false);
            expect(result.requiresApproval).toBe(true);
            expect(result.reason).toContain("60 days");
        });

        it("rejects if new date is in the past", () => {
            const referenceDate = new Date("2026-01-15");
            const currentDate = new Date("2026-02-01");
            const newDate = new Date("2026-01-10"); // Past date

            const result = validateDateChange(
                currentDate,
                newDate,
                "IN_PERSON",
                referenceDate
            );

            expect(result.valid).toBe(false);
            expect(result.reason).toContain("cannot be in the past");
        });
    });

    describe("constants", () => {
        it("keeps the date-change approval window at 14 days", () => {
            expect(DATE_CHANGE_APPROVAL_WINDOW_DAYS).toBe(14);
            expect(MINIMUM_LEAD_TIME_DAYS).toBe(14);
        });

        it("publishes the March scheduling lead-time constants", () => {
            expect(VIRTUAL_WORKSHOP_LEAD_TIME_DAYS).toBe(60);
            expect(IN_PERSON_WORKSHOP_LEAD_TIME_DAYS).toBe(90);
            expect(HYBRID_WORKSHOP_LEAD_TIME_DAYS).toBe(90);
        });
    });
});
