/**
 * Lead Time Validation
 * Enforces business rules for workshop scheduling timing.
 * 
 * Per PRD Requirements:
 * - Minimum 2-week lead time for standard workshops
 * - Custom pricing requires approval regardless of lead time
 * - Date changes within 2 weeks escalate to Suzanne
 */

export interface LeadTimeValidationResult {
    valid: boolean;
    leadTimeDays: number;
    requiresApproval: boolean;
    reason?: string;
}

export const MINIMUM_LEAD_TIME_DAYS = 14; // 2 weeks

/**
 * Validate workshop lead time
 */
export function validateLeadTime(
    eventDate: Date,
    referenceDate: Date = new Date()
): LeadTimeValidationResult {
    const diffMs = eventDate.getTime() - referenceDate.getTime();
    const leadTimeDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (leadTimeDays < 0) {
        return {
            valid: false,
            leadTimeDays,
            requiresApproval: false,
            reason: "Event date cannot be in the past"
        };
    }

    if (leadTimeDays < MINIMUM_LEAD_TIME_DAYS) {
        return {
            valid: false,
            leadTimeDays,
            requiresApproval: true,
            reason: `Minimum lead time is ${MINIMUM_LEAD_TIME_DAYS} days. Current: ${leadTimeDays} days. Requires approval.`
        };
    }

    return {
        valid: true,
        leadTimeDays,
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
    referenceDate: Date = new Date()
): LeadTimeValidationResult {
    // First validate the new date itself
    const newDateValidation = validateLeadTime(newDate, referenceDate);

    if (!newDateValidation.valid && !newDateValidation.requiresApproval) {
        return newDateValidation;
    }

    // Check if date change is happening within 2 weeks of original event
    const daysUntilOriginal = Math.floor(
        (currentDate.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilOriginal < MINIMUM_LEAD_TIME_DAYS) {
        return {
            valid: newDateValidation.valid,
            leadTimeDays: newDateValidation.leadTimeDays,
            requiresApproval: true,
            reason: `Date change within ${MINIMUM_LEAD_TIME_DAYS} days of original event requires admin approval.`
        };
    }

    return newDateValidation;
}

const leadTimeValidator = {
    validateLeadTime,
    validateDateChange,
    MINIMUM_LEAD_TIME_DAYS
};

export default leadTimeValidator;
