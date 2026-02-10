import { db } from "@/lib/db";
import { createProductAndPrice } from "@/services/stripe";
import { logAudit } from "@/lib/audit";
import { inngest } from "@/inngest/client";

interface WorkshopGenerationInput {
    coachId: string;
    workshopTypeId: string;
    title: string;
    description: string;
    eventDate: Date;
    eventTime: string;
    venue: {
        name: string;
        address: string;
        city: string;
        state: string;
        zip: string;
    };
    price: number; // in cents
    useCoachPhoto: boolean; // If false, use workshop graphic
    workshopGraphicUrl?: string;
}

interface WorkshopGenerationResult {
    workshopId: string;
    landingPageSlug: string;
    landingPageUrl: string;
    stripeProductId: string;
    stripePriceId: string;
}

/**
 * Generate a complete workshop with landing page
 * This is the main automation function that replaces the 4-5 step Kajabi process.
 */
export async function generateWorkshop(
    input: WorkshopGenerationInput,
    performedBy: string
): Promise<WorkshopGenerationResult> {

    // 1. Fetch Coach data
    const coach = await db.coach.findUnique({
        where: { id: input.coachId },
        include: { certifications: true }
    });

    if (!coach) {
        throw new Error(`Coach not found: ${input.coachId}`);
    }

    // 2. Fetch Workshop Type
    const workshopType = await db.workshopType.findUnique({
        where: { id: input.workshopTypeId }
    });

    if (!workshopType) {
        throw new Error(`Workshop type not found: ${input.workshopTypeId}`);
    }

    // 3. Create Stripe Product and Price
    const { productId: stripeProductId, priceId: stripePriceId } = await createProductAndPrice(
        `workshop-${Date.now()}`, // Temporary ID until we have workshop ID
        input.title,
        input.price
    );

    // 4. Generate URL Slug
    const slug = generateSlug(coach.firstName, coach.lastName, workshopType.slug, input.eventDate);

    // 5. Create Workshop Record
    const workshop = await db.workshop.create({
        data: {
            coachId: input.coachId,
            workshopTypeId: input.workshopTypeId,
            title: input.title,
            description: input.description,
            format: "IN_PERSON",
            duration: "full-day",
            stripeProductId,
            stripePriceId,
            priceCents: input.price,
            eventDate: input.eventDate,
            eventTime: input.eventTime,
            venueName: input.venue.name,
            venueAddress: JSON.stringify({
                street: input.venue.address,
                city: input.venue.city,
                state: input.venue.state,
                zip: input.venue.zip,
            }),
            status: "SETUP_IN_PROGRESS",
        }
    });

    // 6. Generate Landing Page Content
    const landingPageContent = generateLandingPageContent({
        title: input.title,
        description: input.description,
        coachName: `${coach.firstName} ${coach.lastName}`,
        coachBio: coach.bio || "",
        coachPhotoUrl: input.useCoachPhoto ? coach.profileImage || undefined : undefined,
        workshopGraphicUrl: input.useCoachPhoto ? undefined : input.workshopGraphicUrl,
        eventDate: input.eventDate,
        eventTime: input.eventTime,
        venue: input.venue,
        price: input.price,
        stripeProductId,
        stripePriceId,
    });

    // 7. Create Landing Page Record
    await db.landingPage.create({
        data: {
            workshopId: workshop.id,
            template: "SOLO_LANDING",
            slug,
            content: landingPageContent,
            status: "PUBLISHED",
            publishedAt: new Date(),
        }
    });

    // 8. Create Audit Log
    await logAudit({
        entityType: "Workshop",
        entityId: workshop.id,
        action: "CREATE",
        performedBy,
        changes: {
            title: input.title,
            coachId: input.coachId,
            eventDate: input.eventDate.toISOString(),
        }
    });

    // 9. Trigger Inngest Events for async processing
    await inngest.send({
        name: "workshop/created",
        data: {
            workshopId: workshop.id,
            coachId: input.coachId,
            title: input.title,
            date: input.eventDate.toISOString(),
        }
    });

    const landingPageUrl = `${process.env.APP_URL}/workshop/${slug}`;

    return {
        workshopId: workshop.id,
        landingPageSlug: slug,
        landingPageUrl,
        stripeProductId,
        stripePriceId,
    };
}

/**
 * Generate a URL-safe slug from workshop details
 */
function generateSlug(firstName: string, lastName: string, workshopType: string, eventDate: Date): string {
    const coachName = `${firstName}-${lastName}`.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const dateStr = eventDate.toISOString().split('T')[0];
    return `${coachName}-${workshopType}-${dateStr}`;
}

/**
 * Generate static HTML content for the landing page
 */
interface LandingPageData {
    title: string;
    description: string;
    coachName: string;
    coachBio: string;
    coachPhotoUrl?: string;
    workshopGraphicUrl?: string;
    eventDate: Date;
    eventTime: string;
    venue: {
        name: string;
        address: string;
        city: string;
        state: string;
        zip: string;
    };
    price: number;
    stripeProductId: string;
    stripePriceId: string;
}

function generateLandingPageContent(workshopData: LandingPageData): string {
    const checkoutUrl = `${process.env.APP_URL}/api/checkout?workshopId=${workshopData.stripeProductId}`;

    // For SSG/SSR, we'd render the React component to static markup
    // In a real implementation, you might use Next.js ISR or similar
    return JSON.stringify({
        ...workshopData,
        checkoutUrl,
        generatedAt: new Date().toISOString(),
    });
}

export default generateWorkshop;
