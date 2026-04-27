import { NextRequest, NextResponse } from "next/server";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";

/**
 * POST /api/workflow-steps/[stepId]/trigger-now
 *
 * Immediately fires a workflow step, bypassing its scheduled sleep.
 * Restricted to ADMIN and STAFF roles. Intended for testing and manual re-runs.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ stepId: string }> }
) {
    const rateLimit = await withRateLimit(request, RateLimits.standard);
    if (!rateLimit.allowed) {
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: rateLimit.headers }
        );
    }

    const actor = await getApiActor();
    if (!actor) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401, headers: rateLimit.headers }
        );
    }

    if (!isPrivilegedRole(actor.role)) {
        return NextResponse.json(
            { error: "Forbidden" },
            { status: 403, headers: rateLimit.headers }
        );
    }

    const { stepId } = await params;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400, headers: rateLimit.headers }
        );
    }

    const workshopId =
        body !== null &&
        typeof body === "object" &&
        "workshopId" in body &&
        typeof (body as Record<string, unknown>).workshopId === "string"
            ? ((body as Record<string, unknown>).workshopId as string)
            : null;

    if (!workshopId || workshopId.trim() === "") {
        return NextResponse.json(
            { error: "workshopId is required" },
            { status: 400, headers: rateLimit.headers }
        );
    }

    const cleanWorkshopId = workshopId.trim();

    const step = await db.workflowStep.findUnique({
        where: { id: stepId },
        select: { id: true },
    });
    if (!step) {
        return NextResponse.json(
            { error: "Workflow step not found" },
            { status: 404, headers: rateLimit.headers }
        );
    }

    // Block if already sent, currently in-flight (PENDING), or already queued (SCHEDULED)
    // — prevents double-send and duplicate Inngest events on sleeping steps
    const existing = await db.workflowStepExecution.findFirst({
        where: { stepId, workshopId: cleanWorkshopId, status: { in: ["SENT", "SCHEDULED", "PENDING"] } },
    });
    if (existing) {
        const alreadySent = existing.status === "SENT";
        const alreadyScheduled = existing.status === "SCHEDULED";
        return NextResponse.json(
            {
                error: alreadySent
                    ? "This step has already been sent"
                    : alreadyScheduled
                    ? "This step is already scheduled to send"
                    : "This step is currently being processed",
                alreadySent,
            },
            { status: 409, headers: rateLimit.headers }
        );
    }

    await inngest.send({
        name: "workflow/step.trigger",
        data: { stepId, workshopId: cleanWorkshopId },
    });

    return NextResponse.json({ success: true }, { headers: rateLimit.headers });
}
