import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { evaluateApproval, ApprovalType } from "@/lib/approval-engine";

// Request schemas
const CreateApprovalSchema = z.object({
    type: z.enum(["WORKSHOP_REQUEST", "CUSTOM_PRICING", "CANCELLATION", "DATE_CHANGE", "REFUND"]),
    coachId: z.string(),
    coachEmail: z.string().email(),
    workshopId: z.string().optional(),
    workshopTypeSlug: z.string().optional(),
    amount: z.number().optional(),
    details: z.string(),
    requestedBy: z.string(),
});

/**
 * GET /api/approvals
 * List pending approvals (for admin dashboard)
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const status = searchParams.get("status") || "PENDING";
        const limit = parseInt(searchParams.get("limit") || "50");

        const approvals = await db.approvalQueue.findMany({
            where: { status: status as "PENDING" | "APPROVED" | "DENIED" | "EXPIRED" },
            orderBy: { requestedAt: "desc" },
            take: limit,
        });

        return NextResponse.json({
            approvals: approvals.map(a => ({
                id: a.id,
                type: a.type,
                status: a.status,
                requestData: JSON.parse(a.requestData),
                coachId: a.coachId,
                workshopId: a.workshopId,
                requestedAt: a.requestedAt,
                escalatedAt: a.escalatedAt,
            })),
            total: approvals.length,
        });
    } catch (error) {
        console.error("Approvals GET error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

/**
 * POST /api/approvals
 * Create a new approval request
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const input = CreateApprovalSchema.parse(body);

        // Evaluate the approval (may auto-approve or create queue entry)
        const result = await evaluateApproval({
            type: input.type as ApprovalType,
            coachId: input.coachId,
            coachEmail: input.coachEmail,
            workshopId: input.workshopId,
            workshopTypeSlug: input.workshopTypeSlug,
            amount: input.amount,
            details: input.details,
            requestedBy: input.requestedBy,
        });

        return NextResponse.json({
            autoApproved: result.autoApproved,
            reason: result.reason,
            approvalId: result.approvalId,
            routedTo: result.routeTo,
        });
    } catch (error) {
        console.error("Approvals POST error:", error);

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
