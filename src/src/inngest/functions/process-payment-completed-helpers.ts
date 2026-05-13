/**
 * Helpers for processPaymentCompleted Inngest function.
 *
 * Stripe webhook fix (May 2026, plan v5): the slim webhook handler emits
 * `registration/payment-completed` and this Inngest function does the slow
 * side effects (HubSpot sync, strict notification, mark processed) with
 * Inngest retries + idempotency.
 */

import { db } from "@/lib/db";
import { createOrUpdateContact } from "@/services/hubspot";
import { sendPaidRegistrationNotificationStrict } from "@/services/notifications";
import {
    generateIcsContent,
    parseDurationHoursFromEvent,
    buildLocationString,
} from "@/lib/ics-generator";

export interface RegistrationForProcessing {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    company: string | null;
    jobTitle: string | null;
    phone: string | null;
    paymentProcessedAt: Date | null;
    notificationSentAt: Date | null;
    hubspotContactId: string | null;
    workshop: {
        id: string;
        title: string;
        workshopCode: string;
        description: string | null;
        eventDate: Date;
        eventTime: string | null;
        timezone: string;
        duration: string;
        format: string;
        virtualLink: string | null;
        venueName: string | null;
        venueAddress: string | null;
        coach: {
            firstName: string;
            lastName: string;
            email: string;
        };
    };
}

/**
 * Fetch the registration with all data needed for processing. Returns null
 * if the registration doesn't exist (e.g., deleted between webhook and
 * Inngest run).
 */
export async function fetchForProcessing(
    registrationId: string
): Promise<RegistrationForProcessing | null> {
    return db.registration.findUnique({
        where: { id: registrationId },
        select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            company: true,
            jobTitle: true,
            phone: true,
            paymentProcessedAt: true,
            notificationSentAt: true,
            hubspotContactId: true,
            workshop: {
                select: {
                    id: true,
                    title: true,
                    workshopCode: true,
                    description: true,
                    eventDate: true,
                    eventTime: true,
                    timezone: true,
                    duration: true,
                    format: true,
                    virtualLink: true,
                    venueName: true,
                    venueAddress: true,
                    coach: {
                        select: {
                            firstName: true,
                            lastName: true,
                            email: true,
                        },
                    },
                },
            },
        },
    }) as Promise<RegistrationForProcessing | null>;
}

/**
 * Sync the registration to HubSpot — IDEMPOTENT. Skips if `hubspotContactId`
 * is already set (HubSpot side already in sync). Persists the new ID on
 * success.
 *
 * Throws on HubSpot error (Inngest will retry the step).
 */
export async function syncHubSpotIfMissing(
    reg: RegistrationForProcessing
): Promise<{ skipped: boolean; hubspotContactId?: string }> {
    if (reg.hubspotContactId) {
        return { skipped: true, hubspotContactId: reg.hubspotContactId };
    }

    if (!process.env.HUBSPOT_ACCESS_TOKEN) {
        // Not configured in this environment — log + skip without throwing.
        // The function still proceeds; HubSpot can be backfilled separately.
        console.warn("[process-payment-completed] HUBSPOT_ACCESS_TOKEN not set; skipping HubSpot sync");
        return { skipped: true };
    }

    const hubspotContactId = await createOrUpdateContact({
        email: reg.email,
        firstname: reg.firstName,
        lastname: reg.lastName,
        company: reg.company || undefined,
        jobtitle: reg.jobTitle || undefined,
        phone: reg.phone || undefined,
        workshop_name: reg.workshop.title,
        workshop_date: reg.workshop.eventDate.toISOString(),
        coach_name: `${reg.workshop.coach.firstName} ${reg.workshop.coach.lastName}`,
    });

    await db.registration.update({
        where: { id: reg.id },
        data: { hubspotContactId },
    });

    return { skipped: false, hubspotContactId };
}

/**
 * Send the paid-registration notification with an atomic claim on
 * `notificationSentAt` to prevent duplicate sends across concurrent runs.
 *
 * Pattern:
 *   1. Atomic claim: `updateMany WHERE notificationSentAt IS NULL` — only
 *      one concurrent run wins.
 *   2. If lost: skip cleanly.
 *   3. If won: send via STRICT helper (which throws on SMTP failure).
 *   4. On SMTP error: roll back the claim so Inngest can retry the step.
 *
 * Edge case (documented in plan v5): if the function is killed between
 * the claim and the SMTP attempt, the row is left with notificationSentAt
 * set but no email actually sent. Mitigation is operator-driven recovery
 * (manually reset the field). Filed for next sprint.
 */
export async function sendNotificationWithAtomicClaim(
    reg: RegistrationForProcessing
): Promise<{ sent: boolean; reason?: string }> {
    const claimedAt = new Date();
    const claim = await db.registration.updateMany({
        where: { id: reg.id, notificationSentAt: null },
        data: { notificationSentAt: claimedAt },
    });

    if (claim.count === 0) {
        return { sent: false, reason: "already-sent-by-another-run" };
    }

    try {
        const icsContent = generateIcsContent({
            uid: `workshop-${reg.workshop.id}@scaling-up-platform.com`,
            title: reg.workshop.title,
            description: reg.workshop.description,
            eventDate: reg.workshop.eventDate,
            eventTime: reg.workshop.eventTime,
            timezone: reg.workshop.timezone,
            durationHours: parseDurationHoursFromEvent(reg.workshop.duration, reg.workshop.eventTime),
            location: buildLocationString(reg.workshop),
        });

        const safeTitle = reg.workshop.title
            .replace(/[^a-zA-Z0-9-_ ]/g, "")
            .replace(/\s+/g, "-")
            .substring(0, 50);

        await sendPaidRegistrationNotificationStrict({
            workshopId: reg.workshop.id,
            workshopTitle: reg.workshop.title,
            workshopCode: reg.workshop.workshopCode,
            coachEmail: reg.workshop.coach.email,
            coachName: `${reg.workshop.coach.firstName} ${reg.workshop.coach.lastName}`,
            registrantName: `${reg.firstName} ${reg.lastName}`,
            registrantEmail: reg.email,
            registrantCompany: reg.company ?? undefined,
            format: reg.workshop.format,
            virtualLink: reg.workshop.virtualLink,
            venueName: reg.workshop.venueName,
            venueAddress: reg.workshop.venueAddress,
            icsAttachment: {
                filename: `${safeTitle}.ics`,
                content: icsContent,
            },
        });

        return { sent: true };
    } catch (err) {
        // Roll back the claim so Inngest's step retry can attempt again.
        // Scope the rollback to OUR claim (claimedAt) so we don't unset a
        // claim made by a later run that succeeded.
        await db.registration.updateMany({
            where: { id: reg.id, notificationSentAt: claimedAt },
            data: { notificationSentAt: null },
        });
        throw err;
    }
}
