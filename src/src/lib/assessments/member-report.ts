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
import {
  entitlementFor,
  type EntitlementReader,
  type ScopedRespondent,
  type TeamNode,
} from "@/lib/members/entitlement";

type MemberReportTx = ActiveVersionDb & {
  orgRespondent: {
    findMany(args: {
      where: Record<string, unknown>;
      select: Record<string, boolean>;
    }): Promise<Array<{
      id: string;
      organizationId: string;
      teamId: string | null;
      roleType: string | null;
      deletedAt?: Date | null;
      organization?: { deletedAt: Date | null };
    }>>;
  };
  orgTeam: {
    findMany(args: {
      where: Record<string, unknown>;
      select: Record<string, boolean>;
    }): Promise<Array<{
      id: string;
      organizationId: string;
      parentTeamId: string | null;
      deletedAt: Date | null;
    }>>;
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

function entitlementReader(tx: MemberReportTx): EntitlementReader {
  return {
    async respondentsForOrganization(organizationId): Promise<ScopedRespondent[]> {
      const rows = await tx.orgRespondent.findMany({
        where: { organizationId, deletedAt: null, organization: { deletedAt: null } },
        select: {
          id: true,
          organizationId: true,
          teamId: true,
          roleType: true,
          deletedAt: true,
          organization: true,
        },
      });
      return rows.map((row) => ({
        respondentId: row.id,
        organizationId: row.organizationId,
        teamId: row.teamId,
        roleType: row.roleType,
        deletedAt: row.deletedAt ?? null,
        organizationDeletedAt: row.organization?.deletedAt ?? null,
      }));
    },
    async teamsForOrganization(organizationId): Promise<TeamNode[]> {
      const rows = await tx.orgTeam.findMany({
        where: { organizationId, deletedAt: null },
        select: {
          id: true,
          organizationId: true,
          parentTeamId: true,
          deletedAt: true,
        },
      });
      return rows.map((row) => ({
        teamId: row.id,
        organizationId: row.organizationId,
        parentTeamId: row.parentTeamId,
        deletedAt: row.deletedAt,
      }));
    },
  };
}

export async function getMemberRespondentReport(
  db: MemberReportDb,
  input: { normalizedEmail: string; submissionId: string },
): Promise<RespondentReportOutcome> {
  return db.$transaction(
    async (tx) => {
      const identity = await resolveMemberIdentity(tx, input.normalizedEmail);
      const entitledRespondentIds = await entitlementFor(
        identity.members,
        entitlementReader(tx),
      );
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
      const entitledRespondentIds = await entitlementFor(
        identity.members,
        entitlementReader(tx as unknown as MemberReportTx),
      );
      return completedRespondentIds.every((respondentId) =>
        entitledRespondentIds.has(respondentId),
      );
    },
  );
}
