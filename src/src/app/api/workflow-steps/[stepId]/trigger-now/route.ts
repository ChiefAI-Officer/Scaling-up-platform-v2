import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
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

    try {
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

        // Block only if currently in-flight (PENDING). SENT steps are allowed to re-trigger
        // so admins can test workflows repeatedly. Manual trigger retries reuse the same
        // manualTriggerId in Inngest, while a fresh click mints a new delivery parent.
        const inFlight = await db.workflowStepExecution.findFirst({
            where: { stepId, workshopId: cleanWorkshopId, status: "PENDING" },
        });
        if (inFlight) {
            return NextResponse.json(
                { error: "This step is currently being processed" },
                { status: 409, headers: rateLimit.headers }
            );
        }

        await inngest.send({
            name: "workflow/step.trigger",
            data: {
                stepId,
                workshopId: cleanWorkshopId,
                forceResend: true,
                manualTriggerId: randomUUID(),
            },
        });
    } catch (err) {
        // DB or Inngest outage - return a structured 5xx instead of a raw 500.
        console.error("[trigger-now] Failed to trigger workflow step:", err);
        return NextResponse.json(
            { error: "Failed to trigger workflow step" },
            { status: 500, headers: rateLimit.headers }
        );
    }

    // After firing, check for a recent SMTP failure so the UI can show actionable context.
    // 24h window prevents stale errors from surfacing as false-positive warnings.
    let recentFailure: { errorMessage: string | null } | null = null;
    try {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        recentFailure = await db.workflowStepExecution.findFirst({
            where: {
                stepId,
                workshopId: cleanWorkshopId,
                status: "FAILED",
                executedAt: { gte: cutoff },
            },
            orderBy: { executedAt: "desc" },
            select: { errorMessage: true },
        });
    } catch (err) {
        // Non-fatal - Inngest event already sent.
        console.error("[trigger-now] Failed to query recent executions for failure context:", err);
    }

    return NextResponse.json(
        {
            success: true,
            previousFailure: recentFailure
                ? { errorMessage: recentFailure.errorMessage }
                : null,
        },
        { headers: rateLimit.headers }
    );
}
