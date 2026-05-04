/**
 * BUG-06–08 (May 4 2026): one-time backfill that seeds missing approval-thread
 * messages for existing CUSTOM_PRICING approvals. After CHG-01 + the helper
 * wire-ups, every NEW CUSTOM_PRICING approval lands a complete thread, but
 * approvals created before this sprint have no messages. The portal
 * Conversation History card looks broken until we seed them.
 *
 * Strategy:
 *   - Filter to type = "CUSTOM_PRICING".
 *   - Seed initial COACH "Requested $X.XX" message from requestData.newPriceCents.
 *   - Seed terminal ADMIN "Denied: <reason>" message for DENIED approvals.
 *   - Skip APPROVED + COUNTER_DECLINE: ApprovalQueue clears the relevant
 *     fields on those terminal paths, so we'd guess at the amount. A missing
 *     message is safer than a wrong one.
 *   - Synthetic dup-check is keyed on `synthetic = true` AND text shape, so
 *     re-runs are safe and existing live INFO_RESPONSE messages don't false-match.
 *
 * Required: --dry-run on first invocation. Operator should eyeball ~10 sample
 * rows before running for real.
 *
 * Run: npx tsx scripts/backfill-approval-messages.ts --dry-run
 *      npx tsx scripts/backfill-approval-messages.ts
 *
 * Rollback: DELETE FROM "approval_messages" WHERE "synthetic" = true;
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Plan = {
    approvalId: string;
    seeds: Array<{
        from: "ADMIN" | "COACH";
        text: string;
        createdAt: Date;
        kind: "initial" | "terminal";
    }>;
};

function dollars(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
}

function isFiniteNumber(v: unknown): v is number {
    return typeof v === "number" && Number.isFinite(v);
}

async function buildPlan(cutoff: Date): Promise<Plan[]> {
    const approvals = await prisma.approvalQueue.findMany({
        where: {
            type: "CUSTOM_PRICING",
            requestedAt: { lt: cutoff },
        },
        select: {
            id: true,
            status: true,
            requestData: true,
            requestedAt: true,
            respondedAt: true,
            responseReason: true,
            notes: true,
        },
        orderBy: { requestedAt: "asc" },
    });

    const plans: Plan[] = [];

    for (const a of approvals) {
        const seeds: Plan["seeds"] = [];

        // Initial COACH "Requested $X" seed
        let newPriceCents: number | null = null;
        let customPricingNotes: string | null = null;
        try {
            const req = JSON.parse(a.requestData ?? "{}") as Record<string, unknown>;
            if (isFiniteNumber(req.newPriceCents)) newPriceCents = req.newPriceCents;
            if (typeof req.customPricingNotes === "string") customPricingNotes = req.customPricingNotes;
        } catch {
            /* malformed JSON — skip the initial seed for this row */
        }

        // Fallback to `notes` column when requestData lacks the note
        if (!customPricingNotes && a.notes) customPricingNotes = a.notes;

        if (newPriceCents !== null) {
            const initialText = customPricingNotes
                ? `Requested ${dollars(newPriceCents)} — ${customPricingNotes}`
                : `Requested ${dollars(newPriceCents)}`;

            const dup = await prisma.approvalMessage.findFirst({
                where: {
                    approvalId: a.id,
                    synthetic: true,
                    text: { startsWith: "Requested $" },
                },
            });
            if (!dup) {
                seeds.push({
                    from: "COACH",
                    text: initialText,
                    createdAt: a.requestedAt,
                    kind: "initial",
                });
            }
        }

        // Terminal ADMIN seed: only DENIED is safe to reconstruct
        if (a.status === "DENIED" && a.respondedAt) {
            const terminalText = `Denied:${a.responseReason ? " " + a.responseReason : ""}`;

            const dupSynthetic = await prisma.approvalMessage.findFirst({
                where: {
                    approvalId: a.id,
                    synthetic: true,
                    text: { startsWith: "Denied:" },
                },
            });
            const dupLive = await prisma.approvalMessage.findFirst({
                where: {
                    approvalId: a.id,
                    from: "ADMIN",
                    createdAt: a.respondedAt,
                },
            });
            if (!dupSynthetic && !dupLive) {
                seeds.push({
                    from: "ADMIN",
                    text: terminalText,
                    createdAt: a.respondedAt,
                    kind: "terminal",
                });
            }
        }

        if (seeds.length > 0) {
            plans.push({ approvalId: a.id, seeds });
        }
    }

    return plans;
}

async function main() {
    const dryRun = process.argv.includes("--dry-run");
    const cutoff = new Date(); // capture before reads to avoid racing live writes

    console.log(
        `Backfill approval messages — ${dryRun ? "DRY RUN" : "WRITE"} mode (cutoff: ${cutoff.toISOString()})`
    );
    console.log("Filtering: type = CUSTOM_PRICING, requestedAt < cutoff\n");

    const plans = await buildPlan(cutoff);

    let initialCount = 0;
    let terminalCount = 0;
    for (const p of plans) {
        for (const s of p.seeds) {
            if (s.kind === "initial") initialCount++;
            else terminalCount++;
        }
    }

    console.log(`Plan: ${plans.length} approvals, ${initialCount} initial seeds, ${terminalCount} terminal seeds\n`);

    if (plans.length === 0) {
        console.log("Nothing to do.");
        return;
    }

    // Show first 10 for human review
    console.log("--- First 10 sample seeds ---");
    let shown = 0;
    for (const p of plans) {
        if (shown >= 10) break;
        for (const s of p.seeds) {
            if (shown >= 10) break;
            console.log(
                `  approval=${p.approvalId.slice(0, 8)}…  ${s.kind.padEnd(8)} from=${s.from.padEnd(5)} text="${s.text}"`
            );
            shown++;
        }
    }
    console.log("------------------------------\n");

    if (dryRun) {
        console.log("DRY RUN — no writes. Re-run without --dry-run to apply.");
        return;
    }

    let written = 0;
    for (const p of plans) {
        for (const s of p.seeds) {
            await prisma.approvalMessage.create({
                data: {
                    approvalId: p.approvalId,
                    from: s.from,
                    text: s.text,
                    createdAt: s.createdAt,
                    synthetic: true,
                },
            });
            written++;
        }
    }
    console.log(`Wrote ${written} synthetic messages.`);
    console.log("Rollback if needed: DELETE FROM \"approval_messages\" WHERE \"synthetic\" = true;");
}

main()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
