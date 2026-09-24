import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";
import { sendCampaignDeadlineExtendedEmail } from "@/services/notifications";
import { timezonePickerEnabled } from "@/lib/time/wave-timezone-flags";

export const ASSESSMENT_DEADLINE_EXTENDED_EVENT =
  "assessment/campaign.deadline-extended" as const;

const NOTIFICATION_BATCH_SIZE = 25;

export const assessmentDeadlineExtendedNotifications = inngest.createFunction(
  {
    id: "assessment-deadline-extended-notifications",
    retries: 5,
    concurrency: { key: "event.data.campaignId", limit: 1 },
  },
  { event: ASSESSMENT_DEADLINE_EXTENDED_EVENT },
  async ({ event, step }) => {
    if (!timezonePickerEnabled()) return { skipped: "feature-disabled" };
    const closeAt = new Date(event.data.closeAt as string);
    if (Number.isNaN(closeAt.getTime())) return { skipped: "invalid-close-at" };
    const invitationIds = Array.isArray(event.data.invitationIds)
      ? event.data.invitationIds.filter((id): id is string => typeof id === "string")
      : [];
    if (invitationIds.length === 0) return { notified: 0 };

    const campaign = await db.assessmentCampaign.findUnique({
      where: { id: event.data.campaignId as string },
      select: { id: true, name: true, closeAt: true, timezone: true },
    });
    if (!campaign?.closeAt || campaign.closeAt.getTime() !== closeAt.getTime()) {
      return { skipped: "stale-deadline" };
    }

    const recipients = await db.assessmentInvitation.findMany({
      where: {
        campaignId: campaign.id,
        id: { in: invitationIds },
        status: { in: ["SENT", "VIEWED"] },
        sentAt: { not: null },
        submittedAt: null,
        revokedAt: null,
        submission: { is: null },
        respondent: { deletedAt: null },
      },
      select: {
        id: true,
        respondent: { select: { email: true, firstName: true } },
      },
      orderBy: { id: "asc" },
    });

    for (let offset = 0; offset < recipients.length; offset += NOTIFICATION_BATCH_SIZE) {
      if (!timezonePickerEnabled()) return { skipped: "feature-disabled-mid-run", notified: offset };
      const batch = recipients.slice(offset, offset + NOTIFICATION_BATCH_SIZE);
      await Promise.all(
        batch.map(({ id, respondent }) =>
          step.run(`notify-${id}-${closeAt.getTime()}`, () =>
            sendCampaignDeadlineExtendedEmail({
              to: respondent.email,
              firstName: respondent.firstName,
              campaignName: campaign.name,
              closeAt,
              timezone: campaign.timezone,
            }),
          ),
        ),
      );
    }
    return { notified: recipients.length };
  },
);
