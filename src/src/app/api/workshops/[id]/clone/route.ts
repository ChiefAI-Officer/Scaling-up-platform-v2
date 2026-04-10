import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCoach, canAccessWorkshop } from "@/lib/auth/authorization";
import { generateSlug } from "@/lib/utils";
import { generateUniqueWorkshopCode } from "@/lib/workshops/workshop-code";
import { z } from "zod";

const cloneWorkshopParamsSchema = z.object({
    id: z.string().min(1, "Workshop id is required"),
});

/**
 * POST /api/workshops/[id]/clone
 * Creates a copy of an existing workshop as a new draft
 */
export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { coach } = await requireCoach();
        const paramsValidation = cloneWorkshopParamsSchema.safeParse(await params);
        if (!paramsValidation.success) {
            return NextResponse.json(
                { success: false, error: "Invalid workshop id", details: paramsValidation.error.issues },
                { status: 400 }
            );
        }

        const { id: workshopId } = paramsValidation.data;

        // Verify coach owns this workshop
        if (!(await canAccessWorkshop(workshopId))) {
            return NextResponse.json(
                { success: false, error: "Workshop not found or access denied" },
                { status: 404 }
            );
        }

        // Get source workshop
        const sourceWorkshop = await db.workshop.findUnique({
            where: { id: workshopId },
            include: {
                workshopType: true,
            },
        });

        if (!sourceWorkshop) {
            return NextResponse.json(
                { success: false, error: "Workshop not found" },
                { status: 404 }
            );
        }

        // Create cloned workshop
        const newTitle = `${sourceWorkshop.title} (Copy)`;

        // JV-03: Generate unique workshop code for cloned workshop
        const workshopCode = await generateUniqueWorkshopCode(
            async (code) => !!(await db.workshop.findUnique({ where: { workshopCode: code }, select: { id: true } }))
        );

        const clonedWorkshop = await db.workshop.create({
            data: {
                // Core relationships
                coachId: coach.id,
                workshopTypeId: sourceWorkshop.workshopTypeId,
                workshopCode,
                category: sourceWorkshop.category,

                // Event details (title modified, date cleared)
                title: newTitle,
                description: sourceWorkshop.description,
                format: sourceWorkshop.format,
                duration: sourceWorkshop.duration,
                eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default to 30 days from now
                eventTime: sourceWorkshop.eventTime,
                timezone: sourceWorkshop.timezone,

                // Location (copied as-is)
                venueName: sourceWorkshop.venueName,
                venueAddress: sourceWorkshop.venueAddress,
                venueInstructions: sourceWorkshop.venueInstructions,

                // Virtual settings
                virtualPlatform: sourceWorkshop.virtualPlatform,
                virtualLink: null, // Clear virtual link for security

                // Pricing (copied)
                isFree: sourceWorkshop.isFree,
                priceCents: sourceWorkshop.priceCents,
                earlyBirdPriceCents: sourceWorkshop.earlyBirdPriceCents,
                earlyBirdDeadline: null, // Clear early bird deadline

                // Capacity
                maxAttendees: sourceWorkshop.maxAttendees,

                // Reset status and locking
                status: "INFO_REQUESTED",
                isLocked: false,
                lockedAt: null,
                lockedBy: null,

                // No external IDs (new workshop)
                landingPageSlug: null,
                hubspotCampaignId: null,
                stripeProductId: null,
                stripePriceId: null,
            },
        });

        // Generate unique slug for the cloned workshop
        const slug = generateSlug(newTitle, clonedWorkshop.id);
        await db.workshop.update({
            where: { id: clonedWorkshop.id },
            data: { landingPageSlug: slug },
        });

        return NextResponse.json({
            success: true,
            message: "Workshop cloned successfully",
            data: {
                id: clonedWorkshop.id,
                title: clonedWorkshop.title,
                status: clonedWorkshop.status,
                landingPageSlug: slug,
            },
        });
    } catch (error) {
        console.error("Error cloning workshop:", error);
        return NextResponse.json(
            { success: false, error: "Failed to clone workshop" },
            { status: 500 }
        );
    }
}
