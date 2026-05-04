/**
 * BUG-06–08 (May 4 2026): single source of truth for approval-thread message
 * shape and persistence. Used by every approval mutation site (initial coach
 * request, INFO_REQUESTED, COUNTER_OFFER, APPROVED, DENIED, INFO_RESPONSE,
 * COUNTER_ACCEPT, COUNTER_DECLINE, COUNTER_COUNTER) so the resulting
 * ApprovalThread shows a complete decision trail.
 *
 * Actor identity is intentionally role-level only ("ADMIN" | "COACH"). Per
 * Jeff's Apr 30 standing meeting (transcript 7:50): role distinguishes the
 * actor enough; specific-person identity in the message text would leak
 * staff emails to coaches and rot on staff turnover.
 */

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

type Client = Prisma.TransactionClient | typeof db;

export type ApprovalMessageType =
    | "REQUEST"
    | "INFO_REQUEST"
    | "INFO_RESPONSE"
    | "COUNTER_OFFER"
    | "APPROVED"
    | "DENIED"
    | "COUNTER_ACCEPT"
    | "COUNTER_DECLINE"
    | "COUNTER_COUNTER";

export type FormatInput = {
    type: ApprovalMessageType;
    amountCents?: number;
    note?: string;
};

function formatDollars(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
}

function withNote(base: string, note?: string): string {
    if (!note) return base;
    return `${base} — ${note}`;
}

/**
 * Returns the canonical text body for an approval-thread message. Used at
 * every mutation site (nested writes during create + appendApprovalMessage
 * during update) so the wording stays uniform across sources.
 */
export function formatApprovalMessage(input: FormatInput): string {
    switch (input.type) {
        case "REQUEST":
            return withNote(`Requested ${formatDollars(input.amountCents ?? 0)}`, input.note);

        case "COUNTER_OFFER":
            return withNote(
                `Counter-offer: ${formatDollars(input.amountCents ?? 0)}`,
                input.note
            );

        case "APPROVED":
            if (typeof input.amountCents === "number") {
                return withNote(`Approved at ${formatDollars(input.amountCents)}`, input.note);
            }
            return withNote("Approved", input.note);

        case "DENIED":
            return `Denied:${input.note ? " " + input.note : ""}`;

        case "INFO_REQUEST":
        case "INFO_RESPONSE":
            return input.note ?? "";

        case "COUNTER_ACCEPT":
            return `Accepted counter-offer of ${formatDollars(input.amountCents ?? 0)}`;

        case "COUNTER_DECLINE":
            return input.note ?? "Declined counter-offer";

        case "COUNTER_COUNTER":
            return withNote(
                `Counter-offer: ${formatDollars(input.amountCents ?? 0)}`,
                input.note
            );
    }
}

export type AppendArgs = {
    approvalId: string;
    from: "ADMIN" | "COACH";
    text: string;
};

/**
 * Persistence helper for the 5 update-sites that already have a $transaction.
 * Live writers MUST NOT set `synthetic` — the column defaults to false. Only
 * the one-time backfill script writes synthetic: true.
 */
export async function appendApprovalMessage(
    client: Client,
    args: AppendArgs
): Promise<void> {
    await client.approvalMessage.create({
        data: {
            approvalId: args.approvalId,
            from: args.from,
            text: args.text,
        },
    });
}
