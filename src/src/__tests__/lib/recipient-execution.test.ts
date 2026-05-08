/**
 * ENH-MAY6-10: helpers for per-recipient WorkflowStepExecution rows.
 *
 *   recordRecipientExecution() — upsert one child row keyed by
 *     (parentId, registrationId).
 *   finalizeParentRollup()    — read children, set parent's status from
 *     precedence: any FAILED → FAILED; else any SENT → SENT; else SKIPPED.
 */

import {
    recordRecipientExecution,
    finalizeParentRollup,
} from "@/lib/workflows/recipient-execution";

describe("recordRecipientExecution", () => {
    it("upserts a child row keyed by (parentId, registrationId)", async () => {
        const upsert = jest.fn(async () => ({ id: "child-1" }));
        const tx = { workflowStepExecution: { upsert } } as never;

        await recordRecipientExecution(tx, {
            parentId: "parent-1",
            stepId: "step-1",
            workshopId: "ws-1",
            registrationId: "reg-1",
            recipientEmail: "alice@example.com",
            status: "SENT",
        });

        expect(upsert).toHaveBeenCalledTimes(1);
        const arg = upsert.mock.calls[0]![0];
        expect(arg.where).toEqual({
            WorkflowStepExecution_parent_recipient_unique: {
                parentId: "parent-1",
                registrationId: "reg-1",
            },
        });
        expect(arg.create).toMatchObject({
            parentId: "parent-1",
            stepId: "step-1",
            workshopId: "ws-1",
            registrationId: "reg-1",
            recipientEmail: "alice@example.com",
            status: "SENT",
        });
        expect(arg.update).toMatchObject({
            status: "SENT",
            recipientEmail: "alice@example.com",
        });
    });

    it("rejects missing parentId / registrationId / recipientEmail", async () => {
        const upsert = jest.fn();
        const tx = { workflowStepExecution: { upsert } } as never;

        await expect(
            recordRecipientExecution(tx, {
                parentId: "",
                stepId: "step-1",
                workshopId: "ws-1",
                registrationId: "reg-1",
                recipientEmail: "alice@example.com",
                status: "SENT",
            })
        ).rejects.toThrow(/parentId/);

        expect(upsert).not.toHaveBeenCalled();
    });

    it("captures errorMessage for FAILED/SKIPPED", async () => {
        const upsert = jest.fn(async () => ({ id: "child-1" }));
        const tx = { workflowStepExecution: { upsert } } as never;

        await recordRecipientExecution(tx, {
            parentId: "parent-1",
            stepId: "step-1",
            workshopId: "ws-1",
            registrationId: "reg-1",
            recipientEmail: "bob@example.com",
            status: "FAILED",
            errorMessage: "smtp_send_failed",
        });

        const arg = upsert.mock.calls[0]![0];
        expect(arg.create.errorMessage).toBe("smtp_send_failed");
        expect(arg.update.errorMessage).toBe("smtp_send_failed");
    });
});

describe("finalizeParentRollup", () => {
    function txFor(children: Array<{ status: string }>) {
        const findMany = jest.fn(async () => children);
        const update = jest.fn(async () => ({}));
        const tx = {
            workflowStepExecution: { findMany, update },
        } as never;
        return { tx, findMany, update };
    }

    it("any FAILED → parent FAILED (precedence top)", async () => {
        const { tx, update } = txFor([
            { status: "SENT" },
            { status: "FAILED" },
            { status: "SENT" },
        ]);
        await finalizeParentRollup(tx, "parent-1");
        expect(update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "parent-1" },
                data: expect.objectContaining({ status: "FAILED" }),
            })
        );
    });

    it("any SENT (no FAILED) → parent SENT", async () => {
        const { tx, update } = txFor([
            { status: "SENT" },
            { status: "SKIPPED" },
        ]);
        await finalizeParentRollup(tx, "parent-1");
        expect(update.mock.calls[0]![0].data.status).toBe("SENT");
    });

    it("all SKIPPED → parent SKIPPED", async () => {
        const { tx, update } = txFor([
            { status: "SKIPPED" },
            { status: "SKIPPED" },
        ]);
        await finalizeParentRollup(tx, "parent-1");
        expect(update.mock.calls[0]![0].data.status).toBe("SKIPPED");
    });

    it("no children → no-op (parent left unchanged)", async () => {
        const { tx, update } = txFor([]);
        await finalizeParentRollup(tx, "parent-1");
        expect(update).not.toHaveBeenCalled();
    });
});
