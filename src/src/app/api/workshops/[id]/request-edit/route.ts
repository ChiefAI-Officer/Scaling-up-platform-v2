import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCoach, isWorkshopLocked, canAccessWorkshop } from "@/lib/authorization";

/**
 * POST /api/workshops/[id]/request-edit
 * Creates an ApprovalQueue entry for editing a locked workshop
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { session, coach } = await requireCoach();
        const { id: workshopId } = await params;

        // Verify coach owns this workshop
        if (!(await canAccessWorkshop(workshopId))) {
            return NextResponse.json(
                { success: false, error: "Workshop not found or access denied" },
                { status: 404 }
            );
        }

        // Verify workshop is locked
        const locked = await isWorkshopLocked(workshopId);
        if (!locked) {
            return NextResponse.json(
                { success: false, error: "Workshop is not locked. You can edit it directly." },
                { status: 400 }
            );
        }

        // Get workshop details for the request
        const workshop = await db.workshop.findUnique({
            where: { id: workshopId },
            select: {
                title: true,
                eventDate: true,
                status: true,
            },
        });

        if (!workshop) {
            return NextResponse.json(
                { success: false, error: "Workshop not found" },
                { status: 404 }
            );
        }

        // Check for existing pending request
        const existingRequest = await db.approvalQueue.findFirst({
            where: {
                workshopId,
                type: "DATE_CHANGE",
                status: "PENDING",
            },
        });

        if (existingRequest) {
            return NextResponse.json(
                {
                    success: false,
                    error: "A pending edit request already exists for this workshop",
                    existingRequestId: existingRequest.id
                },
                { status: 409 }
            );
        }

        // Parse request body for edit details
        let editReason = "Coach requested to edit locked workshop";
        try {
            const body = await request.json();
            if (body.reason) {
                editReason = body.reason;
            }
        } catch {
            // No body provided, use default reason
        }

        // Create approval request
        const approvalRequest = await db.approvalQueue.create({
            data: {
                type: "DATE_CHANGE",
                workshopId,
                coachId: coach.id,
                requestData: JSON.stringify({
                    workshopTitle: workshop.title,
                    eventDate: workshop.eventDate,
                    reason: editReason,
                    requestedAt: new Date().toISOString(),
                }),
                status: "PENDING",
                requestedBy: session.user.email,
            },
        });

        return NextResponse.json({
            success: true,
            message: "Edit request submitted. An administrator will review your request.",
            requestId: approvalRequest.id,
        });
    } catch (error) {
        console.error("Error creating edit request:", error);
        return NextResponse.json(
            { success: false, error: "Failed to submit edit request" },
            { status: 500 }
        );
    }
}
