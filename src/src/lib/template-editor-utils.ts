/**
 * Testable utilities for the template content editor.
 * Extracted from template-content-editor.tsx for unit testing.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SoloLandingFields {
    heroTitle: string;
    heroSubtitle: string;
    coachName: string;
    coachPhoto: string;
    coachTitle: string;
    eventDay: string;
    eventDate: string;
    eventTime: string;
    eventTimezone: string;
    aboutTitle: string;
    aboutDescription: string;
    benefits: string[];
    videoUrl: string;
    ctaText: string;
}

export interface RegistrationFields {
    heroHeadline: string;
    heroDescription: string;
    formTitle: string;
    emailPlaceholder: string;
    namePlaceholder: string;
    companyPlaceholder: string;
    optInText: string;
    submitButtonText: string;
    privacyText: string;
}

export interface ThankYouFields {
    headline: string;
    subheadline: string;
    videoUrl: string;
    additionalMessage: string;
    calendarReminderText: string;
}

// ---------------------------------------------------------------------------
// Defaults (with {{variable}} placeholders for auto-build interpolation)
// ---------------------------------------------------------------------------

export const SOLO_DEFAULTS: SoloLandingFields = {
    heroTitle: "{{workshop_title}}",
    heroSubtitle: "Build Value. Scale Up. Finish Strong.",
    coachName: "{{coach_name}}",
    coachPhoto: "{{coach_photo}}",
    coachTitle: "Scaling Up Certified Coach",
    eventDay: "{{event_day}}",
    eventDate: "{{event_date}}",
    eventTime: "{{event_time}}",
    eventTimezone: "EST",
    aboutTitle: "Join us for the {{workshop_title}}",
    aboutDescription:
        "This free virtual, coach-led strategic workshop is designed for business owners who want to maximize the value of their company over the next 3-5 years.",
    benefits: [
        "Identify the 9 value drivers of enterprise value",
        "Strategize the next 90 days for your business goals",
        "Strengthen and scale your business today",
        "Your Dream Team - Who's on YOUR team to secure a successful exit",
    ],
    videoUrl: "",
    ctaText: "Register Here",
};

export const REGISTRATION_DEFAULTS: RegistrationFields = {
    heroHeadline: "Virtual Workshop",
    heroDescription:
        "Join us for a transformative session where you'll gain access to world-class tools and strategies.",
    formTitle: "Register for the Workshop",
    emailPlaceholder: "Email",
    namePlaceholder: "First and last name",
    companyPlaceholder: "Company",
    optInText: "Keep this box checked to receive future details for this event",
    submitButtonText: "Register Here",
    privacyText: "By registering, you agree to our privacy policy.",
};

export const THANKYOU_DEFAULTS: ThankYouFields = {
    headline: "Thank you for Registering for the",
    subheadline:
        "You'll receive an email shortly with instructions and details for the workshop.",
    videoUrl: "",
    additionalMessage: "",
    calendarReminderText: "Add this event to your calendar so you don't miss it!",
};

// ---------------------------------------------------------------------------
// safeJsonParse
// ---------------------------------------------------------------------------

export function safeJsonParse(content: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(content);
        return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
            ? parsed
            : {};
    } catch {
        return {};
    }
}

// ---------------------------------------------------------------------------
// getInitialData — returns merged defaults+parsed for the matching type only
// ---------------------------------------------------------------------------

export function getInitialData(
    templateType: string,
    parsed: Record<string, unknown>,
): Record<string, unknown> {
    switch (templateType) {
        case "SOLO_LANDING":
            return { ...SOLO_DEFAULTS, ...parsed };
        case "REGISTRATION":
            return { ...REGISTRATION_DEFAULTS, ...parsed };
        case "THANK_YOU":
            return { ...THANKYOU_DEFAULTS, ...parsed };
        default:
            return {};
    }
}

// ---------------------------------------------------------------------------
// isDirtyCheck — compares current form state to initial state
// ---------------------------------------------------------------------------

export function isDirtyCheck(
    current: Record<string, unknown>,
    initial: Record<string, unknown>,
): boolean {
    return JSON.stringify(current) !== JSON.stringify(initial);
}
