/**
 * BUG-06–08: tests for approval-thread helpers.
 *
 *   formatApprovalMessage() — pure text builder; covers all 8 message types.
 *   appendApprovalMessage() — persistence helper for the 5 update-sites that
 *     already run inside a $transaction.
 */

import {
    formatApprovalMessage,
    appendApprovalMessage,
} from "@/lib/approvals/approval-thread";

describe("formatApprovalMessage", () => {
    it("REQUEST: includes amount + note when both present", () => {
        expect(
            formatApprovalMessage({ type: "REQUEST", amountCents: 20000, note: "rural rate" })
        ).toBe("Requested $200.00 — rural rate");
    });

    it("REQUEST: includes amount alone when no note", () => {
        expect(formatApprovalMessage({ type: "REQUEST", amountCents: 20000 })).toBe(
            "Requested $200.00"
        );
    });

    it("COUNTER_OFFER: includes amount + note when both present", () => {
        expect(
            formatApprovalMessage({ type: "COUNTER_OFFER", amountCents: 25000, note: "policy floor" })
        ).toBe("Counter-offer: $250.00 — policy floor");
    });

    it("COUNTER_OFFER: amount alone when no note", () => {
        expect(formatApprovalMessage({ type: "COUNTER_OFFER", amountCents: 25000 })).toBe(
            "Counter-offer: $250.00"
        );
    });

    it("APPROVED with amount: 'Approved at $X.XX'", () => {
        expect(
            formatApprovalMessage({ type: "APPROVED", amountCents: 25000, note: "good" })
        ).toBe("Approved at $250.00 — good");
    });

    it("APPROVED without amount: just 'Approved'", () => {
        expect(formatApprovalMessage({ type: "APPROVED" })).toBe("Approved");
    });

    it("DENIED: includes reason text", () => {
        expect(
            formatApprovalMessage({ type: "DENIED", note: "out of scope" })
        ).toBe("Denied: out of scope");
    });

    it("DENIED: empty reason is preserved as 'Denied:' with empty tail", () => {
        expect(formatApprovalMessage({ type: "DENIED" })).toBe("Denied:");
    });

    it("INFO_REQUEST: text is the admin question (note)", () => {
        expect(
            formatApprovalMessage({ type: "INFO_REQUEST", note: "what is the venue?" })
        ).toBe("what is the venue?");
    });

    it("INFO_RESPONSE: text is the coach reply (note)", () => {
        expect(
            formatApprovalMessage({ type: "INFO_RESPONSE", note: "venue is ABC Hall" })
        ).toBe("venue is ABC Hall");
    });

    it("COUNTER_ACCEPT: 'Accepted counter-offer of $X.XX'", () => {
        expect(
            formatApprovalMessage({ type: "COUNTER_ACCEPT", amountCents: 25000 })
        ).toBe("Accepted counter-offer of $250.00");
    });

    it("COUNTER_DECLINE: includes reason if present", () => {
        expect(
            formatApprovalMessage({ type: "COUNTER_DECLINE", note: "below my floor" })
        ).toBe("below my floor");
    });

    it("COUNTER_DECLINE: default text when no reason", () => {
        expect(formatApprovalMessage({ type: "COUNTER_DECLINE" })).toBe(
            "Declined counter-offer"
        );
    });

    it("COUNTER_COUNTER: 'Counter-offer: $X.XX' with optional note", () => {
        expect(
            formatApprovalMessage({ type: "COUNTER_COUNTER", amountCents: 22500 })
        ).toBe("Counter-offer: $225.00");
        expect(
            formatApprovalMessage({ type: "COUNTER_COUNTER", amountCents: 22500, note: "trying again" })
        ).toBe("Counter-offer: $225.00 — trying again");
    });
});

describe("appendApprovalMessage", () => {
    it("creates a non-synthetic ApprovalMessage row via the given client", async () => {
        const create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
            id: "msg-1",
            ...data,
        }));
        const tx = { approvalMessage: { create } } as never;

        await appendApprovalMessage(tx, {
            approvalId: "ap-1",
            from: "ADMIN",
            text: "Approved at $250.00",
        });

        expect(create).toHaveBeenCalledTimes(1);
        const arg = create.mock.calls[0]![0];
        expect(arg.data).toEqual({
            approvalId: "ap-1",
            from: "ADMIN",
            text: "Approved at $250.00",
        });
        // Live writers don't pass synthetic — the column defaults to false.
        expect(arg.data.synthetic).toBeUndefined();
    });
});
