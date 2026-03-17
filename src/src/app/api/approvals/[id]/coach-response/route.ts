import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getApiActor } from "@/lib/authorization";
import { sendApprovalCoachRespondedEmail } from "@/services/notifications";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";

const CoachResponseSchema = z.object({
    response: z.string().min(1, "Response cannot be empty").max(2000),
});

/**
 * POST /api/approvals/[id]/coach-response
 * Coach submits a response to an INFO_REQUESTED approval.
 * Resets approval status to PENDING and workshop status to AWAITING_APPROVAL.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    // Apply rate limiting
    const rateLimit = await withRateLimit(request, RateLimits.standard);
    if (!rateLimit.allowed) {
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: rateLimit.headers }
        );
    }

    try {
        const actor = await getApiActor();
        if (!actor) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: rateLimit.headers });
        }

        const { id } = await params;

        const approval = await db.approvalQueue.findUnique({
            where: { id },
            select: { id: true, coachId: true, workshopId: true, status: true },
        });

        if (!approval) {
            return NextResponse.json({ error: "Approval not found" }, { status: 404, headers: rateLimit.headers });
        }

        // Only the owning coach can submit a response
        if (!actor.coachId || actor.coachId !== approval.coachId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: rateLimit.headers });
        }

        if (approval.status !== "INFO_REQUESTED") {
            return NextResponse.json(
                { error: "This approval is not awaiting a response" },
                { status: 400, headers: rateLimit.headers }
            );
        }

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400, headers: rateLimit.headers });
        }

        const { response } = CoachResponseSchema.parse(body);

        // Save response and reset approval to PENDING
        await db.approvalQueue.update({
            where: { id },
            data: {
                coachResponse: response,
                status: "PENDING",
            },
        });

        // Reset workshop status to AWAITING_APPROVAL so it shows in admin queue
        if (approval.workshopId) {
            await db.workshop.update({
                where: { id: approval.workshopId },
                data: { status: "AWAITING_APPROVAL" },
            });
        }

        // Notify admin (non-blocking)
        {
            const coach = await db.coach.findUnique({
                where: { id: approval.coachId },
                select: { firstName: true, lastName: true },
            });
            let workshopTitle = "Workshop";
            if (approval.workshopId) {
                const w = await db.workshop.findUnique({
                    where: { id: approval.workshopId },
                    select: { title: true },
                });
                if (w) workshopTitle = w.title;
            }
            await sendApprovalCoachRespondedEmail({
                adminEmail: process.env.ADMIN_EMAIL || "admin@scalingup.com",
                coachName: coach ? `${coach.firstName} ${coach.lastName}` : "Coach",
                workshopTitle,
                approvalId: id,
                coachResponse: response,
            }).catch((err) => console.error("Failed to send coach responded email:", err));
        }

        await logAudit({
            entityType: "ApprovalQueue",
            entityId: id,
            action: "COACH_RESPONSE",
            performedBy: actor.email,
            changes: { previousStatus: "INFO_REQUESTED", newStatus: "PENDING" },
        });

        return NextResponse.json({ success: true, message: "Response submitted successfully" }, { headers: rateLimit.headers });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Validation error", details: error.issues },
                { status: 400, headers: rateLimit.headers }
            );
        }
        console.error("Coach response POST error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: rateLimit.headers });
    }
}
