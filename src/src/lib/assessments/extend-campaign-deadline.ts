import type { Prisma, PrismaClient } from "@prisma/client";

export type DeadlineExtensionDb = Pick<
  PrismaClient,
  "$transaction" | "assessmentCampaign" | "assessmentInvitation" | "auditLog"
>;

export class DeadlineExtensionError extends Error {
  constructor(
    public readonly code:
      | "CAMPAIGN_NOT_FOUND"
      | "CAMPAIGN_CLOSED"
      | "NO_CURRENT_DEADLINE"
      | "MUST_EXTEND"
      | "MUST_BE_FUTURE",
  ) {
    super(code);
  }
}

const UNSUBMITTED_INVITATION_WHERE = {
  status: { not: "SUBMITTED" as const },
  submittedAt: null,
  revokedAt: null,
  submission: { is: null },
  respondent: { deletedAt: null },
};

export async function previewCampaignDeadlineExtension(
  db: DeadlineExtensionDb,
  campaignId: string,
) {
  const campaign = await db.assessmentCampaign.findUnique({
    where: { id: campaignId },
    select: { id: true, closeAt: true, timezone: true, status: true },
  });
  if (!campaign) throw new DeadlineExtensionError("CAMPAIGN_NOT_FOUND");
  const [affectedCount, completedCount] = await Promise.all([
    db.assessmentInvitation.count({
      where: { campaignId, ...UNSUBMITTED_INVITATION_WHERE },
    }),
    db.assessmentInvitation.count({
      where: {
        campaignId,
        OR: [{ status: "SUBMITTED" }, { submittedAt: { not: null } }, { submission: { isNot: null } }],
      },
    }),
  ]);
  return { ...campaign, affectedCount, completedCount };
}

export async function extendCampaignDeadline(
  db: DeadlineExtensionDb,
  input: {
    campaignId: string;
    newCloseAt: Date;
    performedBy: string;
    now?: Date;
  },
) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT "id"
      FROM "assessment_campaigns"
      WHERE "id" = ${input.campaignId}
      FOR UPDATE
    `;

    const campaign = await tx.assessmentCampaign.findUnique({
      where: { id: input.campaignId },
      select: { id: true, name: true, closeAt: true, timezone: true, status: true },
    });
    if (!campaign) throw new DeadlineExtensionError("CAMPAIGN_NOT_FOUND");
    if (campaign.status === "CLOSED") {
      throw new DeadlineExtensionError("CAMPAIGN_CLOSED");
    }
    if (!campaign.closeAt) throw new DeadlineExtensionError("NO_CURRENT_DEADLINE");
    if (input.newCloseAt.getTime() <= campaign.closeAt.getTime()) {
      throw new DeadlineExtensionError("MUST_EXTEND");
    }
    if (input.newCloseAt.getTime() <= (input.now ?? new Date()).getTime()) {
      throw new DeadlineExtensionError("MUST_BE_FUTURE");
    }

    const affected = await tx.assessmentInvitation.findMany({
      where: { campaignId: input.campaignId, ...UNSUBMITTED_INVITATION_WHERE },
      select: {
        id: true,
        status: true,
        sentAt: true,
        respondent: { select: { email: true, firstName: true, lastName: true } },
      },
    });
    const invitationIds = affected.map(({ id }) => id);
    const notificationRecipients = affected.filter(
      ({ status, sentAt }) => sentAt !== null && (status === "SENT" || status === "VIEWED"),
    );

    await tx.assessmentCampaign.update({
      where: { id: input.campaignId },
      data: { closeAt: input.newCloseAt },
    });

    if (invitationIds.length > 0) {
      await tx.assessmentInvitation.updateMany({
        where: { id: { in: invitationIds } },
        data: {
          expiresAt: input.newCloseAt,
          stableFallbackExpiresAt: input.newCloseAt,
        },
      });

      // A later confirmation or rejection rollback can promote any of these
      // token metadata fields back onto the parent invitation. Extending all
      // snapshots and predecessor expiries prevents that repair machinery from
      // silently restoring the old, expired deadline.
      await tx.assessmentInvitationToken.updateMany({
        where: { invitationId: { in: invitationIds } },
        data: { expiresAtSnapshot: input.newCloseAt },
      });
      await tx.assessmentInvitationToken.updateMany({
        where: {
          invitationId: { in: invitationIds },
          previousExpiresAt: { not: null },
        },
        data: { previousExpiresAt: input.newCloseAt },
      });
    }

    await tx.auditLog.create({
      data: {
        entityType: "AssessmentCampaign",
        entityId: input.campaignId,
        action: "DEADLINE_EXTEND",
        performedBy: input.performedBy,
        changes: JSON.stringify({
          previousCloseAt: campaign.closeAt.toISOString(),
          closeAt: input.newCloseAt.toISOString(),
          invitationsExtended: invitationIds.length,
          notificationRecipientIds: notificationRecipients.map(({ id }) => id),
        }),
      },
    });

    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      timezone: campaign.timezone,
      previousCloseAt: campaign.closeAt,
      closeAt: input.newCloseAt,
      affected,
      notificationRecipients,
    };
  }, { isolationLevel: "Serializable" as Prisma.TransactionIsolationLevel });
}

/** Read-only retry path for an event dispatch that failed after the extension committed. */
export async function prepareCampaignDeadlineNotificationRetry(
  db: DeadlineExtensionDb,
  input: { campaignId: string; closeAt: Date },
) {
  const campaign = await db.assessmentCampaign.findUnique({
    where: { id: input.campaignId },
    select: { id: true, name: true, closeAt: true, timezone: true, status: true },
  });
  if (!campaign) throw new DeadlineExtensionError("CAMPAIGN_NOT_FOUND");
  if (!campaign.closeAt || campaign.closeAt.getTime() !== input.closeAt.getTime()) {
    throw new DeadlineExtensionError("MUST_EXTEND");
  }
  const audit = await db.auditLog.findFirst({
    where: {
      entityType: "AssessmentCampaign",
      entityId: input.campaignId,
      action: "DEADLINE_EXTEND",
    },
    orderBy: { timestamp: "desc" },
    select: { changes: true },
  });
  let invitationIds: string[] = [];
  try {
    const changes = JSON.parse(audit?.changes ?? "{}") as {
      closeAt?: unknown;
      notificationRecipientIds?: unknown;
    };
    if (changes.closeAt === input.closeAt.toISOString() && Array.isArray(changes.notificationRecipientIds)) {
      invitationIds = changes.notificationRecipientIds.filter(
        (id): id is string => typeof id === "string",
      );
    }
  } catch {
    invitationIds = [];
  }
  const notificationRecipients = invitationIds.length === 0
    ? []
    : await db.assessmentInvitation.findMany({
    where: {
      campaignId: input.campaignId,
      id: { in: invitationIds },
      ...UNSUBMITTED_INVITATION_WHERE,
      status: { in: ["SENT", "VIEWED"] },
      sentAt: { not: null },
    },
    select: {
      id: true,
      status: true,
      sentAt: true,
      respondent: { select: { email: true, firstName: true, lastName: true } },
    },
    });
  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    timezone: campaign.timezone,
    closeAt: campaign.closeAt,
    affected: notificationRecipients,
    notificationRecipients,
    retryOnly: true as const,
  };
}
