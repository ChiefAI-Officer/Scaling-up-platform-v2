/** Member-owned report loaders. Authorization is derived inside the snapshot. */
import type { ActiveVersionDb } from "@/lib/assessments/active-version";
import {
  respondentReportSelect,
  type RawSubmission,
  type RespondentReportOutcome,
} from "@/lib/assessments/respondent-report";
import { projectRespondentReport } from "@/lib/assessments/respondent-report-projection";
import {
  getCampaignGroupReportForMember,
  type GroupReportDb,
  type GroupReportResult,
} from "@/lib/assessments/group-report";
import { resolveMemberIdentity } from "@/lib/members/identity";

type MemberReportTx = ActiveVersionDb & {
  orgRespondent: {
    findMany(args: {
      where: Record<string, unknown>;
      select: Record<string, boolean>;
    }): Promise<
      Array<{
        id: string;
        organizationId: string;
        teamId: string | null;
        roleType: string | null;
      }>
    >;
  };
  assessmentSubmission: {
    findUnique(args: {
      where: { id: string };
      select: typeof respondentReportSelect;
    }): Promise<RawSubmission | null>;
  };
};

type MemberReportDb = {
  $transaction<T>(
    callback: (tx: MemberReportTx) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T>;
};

/**
 * Release 1 intentionally activates own-only scope. Task 16 replaces this
 * projection with the already-tested hierarchy entitlement after approval.
 */
function releaseOneRespondentIds(members: Array<{ respondentId: string }>): Set<string> {
  return new Set(members.map((member) => member.respondentId));
}

export async function getMemberRespondentReport(
  db: MemberReportDb,
  input: { normalizedEmail: string; submissionId: string },
): Promise<RespondentReportOutcome> {
  return db.$transaction(
    async (tx) => {
      const identity = await resolveMemberIdentity(tx, input.normalizedEmail);
      const entitledRespondentIds = releaseOneRespondentIds(identity.members);
      const submission = await tx.assessmentSubmission.findUnique({
        where: { id: input.submissionId },
        select: respondentReportSelect,
      });

      if (!submission) return { status: "not-found" } as const;
      if (
        submission.campaign.deletedAt != null ||
        !submission.respondentId ||
        !entitledRespondentIds.has(submission.respondentId)
      ) {
        return { status: "forbidden" } as const;
      }
      if (!submission.campaign.organization) return { status: "not-found" } as const;

      return projectRespondentReport(tx, submission, submission.campaign.id ?? "");
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
}

export async function getMemberGroupReport(
  db: MemberReportDb,
  input: { normalizedEmail: string; campaignId: string; now?: Date },
): Promise<GroupReportResult> {
  return getCampaignGroupReportForMember(
    db as unknown as GroupReportDb,
    input.campaignId,
    input.now ?? new Date(),
    async (tx, completedRespondentIds, organizationId) => {
      const identity = await resolveMemberIdentity(
        tx as unknown as MemberReportTx,
        input.normalizedEmail,
      );
      if (!identity.members.some((member) => member.organizationId === organizationId)) {
        return false;
      }
      const entitledRespondentIds = releaseOneRespondentIds(identity.members);
      return completedRespondentIds.every((respondentId) =>
        entitledRespondentIds.has(respondentId),
      );
    },
  );
}
