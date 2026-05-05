/**
 * Recovery script for Stripe webhook fix (May 2026, plan v5).
 *
 * Targets the Apr 30 2026 outage's casualty class: Registration rows where
 * `paymentStatus = COMPLETED` but `paymentProcessedAt IS NULL`. These rows
 * were marked complete by the old webhook handler before it timed out
 * mid-side-effects, so they may be missing HubSpot sync, the registration/
 * created event, or the confirmation email.
 *
 * The recovery emits a `registration/payment-completed` Inngest event for
 * each operator-confirmed registrationId. The processPaymentCompleted
 * Inngest function runs idempotently:
 *   - If the row already has paymentProcessedAt → skip cleanly.
 *   - HubSpot step skips if hubspotContactId is set.
 *   - Notification step uses atomic claim on notificationSentAt.
 *
 * SAFETY: explicit --ids required in --execute mode. There is NO mass mode.
 * Operator must triage candidates against Stripe dashboard's failed-events
 * list (extract registrationId from event metadata) and pass confirmed IDs.
 *
 * Usage:
 *   npx tsx src/scripts/recover-stripe-casualties.ts --dry-run
 *   npx tsx src/scripts/recover-stripe-casualties.ts --execute --ids r1,r2,r3
 *
 * Rollback: not needed. The Inngest function is idempotent — re-running on
 * an already-processed row is a no-op (skipped).
 */

import { PrismaClient } from "@prisma/client";
import { inngest } from "@/inngest/client";

const prisma = new PrismaClient();

interface Args {
    dryRun: boolean;
    execute: boolean;
    ids: string[];
}

function parseArgs(argv: string[]): Args {
    const args: Args = { dryRun: false, execute: false, ids: [] };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--dry-run") args.dryRun = true;
        else if (a === "--execute") args.execute = true;
        else if (a === "--ids") {
            const next = argv[i + 1];
            if (next && !next.startsWith("--")) {
                args.ids = next.split(",").map((s) => s.trim()).filter(Boolean);
                i++;
            }
        }
    }
    return args;
}

interface Candidate {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    paymentStatus: string;
    status: string;
    stripeSessionId: string | null;
    stripePaymentId: string | null;
    hubspotContactId: string | null;
    notificationSentAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    workshop: {
        title: string;
        workshopCode: string;
        eventDate: Date;
    };
}

async function listCandidates(): Promise<Candidate[]> {
    return prisma.registration.findMany({
        where: {
            paymentStatus: "COMPLETED",
            paymentProcessedAt: null,
        },
        select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            paymentStatus: true,
            status: true,
            stripeSessionId: true,
            stripePaymentId: true,
            hubspotContactId: true,
            notificationSentAt: true,
            createdAt: true,
            updatedAt: true,
            workshop: {
                select: {
                    title: true,
                    workshopCode: true,
                    eventDate: true,
                },
            },
        },
        orderBy: { createdAt: "asc" },
    }) as unknown as Promise<Candidate[]>;
}

function printCandidate(c: Candidate, idx: number) {
    console.log(`${idx + 1}. id: ${c.id}`);
    console.log(`   email: ${c.email}`);
    console.log(`   name: ${c.firstName} ${c.lastName}`);
    console.log(`   workshop: ${c.workshop.workshopCode} — ${c.workshop.title}`);
    console.log(`   eventDate: ${c.workshop.eventDate.toISOString()}`);
    console.log(`   createdAt: ${c.createdAt.toISOString()}`);
    console.log(`   updatedAt: ${c.updatedAt.toISOString()}`);
    console.log(`   stripeSessionId: ${c.stripeSessionId ?? "NULL"}`);
    console.log(`   stripePaymentId: ${c.stripePaymentId ?? "NULL"}`);
    console.log(`   hubspotContactId: ${c.hubspotContactId ?? "NULL"}`);
    console.log(`   notificationSentAt: ${c.notificationSentAt?.toISOString() ?? "NULL"}`);
    console.log("");
}

async function emitForIds(ids: string[]): Promise<{ emitted: number; missing: string[] }> {
    let emitted = 0;
    const missing: string[] = [];

    for (const id of ids) {
        // Confirm the row exists + matches our criteria before emitting.
        const reg = await prisma.registration.findUnique({
            where: { id },
            select: { id: true, paymentStatus: true, paymentProcessedAt: true },
        });
        if (!reg) {
            console.error(`  [skip] ${id}: registration not found`);
            missing.push(id);
            continue;
        }
        if (reg.paymentStatus !== "COMPLETED") {
            console.error(
                `  [skip] ${id}: paymentStatus=${reg.paymentStatus} (expected COMPLETED)`
            );
            missing.push(id);
            continue;
        }
        if (reg.paymentProcessedAt) {
            console.error(
                `  [skip] ${id}: paymentProcessedAt already set (${reg.paymentProcessedAt.toISOString()})`
            );
            missing.push(id);
            continue;
        }

        await inngest.send({
            name: "registration/payment-completed",
            data: { registrationId: id, source: "recovery" },
        });
        console.log(`  [emit] ${id} ✓`);
        emitted++;
    }

    return { emitted, missing };
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));

    if (!args.dryRun && !args.execute) {
        console.error("ERROR: must specify --dry-run or --execute");
        console.error("");
        console.error("Usage:");
        console.error("  npx tsx src/scripts/recover-stripe-casualties.ts --dry-run");
        console.error("  npx tsx src/scripts/recover-stripe-casualties.ts --execute --ids r1,r2,r3");
        process.exit(1);
    }

    if (args.execute && args.ids.length === 0) {
        console.error("ERROR: --execute requires explicit --ids r1,r2,...");
        console.error("Recovery does NOT support a mass --execute mode. Run --dry-run first,");
        console.error("cross-reference with Stripe dashboard's failed-events list, then pass");
        console.error("only confirmed-casualty registrationIds.");
        process.exit(1);
    }

    if (args.dryRun) {
        const candidates = await listCandidates();
        console.log(`=== Recovery Candidates: paymentStatus=COMPLETED AND paymentProcessedAt IS NULL ===`);
        console.log(`Found ${candidates.length} candidate(s):`);
        console.log("");
        candidates.forEach((c, i) => printCandidate(c, i));
        console.log("");
        console.log("To execute for confirmed-casualty IDs only, run:");
        console.log("  npx tsx src/scripts/recover-stripe-casualties.ts --execute --ids id1,id2,...");
        console.log("");
        console.log("Cross-reference candidates with Stripe dashboard's failed-events list");
        console.log("(extract registrationId from event metadata) before executing.");
        return;
    }

    if (args.execute) {
        console.log(`=== Emitting registration/payment-completed for ${args.ids.length} id(s) ===`);
        const { emitted, missing } = await emitForIds(args.ids);
        console.log("");
        console.log(`Done. Emitted ${emitted}/${args.ids.length}.`);
        if (missing.length > 0) {
            console.log(`Skipped ${missing.length}: ${missing.join(", ")}`);
        }
        console.log("");
        console.log("Watch the Inngest dashboard for processPaymentCompleted runs.");
        console.log("Re-run --dry-run after the backlog drains to confirm zero residual NULL rows.");
    }
}

main()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
