/**
 * Wave 13-A: handleRegistrationCreatedFree
 *
 * Inngest handler for `registration/created` events targeting FREE registrations.
 * Mirrors the paid path's atomic-claim + ICS + strict-notification pattern so
 * free attendees get the same email quality as paid attendees (with ICS
 * attachment, location block, admin + coach notifications).
 *
 * Guards:
 *   - paymentStatus !== "FREE" → skip (paid path handles it)
 *   - createdAt < REGISTRATION_HANDLER_CUTOFF_AT → skip (pre-cutoff legacy rows)
 *   - notificationSentAt non-null → already sent (idempotency)
 *   - Atomic claim via updateMany(WHERE notificationSentAt IS NULL) prevents
 *     concurrent Inngest runs from double-sending on replay.
 */

import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";
import {
  generateIcsContent,
  buildLocationString,
  parseDurationHoursFromEvent,
} from "@/lib/ics-generator";
import { sendPaidRegistrationNotificationStrict } from "@/services/notifications";

export const handleRegistrationCreatedFree = inngest.createFunction(
  { id: "handle-registration-created-free" },
  { event: "registration/created" },
  async ({ event, step }) => {
    const { registrationId } = event.data;

    const reg = await step.run("fetch-registration", () =>
      db.registration.findUnique({
        where: { id: registrationId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          company: true,
          paymentStatus: true,
          notificationSentAt: true,
          createdAt: true,
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
      })
    );

    if (!reg?.workshop) return { ok: true, skipped: "not_found" };
    if (reg.paymentStatus !== "FREE") return { ok: true, skipped: "paid_path_handles" };

    // Pre-cutoff guard: rows created before this handler was deployed should
    // not receive a duplicate email (the fire-and-forget path already ran).
    const CUTOFF = new Date(
      process.env.REGISTRATION_HANDLER_CUTOFF_AT ?? "2026-05-12T00:00:00.000Z"
    );
    if (new Date(reg.createdAt as unknown as string) < CUTOFF) {
      return { ok: true, skipped: "pre_cutoff" };
    }

    if (reg.notificationSentAt) return { ok: true, skipped: "already_sent" };

    const workshop = {
      ...reg.workshop,
      eventDate: new Date(reg.workshop.eventDate as unknown as string),
    };

    const result = await step.run("send-notification", async () => {
      const claimedAt = new Date();
      const claim = await db.registration.updateMany({
        where: { id: reg.id, notificationSentAt: null },
        data: { notificationSentAt: claimedAt },
      });
      if (claim.count === 0) return { sent: false, reason: "race_lost" };

      const icsContent = generateIcsContent({
        uid: `workshop-${workshop.id}@scaling-up-platform.com`,
        title: workshop.title,
        description: workshop.description,
        eventDate: workshop.eventDate,
        eventTime: workshop.eventTime,
        timezone: workshop.timezone,
        durationHours: parseDurationHoursFromEvent(workshop.duration, workshop.eventTime),
        location: buildLocationString(workshop),
        organizer: {
          name: `${workshop.coach.firstName} ${workshop.coach.lastName}`,
          email: workshop.coach.email,
        },
        method: "REQUEST",
      });

      const safeTitle = workshop.title
        .replace(/[^a-zA-Z0-9-_ ]/g, "")
        .replace(/\s+/g, "-")
        .substring(0, 50);

      try {
        await sendPaidRegistrationNotificationStrict({
          workshopId: workshop.id,
          workshopTitle: workshop.title,
          workshopCode: workshop.workshopCode,
          coachEmail: workshop.coach.email,
          coachName: `${workshop.coach.firstName} ${workshop.coach.lastName}`,
          registrantName: `${reg.firstName} ${reg.lastName}`,
          registrantEmail: reg.email,
          registrantCompany: reg.company ?? undefined,
          format: workshop.format,
          virtualLink: workshop.virtualLink,
          venueName: workshop.venueName,
          venueAddress: workshop.venueAddress,
          icsAttachment: { filename: `${safeTitle}.ics`, content: icsContent },
        });
        return { sent: true };
      } catch (err) {
        // Roll back the claim so Inngest's step retry can attempt again.
        await db.registration.updateMany({
          where: { id: reg.id, notificationSentAt: claimedAt },
          data: { notificationSentAt: null },
        });
        throw err;
      }
    });

    if (result.sent === false) return { ok: true, skipped: result.reason };
    return { ok: true, registrationId };
  }
);
