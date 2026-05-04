/**
 * CHG-03 (May 4 2026): server-side helper that resolves the iDev pixel
 * <CustomCodeRenderer> at both paid-success destinations
 * (/workshop/[slug] and /registration/success). Centralizing the
 * registration fetch + effectiveAmountCents resolution keeps both render
 * sites in lockstep.
 *
 * Effective amount precedence:
 *   1. registration.amountPaidCents (DB) - populated by the Stripe webhook.
 *   2. Stripe Checkout Session amount_total - fallback when the user lands
 *      on the thank-you page before the webhook has finished writing.
 *   3. null - skip the iDev pixel; page itself still renders.
 *
 * Workshop-scoped registration fetch prevents cross-workshop session_id
 * abuse (someone could otherwise pass another workshop's session_id and
 * fire the wrong pixel).
 */

import type { ReactElement } from "react";
import { db } from "@/lib/db";
import { retrieveCheckoutSession } from "@/services/stripe";
import { CustomCodeRenderer } from "@/components/affiliate/custom-code-renderer";

export type ResolverArgs = {
    sessionId: string | undefined;
    workshopId: string;
    isFree: boolean;
    customCode: string | null | undefined;
};

export async function resolveCustomCodeRenderer(
    args: ResolverArgs
): Promise<ReactElement | null> {
    const { sessionId, workshopId, isFree, customCode } = args;

    if (!customCode) return null;
    if (isFree) return null;
    if (!sessionId) return null;

    // Workshop-scoped lookup prevents cross-workshop session_id abuse.
    const registration = await db.registration.findFirst({
        where: { stripeSessionId: sessionId, workshopId },
        select: { id: true, stripeSessionId: true, email: true, amountPaidCents: true },
    });
    if (!registration) return null;

    let effectiveAmountCents: number | null = registration.amountPaidCents ?? null;

    // Fallback: webhook may not have written amountPaidCents yet. Fetch the
    // Stripe Checkout Session and use its amount_total when payment_status
    // is "paid". Pending/unpaid sessions must NOT fire iDev.
    if (effectiveAmountCents === null) {
        try {
            const session = await retrieveCheckoutSession(sessionId);
            if (
                session.payment_status === "paid" &&
                typeof session.amount_total === "number"
            ) {
                effectiveAmountCents = session.amount_total;
            }
        } catch (err) {
            console.warn(
                `[customCode] Stripe session retrieve failed for ${registration.id}:`,
                err
            );
        }
    }

    return (
        <CustomCodeRenderer
            landingPage={{ customCode }}
            registration={{
                id: registration.id,
                stripeSessionId: registration.stripeSessionId,
                email: registration.email,
            }}
            workshop={{ isFree }}
            effectiveAmountCents={effectiveAmountCents}
        />
    );
}
