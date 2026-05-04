/**
 * BUG-09: tests for the two workflow-execution recording helpers.
 *
 *   scheduleWorkflowExecution() — creates a SCHEDULED row pre-sleep so the
 *     portal Workflow Status card shows the future scheduledFor immediately.
 *   recordWorkflowExecution()   — transitions a SCHEDULED row to a terminal
 *     status (preserving scheduledFor), or creates a fresh terminal row for
 *     the immediate-fire path.
 */

import {
    scheduleWorkflowExecution,
    recordWorkflowExecution,
} from "@/lib/workflows/record-workflow-execution";

type MockTx = {
    workflowStepExecution: {
        create: jest.Mock;
        update: jest.Mock;
    };
};

function makeTx(): MockTx {
    return {
        workflowStepExecution: {
            create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
                id: "exec-new",
                ...data,
            })),
            update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
                id: where.id,
                ...data,
            })),
        },
    };
}

describe("scheduleWorkflowExecution", () => {
    it("creates a SCHEDULED row with the future scheduledFor and returns its id", async () => {
        const tx = makeTx();
        const sendAt = new Date("2026-05-02T08:00:00Z");

        const result = await scheduleWorkflowExecution(tx as never, {
            stepId: "step-1",
            workshopId: "ws-1",
            scheduledFor: sendAt,
        });

        expect(tx.workflowStepExecution.create).toHaveBeenCalledTimes(1);
        const arg = tx.workflowStepExecution.create.mock.calls[0]![0];
        expect(arg.data).toEqual({
            stepId: "step-1",
            workshopId: "ws-1",
            status: "SCHEDULED",
            scheduledFor: sendAt,
        });
        expect(result).toEqual({ id: "exec-new" });
    });
});

describe("recordWorkflowExecution", () => {
    it("transitions an existing SCHEDULED row to terminal status while preserving scheduledFor", async () => {
        const tx = makeTx();
        const sendAt = new Date("2026-05-02T08:00:00Z");
        const executedAt = new Date("2026-05-02T08:00:05Z");

        await recordWorkflowExecution(tx as never, {
            executionId: "exec-existing",
            stepId: "step-1",
            workshopId: "ws-1",
            status: "SENT",
            scheduledFor: sendAt,
            executedAt,
        });

        expect(tx.workflowStepExecution.update).toHaveBeenCalledTimes(1);
        expect(tx.workflowStepExecution.create).not.toHaveBeenCalled();
        const arg = tx.workflowStepExecution.update.mock.calls[0]![0];
        expect(arg.where).toEqual({ id: "exec-existing" });
        expect(arg.data.status).toBe("SENT");
        expect(arg.data.scheduledFor).toBe(sendAt);
        expect(arg.data.executedAt).toBe(executedAt);
    });

    it("creates a fresh terminal row when no executionId is provided (immediate-fire path)", async () => {
        const tx = makeTx();
        const now = new Date("2026-05-02T08:00:05Z");

        await recordWorkflowExecution(tx as never, {
            stepId: "step-1",
            workshopId: "ws-1",
            status: "SENT",
            scheduledFor: now,
            executedAt: now,
        });

        expect(tx.workflowStepExecution.create).toHaveBeenCalledTimes(1);
        expect(tx.workflowStepExecution.update).not.toHaveBeenCalled();
        const arg = tx.workflowStepExecution.create.mock.calls[0]![0];
        expect(arg.data.scheduledFor).toBe(now);
        expect(arg.data.executedAt).toBe(now);
        expect(arg.data.status).toBe("SENT");
    });

    it("forwards optional error + attempts fields on a fresh FAILED row", async () => {
        const tx = makeTx();
        const now = new Date("2026-05-02T08:00:05Z");

        await recordWorkflowExecution(tx as never, {
            stepId: "step-1",
            workshopId: "ws-1",
            status: "FAILED",
            scheduledFor: now,
            executedAt: now,
            error: "SMTP failed",
            attempts: 1,
        });

        const arg = tx.workflowStepExecution.create.mock.calls[0]![0];
        expect(arg.data.errorMessage).toBe("SMTP failed");
        expect(arg.data.attempts).toBe(1);
        expect(arg.data.status).toBe("FAILED");
    });
});
