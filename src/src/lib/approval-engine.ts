/**
 * Approval Engine
 * Evaluates requests and determines if they can be auto-approved
 * or need to be routed to Suzanne/Jeff for manual review.
 * 
 * Approval Triggers (from PRD):
 * - Workshop Request: Auto-approve if standard pricing AND certification ≥85%
 * - Custom Pricing: Never auto-approve → Suzanne
 * - Cancellation: Never auto-approve → Suzanne
 * - Date Change: Never auto-approve → Suzanne
 * - Refund > $250: Never auto-approve → Suzanne
 */

import { db } from "@/lib/db";
import { verifyCertification } from "@/services/circle";
import { sendApprovalRequest, sendEscalation } from "@/services/notifications";
import { logAudit } from "@/lib/audit";
import { formatApprovalMessage } from "@/lib/approvals/approval-thread";

export type ApprovalType =
    | "WORKSHOP_REQUEST"
    | "CUSTOM_PRICING"
    | "CANCELLATION"
    | "DATE_CHANGE"
    | "REFUND";

export interface ApprovalEvaluationInput {
    type: ApprovalType;
    coachId: string;
    coachEmail: string;
    workshopId?: string;
    workshopTypeSlug?: string;
    amount?: number; // For refunds, in cents
    details: string;
    requestedBy: string;
    customPricingNotes?: string;
    newPriceCents?: number;
    workshopCode?: string;
}

export interface ApprovalEvaluationResult {
    autoApproved: boolean;
    reason: string;
    routeTo?: string;
    approvalId?: string;
}

// Thresholds
// CHG-02 (Jeff Apr 30 2026, "101 please"): set to 101 to effectively disable auto-approve
// (Circle's confidence score never exceeds 100). Code path preserved for re-enable — drop the number.
const CERTIFICATION_CONFIDENCE_THRESHOLD = 101;
const REFUND_AUTO_LIMIT_CENTS = 25000; // $250

/**
 * Evaluate an approval request and determine routing
 */
export async function evaluateApproval(
    input: ApprovalEvaluationInput
): Promise<ApprovalEvaluationResult> {

    // Types that NEVER auto-approve
    const manualOnlyTypes: ApprovalType[] = [
        "CUSTOM_PRICING",
        "CANCELLATION",
        "DATE_CHANGE"
    ];

    if (manualOnlyTypes.includes(input.type)) {
        return await createManualApproval(input, `${input.type} always requires manual approval`);
    }

    // Refund logic: auto-approve if <= $250
    if (input.type === "REFUND") {
        if (input.amount && input.amount <= REFUND_AUTO_LIMIT_CENTS) {
            return {
                autoApproved: true,
                reason: `Refund of $${(input.amount / 100).toFixed(2)} is within auto-approval limit`
            };
        } else {
            return await createManualApproval(
                input,
                `Refund of $${((input.amount || 0) / 100).toFixed(2)} exceeds $250 limit`
            );
        }
    }

    // Workshop Request: Check certification confidence
    if (input.type === "WORKSHOP_REQUEST") {
        const certResult = await verifyCertification(
            input.coachEmail,
            input.workshopTypeSlug || "general"
        );

        if (certResult.verified && certResult.confidence >= CERTIFICATION_CONFIDENCE_THRESHOLD) {
            // Auto-approve
            await logAudit({
                entityType: "ApprovalRequest",
                entityId: `auto-${Date.now()}`,
                action: "APPROVE",
                performedBy: "SYSTEM",
                changes: {
                    type: input.type,
                    coachId: input.coachId,
                    reason: "Auto-approved: certification verified",
                    confidence: certResult.confidence,
                }
            });

            return {
                autoApproved: true,
                reason: `Auto-approved: Coach certification verified (${certResult.confidence}% confidence)`
            };
        } else {
            // Route to Suzanne
            const issues = certResult.issues?.join(", ") || "Low confidence score";
            return await createManualApproval(
                input,
                `Certification check: ${issues}. Confidence: ${certResult.confidence}%`
            );
        }
    }

    // Default: route to manual approval
    return await createManualApproval(input, "Unknown request type");
}

/**
 * Create a manual approval request and notify Suzanne
 */
async function createManualApproval(
    input: ApprovalEvaluationInput,
    reason: string
): Promise<ApprovalEvaluationResult> {
    const routeTo = process.env.ADMIN_EMAIL || "suzanne@scalingup.com";

    // BUG-06–08: seed the initial coach message inline for CUSTOM_PRICING so
    // the thread is complete from the moment the approval lands. Prisma
    // nested-create is atomic with the parent insert; no $transaction needed.
    const seedMessages =
        input.type === "CUSTOM_PRICING"
            ? {
                  create: [
                      {
                          from: "COACH",
                          text: formatApprovalMessage({
                              type: "REQUEST",
                              amountCents: input.newPriceCents ?? input.amount ?? 0,
                              note: input.customPricingNotes,
                          }),
                      },
                  ],
              }
            : undefined;

    // Create approval queue record
    const approval = await db.approvalQueue.create({
        data: {
            type: input.type,
            status: "PENDING",
            requestData: JSON.stringify(input),
            coachId: input.coachId,
            workshopId: input.workshopId,
            requestedBy: input.requestedBy,
            requestedAt: new Date(),
            notes: input.customPricingNotes ? input.customPricingNotes : undefined,
            ...(seedMessages ? { messages: seedMessages } : {}),
        }
    });

    // Send notification to Suzanne
    await sendApprovalRequest({
        id: approval.id,
        type: input.type,
        coachName: input.requestedBy,
        details: input.details,
        requestedAt: new Date(),
        amount: input.amount,
    });

    // Audit log
    await logAudit({
        entityType: "ApprovalQueue",
        entityId: approval.id,
        action: "CREATE",
        performedBy: input.requestedBy,
        changes: { type: input.type, reason }
    });

    return {
        autoApproved: false,
        reason,
        routeTo,
        approvalId: approval.id,
    };
}

/**
 * Check for stale approvals and escalate
 * Should be called by a cron/scheduled Inngest function
 */
export async function checkAndEscalateStaleApprovals(): Promise<number> {
    const ESCALATION_HOURS = 24;
    const escalationThreshold = new Date(Date.now() - ESCALATION_HOURS * 60 * 60 * 1000);

    const staleApprovals = await db.approvalQueue.findMany({
        where: {
            status: "PENDING",
            requestedAt: { lt: escalationThreshold },
            escalatedAt: null, // Not already escalated
        }
    });

    const escalateTo = process.env.ESCALATION_EMAIL || "jeff@scalingup.com";

    for (const approval of staleApprovals) {
        await sendEscalation(
            {
                id: approval.id,
                type: approval.type,
                coachName: approval.requestedBy || "Unknown",
                details: approval.requestData,
                requestedAt: approval.requestedAt,
            },
            escalateTo
        );

        await db.approvalQueue.update({
            where: { id: approval.id },
            data: { escalatedAt: new Date() }
        });

        await logAudit({
            entityType: "ApprovalQueue",
            entityId: approval.id,
            action: "UPDATE",
            performedBy: "SYSTEM",
            changes: { action: "ESCALATED", escalatedTo: escalateTo }
        });
    }

    return staleApprovals.length;
}

const approvalEngine = {
    evaluateApproval,
    checkAndEscalateStaleApprovals,
};

export default approvalEngine;
