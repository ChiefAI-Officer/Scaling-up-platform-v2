import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import crypto from "crypto";

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

        // Validate signed token
        const expectedToken = generateToken(approval.id, action);
        if (token !== expectedToken) {
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
        const { id } = await params;
        const body = await request.json();
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
                respondedBy: "ADMIN_DASHBOARD", // TODO: Use actual user ID
                respondedAt: new Date(),
                responseReason: reason,
            }
        });

        await logAudit({
            entityType: "ApprovalQueue",
            entityId: id,
            action,
            performedBy: "ADMIN",
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
function generateToken(approvalId: string, action: string): string {
    const secret = process.env.APPROVAL_LINK_SECRET;

    if (!secret) {
        throw new Error("APPROVAL_LINK_SECRET environment variable is required for secure approval links");
    }

    return crypto
        .createHmac("sha256", secret)
        .update(`${approvalId}:${action}`)
        .digest("hex")
        .substring(0, 32);
}

/**
 * Generate signed approval links for email notifications
 */
export function generateApprovalLinks(approvalId: string): {
    approveUrl: string;
    denyUrl: string;
} {
    const baseUrl = `${process.env.APP_URL}/api/approvals/${approvalId}/respond`;
    const approveToken = generateToken(approvalId, "approve");
    const denyToken = generateToken(approvalId, "deny");

    return {
        approveUrl: `${baseUrl}?action=approve&token=${approveToken}`,
        denyUrl: `${baseUrl}?action=deny&token=${denyToken}`,
    };
}
