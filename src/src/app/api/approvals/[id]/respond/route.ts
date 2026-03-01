import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import crypto from "crypto";
import { getApiActor, isPrivilegedRole } from "@/lib/authorization";
import { sendWorkshopApprovedEmail, sendWorkshopDeniedEmail } from "@/services/notifications";
import { inngest } from "@/inngest/client";

const DEFAULT_APPROVAL_LINK_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const MAX_APPROVAL_LINK_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days guardrail

// Request schema
const RespondSchema = z.object({
    action: z.enum(["APPROVE", "DENY"]),
    reason: z.string().optional(),
    token: z.string().optional(), // For one-click links
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

        await db.approvalQueue.update({
            where: { id },
            data: {
                status: newStatus,
                respondedBy: "EMAIL_LINK",
                respondedAt: new Date(),
            }
        });

        // JV-20: When approving a workshop request, advance the workshop status
        if (newStatus === "APPROVED" && approval.workshopId) {
            await db.workshop.update({
                where: { id: approval.workshopId },
                data: { status: "AWAITING_APPROVAL" },
            });
        }

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

        // Sprint 5: Emit workshop/approved event to trigger auto-build
        if (newStatus === "APPROVED" && approval.workshopId) {
            await inngest.send({
                name: "workshop/approved",
                data: { approvalId: id, workshopId: approval.workshopId, coachId: approval.coachId || "" },
            }).catch((err) => console.error("Failed to emit workshop/approved event:", err));
        }

        await logAudit({
            entityType: "ApprovalQueue",
            entityId: id,
            action: action === "approve" ? "APPROVE" : "DENY",
            performedBy: "EMAIL_LINK",
            changes: { previousStatus: "PENDING", newStatus }
        });

        // Return success HTML page
        return new NextResponse(
            `<html>
        <head><title>Request ${newStatus}</title></head>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: ${action === 'approve' ? '#38a169' : '#e53e3e'};">
            ${action === 'approve' ? '✅ Approved' : '❌ Denied'}
          </h1>
          <p>The request has been ${newStatus.toLowerCase()}.</p>
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
        const { action, reason } = RespondSchema.parse(body);

        const approval = await db.approvalQueue.findUnique({
            where: { id }
        });

        if (!approval) {
            return NextResponse.json(
                { error: "Approval not found" },
                { status: 404 }
            );
        }

        if (approval.status !== "PENDING") {
            return NextResponse.json(
                { error: `Approval already ${approval.status.toLowerCase()}` },
                { status: 400 }
            );
        }

        const newStatus = action === "APPROVE" ? "APPROVED" : "DENIED";

        await db.approvalQueue.update({
            where: { id },
            data: {
                status: newStatus,
                respondedBy: actor.email,
                respondedAt: new Date(),
                responseReason: reason,
            }
        });

        // JV-20: When approving a workshop request, advance the workshop status
        if (newStatus === "APPROVED" && approval.workshopId) {
            await db.workshop.update({
                where: { id: approval.workshopId },
                data: { status: "AWAITING_APPROVAL" },
            });
        }

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

        // Sprint 5: Emit workshop/approved event to trigger auto-build
        if (newStatus === "APPROVED" && approval.workshopId) {
            await inngest.send({
                name: "workshop/approved",
                data: { approvalId: id, workshopId: approval.workshopId, coachId: approval.coachId || "" },
            }).catch((err) => console.error("[INNGEST] Failed to emit workshop/approved — check INNGEST_EVENT_KEY:", err));
        }

        await logAudit({
            entityType: "ApprovalQueue",
            entityId: id,
            action,
            performedBy: actor.email,
            changes: { previousStatus: "PENDING", newStatus, reason }
        });

        return NextResponse.json({
            success: true,
            status: newStatus,
            message: `Request ${newStatus.toLowerCase()}`
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
