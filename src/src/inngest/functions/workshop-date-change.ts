/**
 * Workshop Reschedule Notification (Inngest)
 *
 * Triggered when an admin changes a workshop's eventDate or eventTime.
 * Sends confirmed registrants an updated .ics calendar invite
 * (METHOD:REQUEST — updates the existing calendar event in-place).
 *
 * Moved to Inngest because fire-and-forget from the PATCH handler
 * was unreliable under Vercel's serverless background-execution
 * budget + DB connection pool limits.
 */

import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";
import { sendWorkshopDateChangeEmail } from "@/services/notifications";
import { parseDurationHoursFromEvent } from "@/lib/ics-generator";

export const workshopDateChange = inngest.createFunction(
  { id: "workshop-date-change", retries: 2 },
  { event: "workshop/date-changed" },
  async ({ event, step }) => {
    const { workshopId } = event.data;

    return step.run("fetch-and-send", async () => {
      const workshop = await db.workshop.findUnique({
        where: { id: workshopId },
        include: {
          coach: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
      });

      if (!workshop) throw new Error(`Workshop ${workshopId} not found`);
      if (!workshop.coach) throw new Error(`Workshop ${workshopId} has no coach`);
      if (!workshop.eventDate) throw new Error(`Workshop ${workshopId} has no eventDate`);

      const appUrl = process.env.APP_URL ?? "https://scaling-up-platform-v2.vercel.app";

      await sendWorkshopDateChangeEmail({
        workshopId: workshop.id,
        workshopTitle: workshop.title,
        workshopCode: workshop.workshopCode ?? "",
        coachName: `${workshop.coach.firstName} ${workshop.coach.lastName}`,
        coachEmail: workshop.coach.email,
        eventDate: workshop.eventDate,
        eventTime: workshop.eventTime,
        timezone: workshop.timezone,
        virtualLink: workshop.virtualLink,
        venueName: workshop.venueName,
        venueAddress: workshop.venueAddress,
        workshopFormat: workshop.format,
        durationHours: parseDurationHoursFromEvent(workshop.duration, workshop.eventTime),
        landingPageUrl: workshop.landingPageSlug
          ? `${appUrl}/workshop/${workshop.landingPageSlug}`
          : undefined,
      });

      return { workshopId, dispatched: true };
    });
  }
);
