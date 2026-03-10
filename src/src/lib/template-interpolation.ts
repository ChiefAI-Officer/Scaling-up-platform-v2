/**
 * Shared template variable interpolation for landing page content.
 * Used by both auto-build (Inngest) and manual copy-from-library flows.
 */

import { db } from "@/lib/db";

/**
 * Interpolate {{variables}} in template content JSON string.
 * Replaces placeholders like {{workshop_title}}, {{coach_name}}, {{event_date}}, etc.
 */
export function interpolateContent(contentJson: string, variables: Record<string, string>): string {
    let result = contentJson;
    for (const [key, value] of Object.entries(variables)) {
        result = result.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"), value);
    }
    return result;
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
                },
            },
            workshopCategory: { select: { name: true } },
            pricingTier: { select: { name: true, amountCents: true } },
        },
    });

    if (!workshop) return null;

    return {
        workshop_title: workshop.title,
        workshop_description: workshop.description || "",
        workshop_date: workshop.eventDate.toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
        }),
        workshop_time: workshop.eventTime || "",
        workshop_format: workshop.format,
        workshop_code: workshop.workshopCode,
        venue_name: workshop.venueName || "",
        venue_address: workshop.venueAddress || "",
        venue_instructions: workshop.venueInstructions || "",
        virtual_link: workshop.virtualLink || "",
        coach_name: `${workshop.coach.firstName} ${workshop.coach.lastName}`,
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
    };
}
