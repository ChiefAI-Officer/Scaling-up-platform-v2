import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import crypto from "crypto";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { sendWorkshopApprovedEmail, sendWorkshopDeniedEmail, sendApprovalInfoRequestEmail, sendCounterOfferEmail } from "@/services/notifications";
import { inngest } from "@/inngest/client";
import { runAutoBuild, type AutoBuildResult } from "@/lib/auto-build-service";

const DEFAULT_APPROVAL_LINK_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const MAX_APPROVAL_LINK_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days guardrail

// Request schema
const RespondSchema = z.object({
    action: z.enum(["APPROVE", "DENY", "RESET_TO_PENDING", "INFO_REQUESTED", "COUNTER_OFFER"]),
    reason: z.string().optional(),
    token: z.string().optional(), // For one-click links
    counterOfferCents: z.number().int().min(1).max(10_000_000).optional(),
    counterOfferNote: z.string().max(1000).optional(),
}).superRefine((data, ctx) => {
    if (data.action === "COUNTER_OFFER" && !data.counterOfferCents) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "counterOfferCents required for COUNTER_OFFER action", path: ["counterOfferCents"] });
    }
});

/**
 * GET /api/approvals/[id]/respond
 * One-click approve/deny via signed URL (from email)
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const action = searchParams.get("action");
        const token = searchParams.get("token");
        const expiresParam = searchParams.get("expires");

        if (!action || !["approve", "deny"].includes(action)) {
            return NextResponse.json(
                { error: "Invalid action" },
                { status: 400 }
            );
        }

        // Validate token
        const approval = await db.approvalQueue.findUnique({
            where: { id }
        });

        if (!approval) {
            return NextResponse.json(
                { error: "Approval not found" },
                { status: 404 }
            );
        }

        // Email links are single-use and generated when PENDING; dashboard POST supports INFO_REQUESTED→DENY.
        if (approval.status !== "PENDING") {
            return new NextResponse(
                `<html><body><h1>Already Processed</h1><p>This request has already been ${approval.status.toLowerCase()}.</p></body></html>`,
                { headers: { "Content-Type": "text/html" } }
            );
        }

        // Validate signed token (supports expiring links; legacy links without expires still work).
        let expectedToken: string;
        if (expiresParam) {
            const expiresAt = Number.parseInt(expiresParam, 10);
            if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
                return NextResponse.json(
                    { error: "Invalid link" },
                    { status: 403 }
                );
            }

            const now = Math.floor(Date.now() / 1000);
            if (expiresAt <= now) {
                return new NextResponse(
                    `<html><body><h1>Link Expired</h1><p>This approval link has expired. Please request a new one.</p></body></html>`,
                    { status: 410, headers: { "Content-Type": "text/html" } }
                );
            }

            // Reject suspiciously long-lived links.
            if (expiresAt - now > MAX_APPROVAL_LINK_TTL_SECONDS) {
                return NextResponse.json(
                    { error: "Invalid link" },
                    { status: 403 }
                );
            }

            expectedToken = generateToken(approval.id, action, expiresAt);
        } else {
            expectedToken = generateToken(approval.id, action);
        }

        if (!token || !safeTokenCompare(token, expectedToken)) {
            return NextResponse.json(
                { error: "Invalid or expired link" },
                { status: 403 }
            );
        }

        // Process the action
        const newStatus = action === "approve" ? "APPROVED" : "DENIED";

        await db.$transaction(async (tx) => {
            await tx.approvalQueue.update({
                where: { id },
                data: {
                    status: newStatus,
                    respondedBy: "EMAIL_LINK",
                    respondedAt: new Date(),
                }
            });
            // NOTE: Do NOT set workshop.status = PRE_EVENT here — auto-build owns that transition.
            // Setting it here causes the auto-build idempotency guard to skip the build on Inngest retries.
            if (newStatus === "DENIED" && approval.workshopId && approval.type !== "CUSTOM_PRICING") {
                await tx.workshop.update({
                    where: { id: approval.workshopId },
                    data: { status: "DENIED" },
                });
            }
        });

        // Send notification email to coach (non-blocking)
        // Use coachId directly (always non-null) instead of workshop→coach join
        {
            const coach = await db.coach.findUnique({
                where: { id: approval.coachId },
                select: { email: true, firstName: true, lastName: true },
            });

            let workshopTitle = "Workshop";
            if (approval.workshopId) {
                const w = await db.workshop.findUnique({
                    where: { id: approval.workshopId },
                    select: { title: true },
                });
                if (w) workshopTitle = w.title;
            }

            if (coach) {
                const emailPayload = {
                    coachEmail: coach.email,
                    coachName: `${coach.firstName} ${coach.lastName}`,
                    workshopTitle,
                    workshopId: approval.workshopId || undefined,
                };
                if (newStatus === "APPROVED") {
                    await sendWorkshopApprovedEmail(emailPayload).catch((err) =>
                        console.error("Failed to send workshop approved email:", err)
                    );
                } else {
                    await sendWorkshopDeniedEmail({ ...emailPayload, reason: "Denied via email link" }).catch((err) =>
                        console.error("Failed to send workshop denied email:", err)
                    );
                }
            } else {
                console.error(`[APPROVAL RESPOND GET] Coach not found for coachId=${approval.coachId}, approvalId=${id}`);
            }
        }

        // Run auto-build inline — don't depend on Inngest for critical path
        let buildNote = "";
        if (newStatus === "APPROVED" && approval.workshopId) {
            try {
                const buildResult = await runAutoBuild(approval.workshopId);
                console.log(`[AUTO-BUILD] GET inline build completed: pages=${buildResult.pagesCreated}, status=${buildResult.status}`);
                buildNote = `<p style="color: #718096; font-size: 0.9em;">Auto-build: ${buildResult.pagesCreated} pages created</p>`;
            } catch (err) {
                console.error("[AUTO-BUILD] GET inline build failed:", err);
                buildNote = `<p style="color: #718096; font-size: 0.9em;">Auto-build: failed (check logs)</p>`;
            }

            // Emit Inngest event as retry backup
            try {
                await inngest.send({
                    name: "workshop/approved",
                    data: { approvalId: id, workshopId: approval.workshopId, coachId: approval.coachId || "" },
                });
            } catch (err) {
                console.error("[INNGEST] Backup event failed:", err);
            }
        }

        await logAudit({
            entityType: "ApprovalQueue",
            entityId: id,
            action: action === "approve" ? "APPROVE" : "DENY",
            performedBy: "EMAIL_LINK",
            changes: { previousStatus: "PENDING", newStatus }
        });

        // Return success HTML page
        const autoBuildNote = newStatus === "APPROVED" ? buildNote : "";
        return new NextResponse(
            `<html>
        <head><title>Request ${newStatus}</title></head>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: ${action === 'approve' ? '#38a169' : '#e53e3e'};">
            ${action === 'approve' ? '✅ Approved' : '❌ Denied'}
          </h1>
          <p>The request has been ${newStatus.toLowerCase()}.</p>
          ${autoBuildNote}
          <a href="${process.env.APP_URL}/admin/approvals" style="color: #3182ce;">
            View All Approvals
          </a>
        </body>
      </html>`,
            { headers: { "Content-Type": "text/html" } }
        );
    } catch (error) {
        console.error("Approval respond GET error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

/**
 * POST /api/approvals/[id]/respond
 * Approve or deny via API (from dashboard)
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const actor = await getApiActor();
        if (!actor) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        if (!isPrivilegedRole(actor.role)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { id } = await params;
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json(
                { error: "Invalid JSON payload" },
                { status: 400 }
            );
        }
        const { action, reason, counterOfferCents, counterOfferNote } = RespondSchema.parse(body);

        const approval = await db.approvalQueue.findUnique({
            where: { id }
        });

        if (!approval) {
            return NextResponse.json(
                { error: "Approval not found" },
                { status: 404 }
            );
        }

        // MR-05: RESET_TO_PENDING only allowed on DENIED approvals
        if (action === "RESET_TO_PENDING") {
            if (approval.status !== "DENIED") {
                return NextResponse.json(
                    { error: "Can only reset DENIED approvals to pending" },
                    { status: 400 }
                );
            }
            await db.$transaction(async (tx) => {
                await tx.approvalQueue.update({
                    where: { id },
                    data: { status: "PENDING", respondedBy: null, respondedAt: null, responseReason: null },
                });
                // Reset workshop status so it no longer shows "Denied" after admin resets to pending
                if (approval.workshopId && approval.type !== "CUSTOM_PRICING") {
                    await tx.workshop.update({
                        where: { id: approval.workshopId },
                        data: { status: "AWAITING_APPROVAL" },
                    });
                }
            });
            await logAudit({
                entityType: "ApprovalQueue",
                entityId: id,
                action: "RESET_TO_PENDING",
                performedBy: actor.email,
                changes: { previousStatus: "DENIED", newStatus: "PENDING" },
            });
            return NextResponse.json({ success: true, status: "PENDING", message: "Approval reset to pending" });
        }

        // INFO_REQUESTED: ask coach for more info without changing approval status to approved/denied
        if (action === "INFO_REQUESTED") {
            if (approval.status !== "PENDING") {
                return NextResponse.json(
                    { error: "Can only request info on PENDING approvals" },
                    { status: 400 }
                );
            }
            await db.$transaction(async (tx) => {
                await tx.approvalQueue.update({
                    where: { id },
                    data: {
                        status: "INFO_REQUESTED",
                        notes: reason,
                    },
                });
                // Also update workshop status so coach portal shows the info request card
                if (approval.workshopId) {
                    await tx.workshop.update({
                        where: { id: approval.workshopId },
                        data: { status: "INFO_REQUESTED" },
                    });
                }
                // Append admin message to the thread
                await tx.approvalMessage.create({
                    data: { approvalId: id, from: "ADMIN", text: reason || "" },
                });
            });
            // Notify coach (non-blocking)
            {
                const coach = await db.coach.findUnique({
                    where: { id: approval.coachId },
                    select: { email: true, firstName: true, lastName: true },
                });
                if (coach && approval.workshopId) {
                    const w = await db.workshop.findUnique({
                        where: { id: approval.workshopId },
                        select: { title: true },
                    });
                    await sendApprovalInfoRequestEmail({
                        coachEmail: coach.email,
                        coachName: `${coach.firstName} ${coach.lastName}`,
                        workshopTitle: w?.title ?? "Workshop",
                        workshopId: approval.workshopId,
                        question: reason || "Please provide additional information.",
                    }).catch((err) => console.error("Failed to send info request email:", err));
                }
            }
            await logAudit({
                entityType: "ApprovalQueue",
                entityId: id,
                action: "INFO_REQUESTED",
                performedBy: actor.email,
                changes: { previousStatus: "PENDING", newStatus: "INFO_REQUESTED", question: reason },
            });
            return NextResponse.json({ success: true, status: "INFO_REQUESTED", message: "Info requested from coach" });
        }

        // COUNTER_OFFER: admin proposes alternative price for CUSTOM_PRICING approvals
        if (action === "COUNTER_OFFER") {
            if (approval.status !== "PENDING") {
                return NextResponse.json(
                    { error: "Can only counter-offer on PENDING approvals" },
                    { status: 400 }
                );
            }
            if (approval.type !== "CUSTOM_PRICING") {
                return NextResponse.json(
                    { error: "Counter-offers only apply to CUSTOM_PRICING approvals" },
                    { status: 400 }
                );
            }
            if (!counterOfferCents) {
                return NextResponse.json(
                    { error: "counterOfferCents required for COUNTER_OFFER action" },
                    { status: 400 }
                );
            }
            await db.$transaction(async (tx) => {
                await tx.approvalQueue.update({
                    where: { id },
                    data: {
                        status: "COUNTER_OFFERED",
                        counterOfferCents,
                        counterOfferNote: counterOfferNote ?? null,
                        respondedBy: actor.email,
                        respondedAt: new Date(),
                    },
                });
                // Update workshop status so coach portal shows "Awaiting Approval" not "Info Requested"
                if (approval.workshopId) {
                    await tx.workshop.update({
                        where: { id: approval.workshopId },
                        data: { status: "AWAITING_APPROVAL" },
                    });
                }
            });
            // Notify coach (non-blocking)
            {
                const coach = await db.coach.findUnique({
                    where: { id: approval.coachId },
                    select: { email: true, firstName: true, lastName: true },
                });
                let originalPriceCents = 0;
                try {
                    const reqData = JSON.parse(approval.requestData ?? "{}") as { newPriceCents?: unknown };
                    if (typeof reqData.newPriceCents === "number") originalPriceCents = reqData.newPriceCents;
                } catch { /* ignore */ }
                if (coach && approval.workshopId) {
                    const w = await db.workshop.findUnique({
                        where: { id: approval.workshopId },
                        select: { title: true },
                    });
                    await sendCounterOfferEmail({
                        coachEmail: coach.email,
                        coachName: `${coach.firstName} ${coach.lastName}`,
                        workshopTitle: w?.title ?? "Workshop",
                        workshopId: approval.workshopId,
                        originalPriceCents,
                        counterOfferCents,
                        counterOfferNote: counterOfferNote,
                    }).catch((err) => console.error("Failed to send counter-offer email:", err));
                }
            }
            await logAudit({
                entityType: "ApprovalQueue",
                entityId: id,
                action: "COUNTER_OFFER",
                performedBy: actor.email,
                changes: { previousStatus: "PENDING", newStatus: "COUNTER_OFFERED", counterOfferCents, counterOfferNote },
            });
            return NextResponse.json({ success: true, status: "COUNTER_OFFERED" });
        }

        if (!["PENDING", "INFO_REQUESTED"].includes(approval.status)) {
            return NextResponse.json(
                { error: `Approval already ${approval.status.toLowerCase()}` },
                { status: 400 }
            );
        }

        const newStatus = action === "APPROVE" ? "APPROVED" : "DENIED";

        // FIG-007: Handle CUSTOM_PRICING approvals specially — update priceCents, skip auto-build and wrong emails
        if (approval.type === "CUSTOM_PRICING") {
            if (newStatus === "APPROVED" && approval.workshopId) {
                let reqData: { newPriceCents?: unknown; pricingTierId?: unknown } = {};
                try {
                    reqData = JSON.parse(approval.requestData ?? "{}");
                } catch {
                    console.error(`[APPROVAL RESPOND POST] Failed to parse requestData for CUSTOM_PRICING approvalId=${id}`);
                }
                const updateData: { priceCents?: number; isFree?: boolean; pricingTierId?: string } = {};
                if (typeof reqData.newPriceCents === "number") {
                    updateData.priceCents = reqData.newPriceCents;
                    updateData.isFree = reqData.newPriceCents === 0;
                }
                if (reqData.pricingTierId && typeof reqData.pricingTierId === "string") {
                    updateData.pricingTierId = reqData.pricingTierId;
                }
                await db.workshop.update({
                    where: { id: approval.workshopId },
                    data: updateData,
                });
                console.log(`[CUSTOM_PRICING] Applied priceCents=${reqData.newPriceCents} to workshop=${approval.workshopId}`);

                // If workshop hasn't been built yet, run auto-build + Inngest backup
                const ws = await db.workshop.findUnique({
                    where: { id: approval.workshopId },
                    select: { status: true },
                });
                const PRE_BUILD_STATUSES = ["REQUESTED", "AWAITING_APPROVAL", "INFO_REQUESTED", "DENIED"];
                if (ws && PRE_BUILD_STATUSES.includes(ws.status)) {
                    try {
                        const buildResult = await runAutoBuild(approval.workshopId);
                        console.log(`[AUTO-BUILD] CUSTOM_PRICING inline build: pages=${buildResult.pagesCreated}, status=${buildResult.status}`);
                    } catch (err) {
                        console.error("[AUTO-BUILD] CUSTOM_PRICING inline build failed:", err);
                    }
                    try {
                        await inngest.send({
                            name: "workshop/approved",
                            data: { approvalId: id, workshopId: approval.workshopId, coachId: approval.coachId || "" },
                        });
                    } catch (err) {
                        console.error("[INNGEST] CUSTOM_PRICING backup event failed:", err);
                    }
                }
            }
            // For CUSTOM_PRICING denials on initial submissions (status=INFO_REQUESTED), set to DENIED.
            // PRE_EVENT price-change denials stay untouched. Use updateMany to avoid P2025 on no-match.
            await db.$transaction(async (tx) => {
                if (newStatus === "DENIED" && approval.workshopId) {
                    await tx.workshop.updateMany({
                        where: { id: approval.workshopId, status: "INFO_REQUESTED" },
                        data: { status: "DENIED" },
                    });
                }
                await tx.approvalQueue.update({
                    where: { id },
                    data: { status: newStatus, respondedBy: actor.email, respondedAt: new Date(), responseReason: reason },
                });
            });
            await logAudit({
                entityType: "ApprovalQueue",
                entityId: id,
                action,
                performedBy: actor.email,
                changes: { previousStatus: approval.status, newStatus, reason, approvalType: "CUSTOM_PRICING" },
            });
            return NextResponse.json({ success: true, status: newStatus, message: `Price change request ${newStatus.toLowerCase()}` });
        }

        await db.$transaction(async (tx) => {
            await tx.approvalQueue.update({
                where: { id },
                data: {
                    status: newStatus,
                    respondedBy: actor.email,
                    respondedAt: new Date(),
                    responseReason: reason,
                }
            });
            // NOTE: Do NOT set workshop.status = PRE_EVENT here — auto-build owns that transition.
            // Setting it here causes the auto-build idempotency guard to skip the build on Inngest retries.
            if (newStatus === "DENIED" && approval.workshopId) {
                await tx.workshop.update({
                    where: { id: approval.workshopId },
                    data: { status: "DENIED" },
                });
            }
        });

        // Send notification email to coach (non-blocking)
        // Use coachId directly (always non-null) instead of workshop→coach join
        {
            const coach = await db.coach.findUnique({
                where: { id: approval.coachId },
                select: { email: true, firstName: true, lastName: true },
            });

            let workshopTitle = "Workshop";
            if (approval.workshopId) {
                const w = await db.workshop.findUnique({
                    where: { id: approval.workshopId },
                    select: { title: true },
                });
                if (w) workshopTitle = w.title;
            }

            if (coach) {
                const emailPayload = {
                    coachEmail: coach.email,
                    coachName: `${coach.firstName} ${coach.lastName}`,
                    workshopTitle,
                    workshopId: approval.workshopId || undefined,
                };
                if (newStatus === "APPROVED") {
                    await sendWorkshopApprovedEmail(emailPayload).catch((err) =>
                        console.error("Failed to send workshop approved email:", err)
                    );
                } else {
                    await sendWorkshopDeniedEmail({ ...emailPayload, reason: reason || "Denied by administrator" }).catch((err) =>
                        console.error("Failed to send workshop denied email:", err)
                    );
                }
            } else {
                console.error(`[APPROVAL RESPOND POST] Coach not found for coachId=${approval.coachId}, approvalId=${id}`);
            }
        }

        // Run auto-build inline — don't depend on Inngest for critical path
        let buildResult: AutoBuildResult | null = null;
        if (newStatus === "APPROVED" && approval.workshopId) {
            try {
                buildResult = await runAutoBuild(approval.workshopId);
                console.log(`[AUTO-BUILD] Inline build completed: pages=${buildResult.pagesCreated}, status=${buildResult.status}`);
            } catch (err) {
                console.error("[AUTO-BUILD] Inline build failed, falling back to Inngest:", err);
            }

            // Emit Inngest event as retry backup (idempotency guard prevents duplicate work)
            try {
                await inngest.send({
                    name: "workshop/approved",
                    data: { approvalId: id, workshopId: approval.workshopId, coachId: approval.coachId || "" },
                });
            } catch (err) {
                console.error("[INNGEST] Backup event failed:", err);
            }
        }

        await logAudit({
            entityType: "ApprovalQueue",
            entityId: id,
            action,
            performedBy: actor.email,
            changes: { previousStatus: approval.status, newStatus, reason }
        });

        return NextResponse.json({
            success: true,
            status: newStatus,
            message: `Request ${newStatus.toLowerCase()}`,
            pagesCreated: buildResult?.pagesCreated ?? 0,
            workshopStatus: buildResult?.status ?? (newStatus === "APPROVED" ? "AWAITING_APPROVAL" : undefined),
            ...(newStatus === "APPROVED" && !buildResult?.success
                ? { autoBuildError: buildResult?.error || "Auto-build failed. Check server logs." }
                : {}),
        });
    } catch (error) {
        console.error("Approval respond POST error:", error);

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

/**
 * Generate a signed token for one-click approve/deny links
 */
function generateToken(approvalId: string, action: string, expiresAt?: number): string {
    const secret = process.env.APPROVAL_LINK_SECRET;

    if (!secret) {
        throw new Error("APPROVAL_LINK_SECRET environment variable is required for secure approval links");
    }

    const payload = expiresAt
        ? `${approvalId}:${action}:${expiresAt}`
        : `${approvalId}:${action}`;

    return crypto
        .createHmac("sha256", secret)
        .update(payload)
        .digest("hex")
        .substring(0, 32);
}

function safeTokenCompare(received: string, expected: string): boolean {
    const receivedBuffer = Buffer.from(received);
    const expectedBuffer = Buffer.from(expected);

    if (receivedBuffer.length !== expectedBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

/**
 * Generate signed approval links for email notifications
 */
export function generateApprovalLinks(approvalId: string): {
    approveUrl: string;
    denyUrl: string;
} {
    const baseUrl = `${process.env.APP_URL}/api/approvals/${approvalId}/respond`;
    const configuredTtl = Number.parseInt(
        process.env.APPROVAL_LINK_TTL_SECONDS || `${DEFAULT_APPROVAL_LINK_TTL_SECONDS}`,
        10
    );
    const ttlSeconds = Number.isFinite(configuredTtl) && configuredTtl > 0
        ? Math.min(configuredTtl, MAX_APPROVAL_LINK_TTL_SECONDS)
        : DEFAULT_APPROVAL_LINK_TTL_SECONDS;
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;

    const approveToken = generateToken(approvalId, "approve", expiresAt);
    const denyToken = generateToken(approvalId, "deny", expiresAt);

    return {
        approveUrl: `${baseUrl}?action=approve&expires=${expiresAt}&token=${approveToken}`,
        denyUrl: `${baseUrl}?action=deny&expires=${expiresAt}&token=${denyToken}`,
    };
}
