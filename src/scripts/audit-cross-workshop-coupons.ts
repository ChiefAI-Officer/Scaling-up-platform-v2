/* eslint-disable */
/**
 * BUG-MAY6-4a: Audit prior cross-workshop coupon redemptions.
 *
 * Spawned from BUG-MAY6-4 (Coupon scoping fix shipped May 7). The two leak
 * paths in `services/stripe.ts` were closed at the code level, but historical
 * registrations may have redeemed a coupon scoped to a different workshop
 * before the fix. This script identifies those for Jeff's manual refund-or-
 * accept judgment per memory rule: NO auto-refunds.
 *
 * Approach:
 *   1. Pull `Registration` rows with stripePaymentId set + paymentStatus
 *      COMPLETED (within an optional --since window).
 *   2. For each, retrieve the Stripe checkout session via the stored
 *      paymentIntent or session id. Read the applied discounts.
 *   3. For each discount, fetch the promotion code metadata and read
 *      metadata.workshopCode (set by createWorkshopPromotionCode).
 *   4. Compare to the registration's workshop.workshopCode. Mismatch =
 *      cross-workshop redemption. Output to stdout as a CSV row.
 *
 * Usage:
 *   npx tsx scripts/audit-cross-workshop-coupons.ts                 (all-time)
 *   npx tsx scripts/audit-cross-workshop-coupons.ts --since 2026-01-01
 *   npx tsx scripts/audit-cross-workshop-coupons.ts --limit 50      (cap)
 *
 * Read-only / dry-run only. No writes. Operator-invoked.
 */

import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";

const db = new PrismaClient();

type Args = {
    sinceISO?: string;
    limit?: number;
};

function parseArgs(argv: string[]): Args {
    const out: Args = {};
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--since") out.sinceISO = argv[++i];
        else if (a === "--limit") out.limit = Number(argv[++i]);
    }
    return out;
}

function csvEscape(value: unknown): string {
    if (value === null || value === undefined) return "";
    const s = String(value);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

async function main() {
    const args = parseArgs(process.argv);

    if (!process.env.STRIPE_SECRET_KEY) {
        console.error("STRIPE_SECRET_KEY not set in env");
        process.exit(1);
    }
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { timeout: 15_000 });

    const where: Record<string, unknown> = {
        stripePaymentId: { not: null },
        paymentStatus: "COMPLETED",
    };
    if (args.sinceISO) {
        where.createdAt = { gte: new Date(args.sinceISO) };
    }

    const registrations = await db.registration.findMany({
        where,
        select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            stripePaymentId: true,
            stripeSessionId: true,
            amountPaidCents: true,
            createdAt: true,
            workshop: {
                select: { id: true, title: true, workshopCode: true },
            },
        },
        orderBy: { createdAt: "desc" },
        ...(args.limit ? { take: args.limit } : {}),
    });

    console.log(
        `Auditing ${registrations.length} registrations (limit=${args.limit ?? "none"}, since=${args.sinceISO ?? "all-time"})`
    );
    console.log("");
    console.log(
        "registration_id,email,name,workshop_code,workshop_title,amount,redeemed_promo_code,redeemed_workshop_code,verdict,session_id"
    );

    let suspectCount = 0;
    let cleanCount = 0;
    let inconclusiveCount = 0;

    for (const reg of registrations) {
        const sessionId = reg.stripeSessionId;
        if (!sessionId) {
            // Fall back to payment_intent — but the session is the only place
            // discounts are listed cleanly. Mark inconclusive.
            inconclusiveCount++;
            console.log(
                [
                    reg.id,
                    reg.email,
                    `${reg.firstName} ${reg.lastName}`,
                    reg.workshop.workshopCode,
                    reg.workshop.title,
                    reg.amountPaidCents,
                    "",
                    "",
                    "no_session_id",
                    "",
                ]
                    .map(csvEscape)
                    .join(",")
            );
            continue;
        }

        let session: Stripe.Checkout.Session | null = null;
        try {
            session = await stripe.checkout.sessions.retrieve(sessionId, {
                expand: ["total_details.breakdown.discounts"],
            });
        } catch (err) {
            inconclusiveCount++;
            console.log(
                [
                    reg.id,
                    reg.email,
                    `${reg.firstName} ${reg.lastName}`,
                    reg.workshop.workshopCode,
                    reg.workshop.title,
                    reg.amountPaidCents,
                    "",
                    "",
                    `stripe_error:${(err as Error).message}`,
                    sessionId,
                ]
                    .map(csvEscape)
                    .join(",")
            );
            continue;
        }

        const discounts = session?.total_details?.breakdown?.discounts ?? [];
        if (discounts.length === 0) {
            cleanCount++;
            // No coupon used — not a suspect.
            continue;
        }

        // Each discount has a `discount.coupon.id` and we look up the linked
        // promotion code via Stripe to read metadata.workshopCode.
        for (const d of discounts) {
            // d.discount is a Discount object; pull the promotion code.
            const couponId =
                typeof d.discount?.coupon === "string"
                    ? d.discount.coupon
                    : d.discount?.coupon?.id ?? null;
            // The promotion_code field on the Discount object is what was
            // entered at checkout — that's what we want for metadata lookup.
            const promoCodeId =
                typeof d.discount?.promotion_code === "string"
                    ? d.discount.promotion_code
                    : d.discount?.promotion_code?.id ?? null;

            let redeemedWorkshopCode: string | null = null;
            let redeemedPromoCode: string | null = null;

            if (promoCodeId) {
                try {
                    const promo = await stripe.promotionCodes.retrieve(promoCodeId);
                    redeemedWorkshopCode =
                        (promo.metadata?.workshopCode as string | undefined) ?? null;
                    redeemedPromoCode = promo.code ?? null;
                } catch {
                    // Fall through to coupon-level metadata.
                }
            }
            if (!redeemedWorkshopCode && couponId) {
                try {
                    const coupon = await stripe.coupons.retrieve(couponId);
                    redeemedWorkshopCode =
                        (coupon.metadata?.workshopCode as string | undefined) ?? null;
                } catch {
                    // ignore
                }
            }

            const verdict =
                redeemedWorkshopCode === null
                    ? "no_metadata"
                    : redeemedWorkshopCode === reg.workshop.workshopCode
                        ? "OK"
                        : "MISMATCH";

            if (verdict === "MISMATCH") suspectCount++;
            else if (verdict === "OK") cleanCount++;
            else inconclusiveCount++;

            console.log(
                [
                    reg.id,
                    reg.email,
                    `${reg.firstName} ${reg.lastName}`,
                    reg.workshop.workshopCode,
                    reg.workshop.title,
                    reg.amountPaidCents,
                    redeemedPromoCode,
                    redeemedWorkshopCode,
                    verdict,
                    sessionId,
                ]
                    .map(csvEscape)
                    .join(",")
            );
        }
    }

    console.log("");
    console.log(
        `Done. ${suspectCount} MISMATCH (cross-workshop), ${cleanCount} OK, ${inconclusiveCount} inconclusive.`
    );
    if (suspectCount > 0) {
        console.log(
            "Hand off MISMATCH rows to Jeff for refund/accept judgment per case. NO auto-refunds."
        );
    }
}

main()
    .catch((err) => {
        console.error("Audit failed:", err);
        process.exit(1);
    })
    .finally(() => db.$disconnect());
