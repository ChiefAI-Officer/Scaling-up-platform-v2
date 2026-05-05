/**
 * Inngest Function: processPaymentCompleted
 *
 * Stripe webhook fix (May 2026, plan v5).
 *
 * Triggered by `registration/payment-completed` event from the slim Stripe
 * webhook handler. Performs the slow side effects (HubSpot sync + paid
 * confirmation email) that previously ran inline in the webhook and caused
 * the Apr 30 timeouts.
 *
 * Idempotency layers:
 *   - Inngest concurrency: { key, limit: 1 } per registrationId — Inngest
 *     queues simultaneous events instead of running them in parallel.
 *   - Function-level: skip if `paymentProcessedAt` is already set.
 *   - Step-level (notification): atomic claim on `notificationSentAt`.
 *   - HubSpot step: skip if `hubspotContactId` is already set.
 *
 * Each `step.run` is its own retry boundary. STRICT notification throws on
 * SMTP failure → Inngest retries that step with exponential backoff.
 *
 * On successful completion: `paymentProcessedAt` is set, marking the row
 * as fully processed. Subsequent webhook deliveries / recovery runs see
 * this and skip cleanly.
 */

import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";
import {
    fetchForProcessing,
    syncHubSpotIfMissing,
    sendNotificationWithAtomicClaim,
} from "./process-payment-completed-helpers";

export const processPaymentCompleted = inngest.createFunction(
    {
        id: "process-payment-completed",
        // Per-registration concurrency = 1: Inngest serializes events for
        // the same registrationId. Combined with the paymentProcessedAt
        // check below + atomic notif claim, this gives at-most-once
        // semantics for the side effects under realistic load.
        concurrency: { key: "event.data.registrationId", limit: 1 },
        retries: 4,
    },
    { event: "registration/payment-completed" },
    async ({ event, step }) => {
        const { registrationId } = event.data;

        // Step 1: fetch + function-level idempotency check
        const fetched = await step.run("fetch", () => fetchForProcessing(registrationId));
        if (!fetched) {
            return { skipped: true, reason: "not-found" };
        }
        if (fetched.paymentProcessedAt) {
            return { skipped: true, reason: "already-processed" };
        }

        // Inngest's step.run serializes Date objects to strings via JSON, so
        // the TypeScript types from step.run come back as ISO strings. Helpers
        // need real Date objects (e.g. for .toISOString() in HubSpot sync and
        // ICS generation), so we rehydrate here once.
        const reg = {
            ...fetched,
            paymentProcessedAt: fetched.paymentProcessedAt
                ? new Date(fetched.paymentProcessedAt as unknown as string)
                : null,
            notificationSentAt: fetched.notificationSentAt
                ? new Date(fetched.notificationSentAt as unknown as string)
                : null,
            workshop: {
                ...fetched.workshop,
                eventDate: new Date(fetched.workshop.eventDate as unknown as string),
            },
        };

        // Step 2: HubSpot sync (idempotent; skip if hubspotContactId set)
        await step.run("hubspot-sync", () => syncHubSpotIfMissing(reg));

        // Step 3: Strict notification with atomic claim. Throws on SMTP
        // error → Inngest retries this step.
        await step.run("send-notification-strict", () =>
            sendNotificationWithAtomicClaim(reg)
        );

        // Step 4: Mark processed
        await step.run("mark-processed", () =>
            db.registration.update({
                where: { id: registrationId },
                data: { paymentProcessedAt: new Date() },
            })
        );

        return { processed: true, registrationId };
    }
);
