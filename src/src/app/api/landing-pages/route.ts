import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { canManageCoachData, getApiActor } from "@/lib/auth/authorization";
import { syncCoachFromCircle } from "@/services/circle-sync";

// Request validation schema
const CreateLandingPageSchema = z.object({
    workshopId: z.string(),
});


/**
 * GET /api/landing-pages
 * Retrieve landing page by slug or workshopId
 */
export async function GET(request: NextRequest) {
    try {
        const actor = await getApiActor();
        if (!actor) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(request.url);
        const slug = searchParams.get("slug");
        const workshopId = searchParams.get("workshopId");

        if (!slug && !workshopId) {
            return NextResponse.json(
                { error: "Either slug or workshopId is required" },
                { status: 400 }
            );
        }

        const landingPage = await db.landingPage.findFirst({
            where: slug ? { slug } : { workshopId: workshopId! },
            include: {
                workshop: {
                    include: {
                        coach: true,
                        workshopType: true,
                    }
                }
            }
        });

        if (!landingPage) {
            return NextResponse.json(
                { error: "Landing page not found" },
                { status: 404 }
            );
        }

        if (!canManageCoachData(actor, landingPage.workshop.coachId)) {
            return NextResponse.json(
                { error: "Landing page not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            id: landingPage.id,
            slug: landingPage.slug,
            status: landingPage.status,
            content: JSON.parse(landingPage.content),
            workshop: {
                id: landingPage.workshop.id,
                title: landingPage.workshop.title,
                eventDate: landingPage.workshop.eventDate,
                coach: {
                    name: `${landingPage.workshop.coach.firstName} ${landingPage.workshop.coach.lastName}`,
                }
            },
            url: `${process.env.APP_URL}/workshop/${landingPage.slug}`,
        });
    } catch (error) {
        console.error("Landing page GET error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

/**
 * POST /api/landing-pages
 * Regenerate or publish a landing page for an existing workshop
 */
export async function POST(request: NextRequest) {
    try {
        const actor = await getApiActor();
        if (!actor) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { workshopId } = CreateLandingPageSchema.parse(body);

        // Fetch workshop with related data
        let workshop = await db.workshop.findUnique({
            where: { id: workshopId },
            include: {
                coach: true,
                workshopType: true,
            }
        });

        if (!workshop) {
            return NextResponse.json(
                { error: "Workshop not found" },
                { status: 404 }
            );
        }

        if (!canManageCoachData(actor, workshop.coachId)) {
            return NextResponse.json(
                { error: "Workshop not found" },
                { status: 404 }
            );
        }

        // Lazy sync coach profile once during landing-page generation.
        // This helps fill missing coach bio/photo from Circle without manual import.
        if (!workshop.coach.profileImage || !workshop.coach.bio) {
            const syncResult = await syncCoachFromCircle(workshop.coachId);
            if (syncResult.updated) {
                const refreshedWorkshop = await db.workshop.findUnique({
                    where: { id: workshopId },
                    include: {
                        coach: true,
                        workshopType: true,
                    },
                });
                if (refreshedWorkshop) {
                    workshop = refreshedWorkshop;
                }
            }
        }

        // Check if landing page already exists (use the first/default template for legacy support)
        let landingPage = await db.landingPage.findFirst({
            where: { workshopId }
        });
        const existingPage = !!landingPage;

        const slug = generateSlug(
            workshop.coach.firstName,
            workshop.coach.lastName,
            workshop.workshopType?.slug || "workshop",
            workshop.eventDate
        );

        const content = JSON.stringify({
            title: workshop.title,
            description: "",
            coachName: `${workshop.coach.firstName} ${workshop.coach.lastName}`,
            coachBio: workshop.coach.bio,
            coachPhotoUrl: workshop.coach.profileImage,
            eventDate: workshop.eventDate,
            eventTime: workshop.eventTime,
            venue: {
                name: workshop.venueName,
                address: workshop.venueAddress, // JSON string with full address details
            },
            price: workshop.priceCents,
            stripeProductId: workshop.stripeProductId,
            stripePriceId: workshop.stripePriceId,
            generatedAt: new Date().toISOString(),
        });

        if (landingPage) {
            // Update existing
            landingPage = await db.landingPage.update({
                where: { id: landingPage.id },
                data: {
                    slug,
                    content,
                    status: "PUBLISHED",
                    publishedAt: new Date(),
                    updatedAt: new Date(),
                }
            });
        } else {
            // Create new with default SOLO_LANDING template
            // CHG-03: customCode only appears on THANK_YOU pages, so this
            // SOLO_LANDING create site doesn't need to copy it. We
            // intentionally do NOT accept customCode from the request body
            // (would be a coach-XSS path).
            landingPage = await db.landingPage.create({
                data: {
                    workshopId,
                    template: "SOLO_LANDING",
                    slug,
                    content,
                    status: "PUBLISHED",
                    publishedAt: new Date(),
                }
            });
        }

        // Audit log
        await logAudit({
            entityType: "LandingPage",
            entityId: landingPage.id,
            action: existingPage ? "UPDATE" : "CREATE",
            performedBy: actor.email,
            changes: { slug, status: "PUBLISHED" }
        });

        return NextResponse.json({
            id: landingPage.id,
            slug: landingPage.slug,
            url: `${process.env.APP_URL}/workshop/${landingPage.slug}`,
            status: "PUBLISHED",
        });
    } catch (error) {
        console.error("Landing page POST error:", error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Validation error", details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

function generateSlug(firstName: string, lastName: string, workshopType: string, eventDate: Date): string {
    const coachName = `${firstName}-${lastName}`.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const dateStr = eventDate.toISOString().split('T')[0];
    return `${coachName}-${workshopType}-${dateStr}`;
}
