import type {
  AssessmentCampaignStatus,
  AssessmentInvitationStatus,
} from "@prisma/client";
import { resolveMemberIdentity } from "@/lib/members/identity";
import { classifyInvitationExchangeAvailability } from "@/lib/assessments/stable-invitation-tokens";

export type MemberEvaluationListItem = {
  invitationId: string;
  assessmentName: string;
  closeAt: Date | null;
  href: string;
};

type EvaluationRow = {
  id: string;
  respondentId: string;
  status: AssessmentInvitationStatus;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  campaign: {
    alias: string;
    name: string;
    status: AssessmentCampaignStatus;
    openAt: Date;
    closeAt: Date | null;
    deletedAt: Date | null;
    template: { name: string };
  };
};

type MemberEvaluationsTx = Parameters<typeof resolveMemberIdentity>[0] & {
  assessmentInvitation: {
    findMany(args: Record<string, unknown>): Promise<EvaluationRow[]>;
  };
};

type MemberEvaluationsDb = {
  $transaction<T>(callback: (tx: MemberEvaluationsTx) => Promise<T>): Promise<T>;
};

/** List only this identity's own invitations that can be exchanged right now. */
export async function listMemberEvaluations(
  db: MemberEvaluationsDb,
  normalizedEmail: string,
  now: Date,
): Promise<MemberEvaluationListItem[]> {
  return db.$transaction(async (tx) => {
    const identity = await resolveMemberIdentity(tx, normalizedEmail);
    const ownIds = new Set(identity.members.map((member) => member.respondentId));
    if (ownIds.size === 0) return [];

    // Keep this query selective for bounded member reads. The shared classifier below
    // remains the authoritative lifecycle gate and must run before an item is exposed.
    const rows = await tx.assessmentInvitation.findMany({
      where: {
        respondentId: { in: [...ownIds] },
        revokedAt: null,
        expiresAt: { gt: now },
        status: { in: ["PENDING", "SENT", "VIEWED"] },
        campaign: {
          deletedAt: null,
          status: "ACTIVE",
          openAt: { lte: now },
          OR: [{ closeAt: null }, { closeAt: { gt: now } }],
        },
      },
      select: {
        id: true,
        respondentId: true,
        status: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
        campaign: {
          select: {
            alias: true,
            name: true,
            status: true,
            openAt: true,
            closeAt: true,
            deletedAt: true,
            template: { select: { name: true } },
          },
        },
      },
    });

    return rows
      .filter(
        (row) =>
          ownIds.has(row.respondentId) &&
          classifyInvitationExchangeAvailability(row, now) === "USABLE",
      )
      .map((row) => ({
        invitationId: row.id,
        assessmentName: row.campaign.name.trim() || row.campaign.template.name,
        closeAt: row.campaign.closeAt,
        href: `/member/evaluations/${encodeURIComponent(row.id)}/open`,
      }))
      .sort((left, right) => {
        if (left.closeAt === null) return right.closeAt === null ? 0 : 1;
        if (right.closeAt === null) return -1;
        return left.closeAt.getTime() - right.closeAt.getTime();
      });
  });
}
