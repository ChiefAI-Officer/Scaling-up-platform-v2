/**
 * BUG-09 (May 4 2026): two helpers that own the WorkflowStepExecution
 * lifecycle. Used by inngest/functions/execute-workflow.ts at every site
 * that previously wrote `scheduledFor: new Date()` (which collapsed
 * future-scheduled work to "now" in the portal Workflow Status card).
 *
 *   scheduleWorkflowExecution() — creates a SCHEDULED row pre-sleep so the
 *     portal renderer (status === "SCHEDULED" branch) shows the future
 *     scheduledFor immediately after assignment, before the step fires.
 *
 *   recordWorkflowExecution()   — transitions an existing SCHEDULED row to
 *     a terminal status (SENT|SKIPPED|FAILED) preserving the originally-
 *     computed scheduledFor; or creates a fresh terminal row for the
 *     ON_REGISTRATION/ON_APPROVAL immediate-fire path.
 */

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

type Client = Prisma.TransactionClient | typeof db;

export type ScheduleArgs = {
    stepId: string;
    workshopId: string;
    scheduledFor: Date;
};

export async function scheduleWorkflowExecution(
    client: Client,
    args: ScheduleArgs
): Promise<{ id: string }> {
    const created = await client.workflowStepExecution.create({
        data: {
            stepId: args.stepId,
            workshopId: args.workshopId,
            status: "SCHEDULED",
            scheduledFor: args.scheduledFor,
        },
        select: { id: true },
    });
    return { id: created.id };
}

export type RecordArgs = {
    executionId?: string;
    stepId: string;
    workshopId: string;
    status: "SENT" | "SKIPPED" | "FAILED";
    scheduledFor: Date;
    executedAt?: Date;
    error?: string;
    attempts?: number;
};

export async function recordWorkflowExecution(
    client: Client,
    args: RecordArgs
): Promise<void> {
    const data: Record<string, unknown> = {
        status: args.status,
        scheduledFor: args.scheduledFor,
    };
    if (args.executedAt !== undefined) data.executedAt = args.executedAt;
    if (args.error !== undefined) data.errorMessage = args.error;
    if (args.attempts !== undefined) data.attempts = args.attempts;

    if (args.executionId) {
        await client.workflowStepExecution.update({
            where: { id: args.executionId },
            data,
        });
        return;
    }

    await client.workflowStepExecution.create({
        data: {
            stepId: args.stepId,
            workshopId: args.workshopId,
            ...data,
        },
    });
}
