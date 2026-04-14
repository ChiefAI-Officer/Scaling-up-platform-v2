import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getApiActor } from "@/lib/auth/authorization";
import {
    sendApprovalCoachRespondedEmail,
    sendCounterOfferAcceptedEmail,
    sendCoachDeclinedCounterEmail,
} from "@/services/notifications";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import { runAutoBuild } from "@/lib/auto-build-service";
import { inngest } from "@/inngest/client";

const CoachResponseSchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("INFO_RESPONSE"), response: z.string().min(1, "Response cannot be empty").max(2000) }),
    z.object({ action: z.literal("ACCEPT_COUNTER") }),
    z.object({ action: z.literal("DECLINE_COUNTER"), newPriceCents: z.number().int().min(1).max(10_000_000).optional(), counterNote: z.string().max(1000).optional() }),
]);

const PRE_BUILD_STATUSES = ["REQUESTED", "AWAITING_APPROVAL", "INFO_REQUESTED", "DENIED"];

/**
 * POST /api/approvals/[id]/coach-response
 * Coach submits a response to an INFO_REQUESTED or COUNTER_OFFERED approval.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
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
            select: {
                id: true,
                coachId: true,
                workshopId: true,
                status: true,
                counterOfferCents: true,
                counterOfferNote: true,
                requestData: true,
            },
        });

        if (!approval) {
            return NextResponse.json({ error: "Approval not found" }, { status: 404, headers: rateLimit.headers });
        }

        // Only the owning coach can submit a response
        if (!actor.coachId || actor.coachId !== approval.coachId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: rateLimit.headers });
        }

        if (!["INFO_REQUESTED", "COUNTER_OFFERED"].includes(approval.status)) {
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

        const parsed = CoachResponseSchema.parse(body);

        // ── INFO_RESPONSE ──────────────────────────────────────────────────────
        if (parsed.action === "INFO_RESPONSE") {
            if (approval.status !== "INFO_REQUESTED") {
                return NextResponse.json(
                    { error: "INFO_RESPONSE only allowed on INFO_REQUESTED approvals" },
                    { status: 400, headers: rateLimit.headers }
                );
            }

            const coachResponseText = parsed.response;

            await db.$transaction(async (tx) => {
                await tx.approvalQueue.update({
                    where: { id },
                    data: { coachResponse: coachResponseText, status: "PENDING" },
                });
                // Append coach message to the thread
                await tx.approvalMessage.create({
                    data: { approvalId: id, from: "COACH", text: coachResponseText },
                });
            });

            if (approval.workshopId) {
                await db.workshop.update({
                    where: { id: approval.workshopId },
                    data: { status: "AWAITING_APPROVAL" },
                });
            }

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
                    coachResponse: parsed.response,
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
        }

        // ── ACCEPT_COUNTER ────────────────────────────────────────────────────
        if (parsed.action === "ACCEPT_COUNTER") {
            if (approval.status !== "COUNTER_OFFERED") {
                return NextResponse.json(
                    { error: "Cannot accept counter-offer — approval is not in COUNTER_OFFERED status" },
                    { status: 400, headers: rateLimit.headers }
                );
            }

            const counterCents = approval.counterOfferCents;
            if (!counterCents) {
                return NextResponse.json({ error: "No counter-offer amount found" }, { status: 400, headers: rateLimit.headers });
            }

            // Atomic: update workshop price + set approval to APPROVED
            // Capture workshop status inside transaction to avoid TOCTOU on auto-build decision
            let workshopStatusAtAccept: string | null = null;
            await db.$transaction(async (tx) => {
                if (approval.workshopId) {
                    const ws = await tx.workshop.findUnique({
                        where: { id: approval.workshopId },
                        select: { status: true },
                    });
                    workshopStatusAtAccept = ws?.status ?? null;
                    const needsStatusReset = workshopStatusAtAccept && PRE_BUILD_STATUSES.includes(workshopStatusAtAccept);
                    await tx.workshop.update({
                        where: { id: approval.workshopId },
                        data: {
                            priceCents: counterCents,
                            isFree: counterCents === 0,
                            ...(needsStatusReset ? { status: "AWAITING_APPROVAL" } : {}),
                        },
                    });
                }
                // DB-level race guard: throws P2025 if status already changed
                await tx.approvalQueue.update({
                    where: { id, status: "COUNTER_OFFERED" },
                    data: {
                        status: "APPROVED",
                        counterOfferCents: null,
                        counterOfferNote: null,
                        respondedAt: new Date(),
                        respondedBy: actor.email,
                    },
                });
            });

            // Auto-build trigger if workshop hadn't been built yet (status captured inside transaction)
            let buildWarning: string | undefined;
            if (approval.workshopId) {
                if (workshopStatusAtAccept && PRE_BUILD_STATUSES.includes(workshopStatusAtAccept)) {
                    try {
                        const buildResult = await runAutoBuild(approval.workshopId);
                        if (!buildResult.success) {
                            buildWarning = buildResult.error ?? "Auto-build did not complete";
                            console.warn(`[ACCEPT_COUNTER] ${buildWarning}`);
                        }
                    } catch (err) {
                        buildWarning = "Auto-build failed unexpectedly";
                        console.error("[AUTO-BUILD] ACCEPT_COUNTER inline build failed:", err);
                    }
                    try {
                        await inngest.send({
                            name: "workshop/approved",
                            data: { approvalId: id, workshopId: approval.workshopId, coachId: approval.coachId },
                        });
                    } catch (err) {
                        console.error("[INNGEST] ACCEPT_COUNTER backup event failed:", err);
                    }
                }
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
                await sendCounterOfferAcceptedEmail({
                    adminEmail: process.env.ADMIN_EMAIL || "admin@scalingup.com",
                    coachName: coach ? `${coach.firstName} ${coach.lastName}` : "Coach",
                    workshopTitle,
                    approvalId: id,
                    acceptedPriceCents: counterCents,
                }).catch((err) => console.error("Failed to send counter accepted email:", err));
            }

            await logAudit({
                entityType: "ApprovalQueue",
                entityId: id,
                action: "ACCEPT_COUNTER",
                performedBy: actor.email,
                changes: { previousStatus: "COUNTER_OFFERED", newStatus: "APPROVED", acceptedPriceCents: counterCents },
            });

            return NextResponse.json({
                success: true,
                status: "APPROVED",
                ...(buildWarning ? { warning: buildWarning } : {}),
            }, { headers: rateLimit.headers });
        }

        // ── DECLINE_COUNTER ───────────────────────────────────────────────────
        if (parsed.action === "DECLINE_COUNTER") {
            if (approval.status !== "COUNTER_OFFERED") {
                return NextResponse.json(
                    { error: "Cannot decline counter-offer — approval is not in COUNTER_OFFERED status" },
                    { status: 400, headers: rateLimit.headers }
                );
            }

            if (parsed.newPriceCents) {
                // Coach proposes a new price — reset to PENDING with updated requestData
                let reqData: Record<string, unknown> = {};
                try {
                    reqData = JSON.parse(approval.requestData ?? "{}") as Record<string, unknown>;
                } catch { /* ignore */ }
                reqData.newPriceCents = parsed.newPriceCents;
                if (parsed.counterNote) {
                    reqData.counterNote = parsed.counterNote;
                }

                // DB-level race guard on decline-with-new-price
                await db.approvalQueue.update({
                    where: { id, status: "COUNTER_OFFERED" },
                    data: {
                        requestData: JSON.stringify(reqData),
                        status: "PENDING",
                        counterOfferCents: null,
                        counterOfferNote: null,
                        respondedBy: null,
                        respondedAt: null,
                    },
                });

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
                    await sendCoachDeclinedCounterEmail({
                        adminEmail: process.env.ADMIN_EMAIL || "admin@scalingup.com",
                        coachName: coach ? `${coach.firstName} ${coach.lastName}` : "Coach",
                        workshopTitle,
                        approvalId: id,
                        newPriceCents: parsed.newPriceCents,
                    }).catch((err) => console.error("Failed to send coach declined counter email:", err));
                }

                await logAudit({
                    entityType: "ApprovalQueue",
                    entityId: id,
                    action: "DECLINE_COUNTER",
                    performedBy: actor.email,
                    changes: { previousStatus: "COUNTER_OFFERED", newStatus: "PENDING", newPriceCents: parsed.newPriceCents },
                });

                return NextResponse.json({ success: true, status: "PENDING" }, { headers: rateLimit.headers });
            } else {
                // No new price — final decline, end negotiation
                // DB-level race guard on final decline + record coach as respondent
                await db.approvalQueue.update({
                    where: { id, status: "COUNTER_OFFERED" },
                    data: {
                        status: "DENIED",
                        counterOfferCents: null,
                        counterOfferNote: null,
                        respondedBy: actor.email,
                        respondedAt: new Date(),
                    },
                });

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
                    await sendCoachDeclinedCounterEmail({
                        adminEmail: process.env.ADMIN_EMAIL || "admin@scalingup.com",
                        coachName: coach ? `${coach.firstName} ${coach.lastName}` : "Coach",
                        workshopTitle,
                        approvalId: id,
                    }).catch((err) => console.error("Failed to send coach declined counter email:", err));
                }

                await logAudit({
                    entityType: "ApprovalQueue",
                    entityId: id,
                    action: "DECLINE_COUNTER",
                    performedBy: actor.email,
                    changes: { previousStatus: "COUNTER_OFFERED", newStatus: "DENIED" },
                });

                return NextResponse.json({ success: true, status: "DENIED" }, { headers: rateLimit.headers });
            }
        }

        return NextResponse.json({ error: "Unhandled action" }, { status: 400, headers: rateLimit.headers });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Validation error", details: error.issues },
                { status: 400, headers: rateLimit.headers }
            );
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
            return NextResponse.json(
                { error: "Approval state changed — please refresh and try again" },
                { status: 409, headers: rateLimit.headers }
            );
        }
        console.error("Coach response POST error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: rateLimit.headers });
    }
}
