/**
 * Landing Page Auto-Population Utility
 * Sprint 3: Auto-populates landing page content from workshop and coach data
 */

import { db } from "@/lib/db";

export interface AutoPopulatedContent {
    heading: string;
    subheading: string;
    coachName: string;
    coachBio: string;
    coachPhoto: string | null;
    eventDate: string;
    eventTime: string;
    venueName: string;
    venueAddress: string;
    venueCity: string;
    format: string;
    maxAttendees: number;
    price: string;
    workshopTypeName: string;
}

/**
 * Generate auto-populated content for a landing page based on workshop data
 */
export async function getAutoPopulatedContent(workshopId: string): Promise<AutoPopulatedContent | null> {
    const workshop = await db.workshop.findUnique({
        where: { id: workshopId },
        include: {
            coach: true,
            workshopType: true,
        },
    });

    if (!workshop) {
        return null;
    }

    const coach = workshop.coach;
    const workshopType = workshop.workshopType;

    // Format event date
    const eventDate = new Date(workshop.eventDate).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
    });

    // Parse venue address if JSON
    let venueAddress = "";
    let venueCity = "";
    if (workshop.venueAddress) {
        try {
            const parsed = JSON.parse(workshop.venueAddress);
            venueAddress = parsed.street || parsed.address || workshop.venueAddress;
            venueCity = parsed.city || "";
        } catch {
            venueAddress = workshop.venueAddress;
        }
    }

    // Format price
    let price = "Free";
    if (!workshop.isFree && workshop.priceCents) {
        price = `$${(workshop.priceCents / 100).toFixed(0)}`;
        if (workshop.earlyBirdPriceCents) {
            price += ` (Early Bird: $${(workshop.earlyBirdPriceCents / 100).toFixed(0)})`;
        }
    }

    return {
        // Auto-populated from workshop
        heading: workshop.title,
        subheading: `Join ${coach.firstName} ${coach.lastName} for this transformative workshop.`,

        // Auto-populated from coach
        coachName: `${coach.firstName} ${coach.lastName}`,
        coachBio: coach.bio || `${coach.firstName} is a certified Scaling Up coach.`,
        coachPhoto: coach.profileImage,

        // Event details
        eventDate,
        eventTime: workshop.eventTime || "TBD",
        venueName: workshop.venueName || "",
        venueAddress,
        venueCity,
        format: workshop.format,
        maxAttendees: workshop.maxAttendees,
        price,

        // Workshop type
        workshopTypeName: workshopType?.name || "",
    };
}

/**
 * Generate default landing page content JSON
 * Used when creating a new landing page
 */
export async function generateDefaultLandingPageContent(workshopId: string): Promise<string> {
    const autoPopulated = await getAutoPopulatedContent(workshopId);

    if (!autoPopulated) {
        // Return minimal default content if workshop not found
        return JSON.stringify({
            heading: "Workshop Title",
            subheading: "Workshop description goes here.",
            coachName: "Coach Name",
            coachBio: "",
            coachPhoto: null,
            eventDetails: {
                date: "",
                time: "",
                venue: "",
                address: "",
            },
            sections: {
                about: true,
                schedule: true,
                pricing: true,
                testimonials: false,
                faq: false,
            },
        });
    }

    return JSON.stringify({
        // Pre-populated from workshop data
        heading: autoPopulated.heading,
        subheading: autoPopulated.subheading,
        coachName: autoPopulated.coachName,
        coachBio: autoPopulated.coachBio,
        coachPhoto: autoPopulated.coachPhoto,

        eventDetails: {
            date: autoPopulated.eventDate,
            time: autoPopulated.eventTime,
            venue: autoPopulated.venueName,
            address: `${autoPopulated.venueAddress}${autoPopulated.venueCity ? `, ${autoPopulated.venueCity}` : ""}`,
            format: autoPopulated.format,
            maxAttendees: autoPopulated.maxAttendees,
        },

        pricing: {
            display: autoPopulated.price,
            isFree: autoPopulated.price === "Free",
        },

        workshopType: autoPopulated.workshopTypeName,

        // Section visibility defaults
        sections: {
            about: true,
            schedule: true,
            pricing: true,
            testimonials: false,
            faq: false,
        },
    });
}
