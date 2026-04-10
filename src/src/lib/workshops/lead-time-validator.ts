/**
 * Lead Time Validation
 * Enforces business rules for workshop scheduling timing.
 *
 * March policy:
 * - Virtual workshops require 60 days lead time
 * - In-person workshops require 90 days lead time
 * - Hybrid workshops use the more restrictive 90-day rule
 * - Date changes within 14 days of the original event require approval
 */

export type WorkshopLeadTimeFormat = "IN_PERSON" | "VIRTUAL" | "HYBRID";

export interface LeadTimeValidationResult {
    valid: boolean;
    leadTimeDays: number;
    requiredLeadTimeDays: number;
    requiresApproval: boolean;
    format: WorkshopLeadTimeFormat;
    reason?: string;
}

export const DATE_CHANGE_APPROVAL_WINDOW_DAYS = 14;
// Legacy alias still used by cancellation handling.
export const MINIMUM_LEAD_TIME_DAYS = DATE_CHANGE_APPROVAL_WINDOW_DAYS;
export const VIRTUAL_WORKSHOP_LEAD_TIME_DAYS = 60;
export const IN_PERSON_WORKSHOP_LEAD_TIME_DAYS = 90;
export const HYBRID_WORKSHOP_LEAD_TIME_DAYS = IN_PERSON_WORKSHOP_LEAD_TIME_DAYS;

export function normalizeLeadTimeFormat(
    format?: string | null
): WorkshopLeadTimeFormat {
    const normalized = typeof format === "string" ? format.toUpperCase() : "";

    switch (normalized) {
        case "VIRTUAL":
            return "VIRTUAL";
        case "HYBRID":
            return "HYBRID";
        default:
            return "IN_PERSON";
    }
}

export function getMinimumLeadTimeDays(format?: string | null): number {
    const normalizedFormat = normalizeLeadTimeFormat(format);

    switch (normalizedFormat) {
        case "VIRTUAL":
            return VIRTUAL_WORKSHOP_LEAD_TIME_DAYS;
        case "HYBRID":
            return HYBRID_WORKSHOP_LEAD_TIME_DAYS;
        case "IN_PERSON":
        default:
            return IN_PERSON_WORKSHOP_LEAD_TIME_DAYS;
    }
}

export function getMinimumLeadTimeDate(
    format?: string | null,
    referenceDate: Date = new Date()
): Date {
    const date = new Date(referenceDate);
    date.setDate(date.getDate() + getMinimumLeadTimeDays(format));
    return date;
}

function formatLeadTimeLabel(format: WorkshopLeadTimeFormat): string {
    switch (format) {
        case "VIRTUAL":
            return "virtual workshops";
        case "HYBRID":
            return "hybrid workshops";
        case "IN_PERSON":
        default:
            return "in-person workshops";
    }
}

/**
 * Validate workshop lead time
 */
export function validateLeadTime(
    eventDate: Date,
    format?: string | null,
    referenceDate: Date = new Date()
): LeadTimeValidationResult {
    const normalizedFormat = normalizeLeadTimeFormat(format);
    const requiredLeadTimeDays = getMinimumLeadTimeDays(normalizedFormat);
    const diffMs = eventDate.getTime() - referenceDate.getTime();
    const leadTimeDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (leadTimeDays < 0) {
        return {
            valid: false,
            leadTimeDays,
            requiredLeadTimeDays,
            requiresApproval: false,
            format: normalizedFormat,
            reason: "Event date cannot be in the past"
        };
    }

    if (leadTimeDays < requiredLeadTimeDays) {
        return {
            valid: false,
            leadTimeDays,
            requiredLeadTimeDays,
            requiresApproval: true,
            format: normalizedFormat,
            reason: `Minimum lead time is ${requiredLeadTimeDays} days for ${formatLeadTimeLabel(normalizedFormat)}. Current: ${leadTimeDays} days.`
        };
    }

    return {
        valid: true,
        leadTimeDays,
        requiredLeadTimeDays,
        format: normalizedFormat,
        requiresApproval: false
    };
}

/**
 * Validate date change request
 * If new date is within 2 weeks, it requires approval
 */
export function validateDateChange(
    currentDate: Date,
    newDate: Date,
    format?: string | null,
    referenceDate: Date = new Date()
): LeadTimeValidationResult {
    const normalizedFormat = normalizeLeadTimeFormat(format);
    // First validate the new date itself against the active workshop format rule.
    const newDateValidation = validateLeadTime(newDate, normalizedFormat, referenceDate);

    if (!newDateValidation.valid) {
        return newDateValidation;
    }

    // Check if date change is happening within 14 days of the original event.
    const daysUntilOriginal = Math.floor(
        (currentDate.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilOriginal < DATE_CHANGE_APPROVAL_WINDOW_DAYS) {
        return {
            valid: newDateValidation.valid,
            leadTimeDays: newDateValidation.leadTimeDays,
            requiredLeadTimeDays: newDateValidation.requiredLeadTimeDays,
            requiresApproval: true,
            format: normalizedFormat,
            reason: `Date change within ${DATE_CHANGE_APPROVAL_WINDOW_DAYS} days of original event requires admin approval.`
        };
    }

    return newDateValidation;
}

const leadTimeValidator = {
    validateLeadTime,
    validateDateChange,
    MINIMUM_LEAD_TIME_DAYS,
    DATE_CHANGE_APPROVAL_WINDOW_DAYS,
    VIRTUAL_WORKSHOP_LEAD_TIME_DAYS,
    IN_PERSON_WORKSHOP_LEAD_TIME_DAYS,
    HYBRID_WORKSHOP_LEAD_TIME_DAYS,
    normalizeLeadTimeFormat,
    getMinimumLeadTimeDays,
    getMinimumLeadTimeDate,
};

export default leadTimeValidator;
