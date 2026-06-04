/**
 * Shared template variable interpolation for landing page content.
 * Used by both auto-build (Inngest) and manual copy-from-library flows.
 */

import { db } from "@/lib/db";
import { formatTimeWithZone, formatZoneAbbrev } from "@/lib/utils";

export { interpolateContent, rewriteIdentityFields, templateHasPlaceholders, findRemainingPlaceholders } from "@/lib/templates/template-interpolation-core";

/**
 * Format a venue address that may be stored as a JSON object or plain string.
 * JSON fields: street, city, state, zip — joined with ", ".
 * Returns empty string for null/undefined or empty JSON objects.
 */
export function formatVenueAddress(raw: string | null): string {
    if (!raw) return "";
    try {
        const parsed = JSON.parse(raw);
        return [parsed.street, parsed.city, parsed.state, parsed.zip].filter(Boolean).join(", ");
    } catch {
        return raw;
    }
}

/**
 * Format a workshop date with weekday, using UTC to prevent off-by-one date bugs.
 */
export function formatWorkshopDate(date: Date): string {
    return date.toLocaleDateString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
    });
}

/**
 * Format a workshop date as weekday only, using UTC.
 */
export function formatWorkshopDay(date: Date): string {
    return date.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

/**
 * Format a workshop date without weekday, using UTC.
 */
export function formatWorkshopDateNoWeekday(date: Date): string {
    return date.toLocaleDateString("en-US", {
        year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
    });
}

/**
 * Build the standard variables map for a workshop, fetching coach/category/pricing data.
 * Returns null if the workshop is not found.
 */
export async function buildWorkshopVariables(workshopId: string): Promise<Record<string, string> | null> {
    const workshop = await db.workshop.findUnique({
        where: { id: workshopId },
        include: {
            coach: {
                select: {
                    firstName: true,
                    lastName: true,
                    bio: true,
                    profileImage: true,
                    company: true,
                    title: true,
                },
            },
            workshopCategory: { select: { name: true } },
            pricingTier: { select: { name: true, amountCents: true } },
        },
    });

    if (!workshop) return null;

    const formattedDate = formatWorkshopDate(workshop.eventDate);

    // DST-aware zoned time (e.g. "9:00 AM CDT") + the bare abbreviation ("CDT").
    // Reuses lib/utils helpers (parser-independent, never throws). The raw stored
    // workshop.eventDate (midnight UTC of the event day) is the correct DST anchor.
    const zonedTime = formatTimeWithZone(workshop.eventTime, workshop.eventDate, workshop.timezone);
    const zoneAbbrev = formatZoneAbbrev(workshop.eventDate, workshop.timezone);

    const coachFullName = `${workshop.coach.firstName} ${workshop.coach.lastName}`;

    return {
        // snake_case — used by {{placeholder}} interpolation in auto-build templates
        workshop_title: workshop.title,
        workshop_description: workshop.description || "",
        workshop_date: formattedDate,
        event_day: formatWorkshopDay(workshop.eventDate),
        event_date: formattedDate,
        event_date_no_weekday: formatWorkshopDateNoWeekday(workshop.eventDate),
        // event_time is the token used by Solo Landing customHtml + SOLO_DEFAULTS;
        // previously absent -> rendered literal "{{event_time}}". workshop_time +
        // eventTime mirror the same zoned value for consistency.
        event_time: zonedTime,
        workshop_time: zonedTime,
        workshop_timezone: zoneAbbrev,
        workshop_format: workshop.format,
        workshop_code: workshop.workshopCode,
        venue_name: workshop.venueName || "",
        venue_address: formatVenueAddress(workshop.venueAddress),
        venue_instructions: workshop.venueInstructions || "",
        virtual_link: workshop.virtualLink || "",
        coach_name: coachFullName,
        coach_first_name: workshop.coach.firstName,
        coach_last_name: workshop.coach.lastName,
        coach_bio: workshop.coach.bio || "",
        coach_company: workshop.coach.company || "",
        coach_photo: workshop.coach.profileImage || "",
        category_name: workshop.workshopCategory?.name || "",
        price: workshop.pricingTier
            ? `$${(workshop.pricingTier.amountCents / 100).toFixed(0)}`
            : workshop.isFree
                ? "Free"
                : workshop.priceCents
                    ? `$${(workshop.priceCents / 100).toFixed(0)}`
                    : "TBD",
        // camelCase — matches JSON field names in editor content (solo-landing, registration, etc.)
        coachName: coachFullName,
        coachPhoto: workshop.coach.profileImage || "",
        coachTitle: workshop.coach.title || workshop.coach.company || "Scaling Up Certified Coach",
        coach_title: workshop.coach.title || workshop.coach.company || "Scaling Up Certified Coach",
        workshopTitle: workshop.title,
        eventDate: formattedDate,
        eventTime: zonedTime,
        // camelCase venue aliases (match template preview data)
        venueName: workshop.venueName || "",
        venueAddress: formatVenueAddress(workshop.venueAddress),
        // Structured JSON field mappings for solo-landing editor content
        heroTitle: workshop.title,
        heroSubtitle: workshop.description || "",
        aboutDescription: workshop.description || "",
    };
}
