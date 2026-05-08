/**
 * ENH-MAY6-10: helpers for per-recipient WorkflowStepExecution rows.
 *
 * Top-level rows have parentId=null (parent rollup OR legacy single-row
 * non-attendee steps). Per-recipient child rows have parentId set + non-null
 * registrationId + non-null recipientEmail.
 *
 *   recordRecipientExecution() — upsert one child row keyed by
 *     (parentId, registrationId). Idempotent across replays.
 *   finalizeParentRollup()    — read children + set parent status from
 *     precedence: any FAILED → FAILED; else any SENT → SENT;
 *     else SKIPPED. No children → no-op.
 */

import type { Prisma } from "@prisma/client";
import type { db } from "@/lib/db";

type Client = Prisma.TransactionClient | typeof db;

export type RecipientStatus = "SENT" | "FAILED" | "SKIPPED";

export type RecordRecipientArgs = {
    parentId: string;
    stepId: string;
    workshopId: string;
    registrationId: string;
    recipientEmail: string;
    status: RecipientStatus;
    errorMessage?: string;
};

function requireNonEmpty(name: string, value: unknown): asserts value is string {
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(
            `recordRecipientExecution: ${name} must be a non-empty string`
        );
    }
}

export async function recordRecipientExecution(
    client: Client,
    args: RecordRecipientArgs
): Promise<void> {
    requireNonEmpty("parentId", args.parentId);
    requireNonEmpty("registrationId", args.registrationId);
    requireNonEmpty("recipientEmail", args.recipientEmail);

    const data = {
        parentId: args.parentId,
        stepId: args.stepId,
        workshopId: args.workshopId,
        registrationId: args.registrationId,
        recipientEmail: args.recipientEmail,
        status: args.status,
        executedAt: new Date(),
        errorMessage: args.errorMessage,
    };

    await client.workflowStepExecution.upsert({
        where: {
            WorkflowStepExecution_parent_recipient_unique: {
                parentId: args.parentId,
                registrationId: args.registrationId,
            },
        },
        create: data,
        update: {
            status: args.status,
            recipientEmail: args.recipientEmail,
            executedAt: new Date(),
            errorMessage: args.errorMessage,
        },
    });
}

/**
 * Computes parent rollup status from children and writes it. Precedence:
 *
 *   any FAILED → FAILED
 *   else any SENT → SENT
 *   else (all SKIPPED) → SKIPPED
 *   no children → no-op (parent retains pre-rollup status)
 */
export async function finalizeParentRollup(
    client: Client,
    parentId: string
): Promise<void> {
    const children = await client.workflowStepExecution.findMany({
        where: { parentId },
        select: { status: true },
    });

    if (children.length === 0) return;

    let rollup: RecipientStatus = "SKIPPED";
    if (children.some((c) => c.status === "FAILED")) {
        rollup = "FAILED";
    } else if (children.some((c) => c.status === "SENT")) {
        rollup = "SENT";
    }

    await client.workflowStepExecution.update({
        where: { id: parentId },
        data: { status: rollup, executedAt: new Date() },
    });
}
