import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { evaluateApproval, ApprovalType } from "@/lib/approval-engine";
import { getApiActor, isPrivilegedRole } from "@/lib/authorization";
import { inngest } from "@/inngest/client";

// Request schemas
const CreateApprovalSchema = z.object({
    type: z.enum(["WORKSHOP_REQUEST", "CUSTOM_PRICING", "CANCELLATION", "DATE_CHANGE", "REFUND"]),
    coachId: z.string().optional(),
    coachEmail: z.string().email().optional(),
    workshopId: z.string().optional(),
    workshopTypeSlug: z.string().optional(),
    workshopTypeId: z.string().optional(),
    amount: z.number().optional(),
    details: z.string().optional(),
    requestedBy: z.string().optional(),
    title: z.string().optional(),
    eventDate: z.string().optional(),
});

const APPROVAL_STATUSES = new Set(["PENDING", "APPROVED", "DENIED", "EXPIRED"]);

function safeJsonParse(raw: string): unknown {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

type ApprovalRequestData = {
    details?: string;
    requestedBy?: string;
};

function normalizeRequestData(raw: unknown): ApprovalRequestData {
    if (!raw || typeof raw !== "object") {
        return {};
    }

    const data = raw as Record<string, unknown>;
    return {
        details: typeof data.details === "string" ? data.details : undefined,
        requestedBy: typeof data.requestedBy === "string" ? data.requestedBy : undefined,
    };
}

async function publishApprovalRequestedEvent(
    approvalId: string,
    type: string,
    coachId: string
) {
    if (process.env.NODE_ENV === "test" || !process.env.INNGEST_EVENT_KEY) {
        return;
    }

    try {
        await inngest.send({
            name: "approval/requested",
            data: {
                approvalId,
                type,
                coachId,
            },
        });
    } catch (error) {
        // Do not block user flow if async telemetry fails.
        console.error("Failed to publish approval/requested event:", error);
    }
}

function buildDetails(input: z.infer<typeof CreateApprovalSchema>): string {
    if (input.details && input.details.trim().length > 0) {
        return input.details.trim();
    }

    const title = input.title?.trim();
    const date = input.eventDate?.trim();

    if (title && date) {
        return `Workshop: ${title} on ${date}`;
    }

    if (title) {
        return `Workshop: ${title}`;
    }

    return "Approval request submitted from coach portal";
}

/**
 * GET /api/approvals
 * List pending approvals (for admin dashboard)
 */
export async function GET(request: NextRequest) {
    try {
        const actor = await getApiActor();
        if (!actor) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        if (!isPrivilegedRole(actor.role)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const rawStatus = (searchParams.get("status") || "PENDING").toUpperCase();
        const includeAll = rawStatus === "ALL";
        const status = APPROVAL_STATUSES.has(rawStatus) ? rawStatus : "PENDING";
        const parsedLimit = parseInt(searchParams.get("limit") || "50", 10);
        const limit =
            Number.isFinite(parsedLimit) && parsedLimit > 0
                ? Math.min(100, parsedLimit)
                : 50;

        const approvals = await db.approvalQueue.findMany({
            where: includeAll ? {} : { status: status as "PENDING" | "APPROVED" | "DENIED" | "EXPIRED" },
            orderBy: { requestedAt: "desc" },
            take: limit,
            include: {
                coach: {
                    select: {
                        firstName: true,
                        lastName: true,
                        email: true,
                    },
                },
            },
        });

        return NextResponse.json({
            approvals: approvals.map((a) => {
                const requestData = safeJsonParse(a.requestData);
                const normalized = normalizeRequestData(requestData);
                const coachName = a.coach
                    ? `${a.coach.firstName} ${a.coach.lastName}`.trim() || a.coach.email
                    : normalized.requestedBy || a.requestedBy || "Unknown Coach";

                return {
                    id: a.id,
                    type: a.type,
                    status: a.status,
                    requestData,
                    coachName,
                    details: normalized.details || "Approval request submitted from coach portal",
                    coachId: a.coachId,
                    workshopId: a.workshopId,
                    requestedAt: a.requestedAt,
                    escalatedAt: a.escalatedAt,
                    requestedBy: normalized.requestedBy || a.requestedBy || a.coach?.email || "unknown",
                    responseReason: a.responseReason,
                };
            }),
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
        const actor = await getApiActor();
        if (!actor) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const body = await request.json();
        const input = CreateApprovalSchema.parse(body);
        const workshopTypeSlug = input.workshopTypeSlug || input.workshopTypeId;
        const details = buildDetails(input);

        let coachId: string;
        let coachEmail: string;
        let requestedBy: string;

        if (actor.role === "COACH") {
            if (!actor.coachId) {
                return NextResponse.json(
                    { error: "Coach profile not found for authenticated user" },
                    { status: 403 }
                );
            }

            if (input.coachId && input.coachId !== actor.coachId) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }

            if (input.coachEmail && input.coachEmail.toLowerCase() !== actor.email.toLowerCase()) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }

            coachId = actor.coachId;
            coachEmail = actor.email;
            requestedBy = input.requestedBy || actor.email;
        } else {
            if (!isPrivilegedRole(actor.role)) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }

            if (!input.coachId || !input.coachEmail) {
                return NextResponse.json(
                    { error: "coachId and coachEmail are required for admin/staff approval requests" },
                    { status: 400 }
                );
            }

            coachId = input.coachId;
            coachEmail = input.coachEmail.toLowerCase();
            requestedBy = input.requestedBy || actor.email;
        }

        // Evaluate the approval (may auto-approve or create queue entry)
        const result = await evaluateApproval({
            type: input.type as ApprovalType,
            coachId,
            coachEmail,
            workshopId: input.workshopId,
            workshopTypeSlug,
            amount: input.amount,
            details,
            requestedBy,
        });

        if (!result.autoApproved && result.approvalId) {
            await publishApprovalRequestedEvent(result.approvalId, input.type, coachId);
        }

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
