import { resolveMemberIdentity } from "@/lib/members/identity";
import { entitlementFor } from "@/lib/members/entitlement";
import {
  createMemberEntitlementReader,
  type MemberEntitlementDb,
} from "@/lib/members/entitlement-reader";
import {
  groupReportRequiresPublishedVersion,
  isGroupReportAlias,
  isGroupReportEnabled,
} from "@/lib/assessments/wave-f-flags";

export type MemberReportListItem = {
  submissionId: string;
  kind?: "personal" | "group";
  href?: string;
  assessmentName: string;
  reportName: string;
  personName: string | null;
  companyName: string | null;
  completedAt: Date;
  accent: "purple" | "orange" | "blue" | "green" | "brown";
};

type ReportRow = {
  id: string;
  respondentId: string | null;
  submittedAt: Date;
  respondent: { firstName: string; lastName: string } | null;
  invitation: { status: string } | null;
  campaign: {
    id: string;
    name: string | null;
    accessMode: string;
    createdByCoachId: string | null;
    organizationId: string | null;
    organization: { name: string } | null;
    template: { name: string; alias: string };
    version: { publishedAt: Date | null };
  };
};

type MemberReportsTx = MemberEntitlementDb & {
  assessmentSubmission: {
    findMany(args: Record<string, unknown>): Promise<ReportRow[]>;
  };
  assessmentInvitation: {
    count(args: Record<string, unknown>): Promise<number>;
  };
};

type MemberReportsDb = {
  $transaction<T>(callback: (tx: MemberReportsTx) => Promise<T>): Promise<T>;
};

function accentFor(alias: string): MemberReportListItem["accent"] {
  if (alias.includes("rockefeller")) return "orange";
  if (alias.includes("leadership") || alias.includes("lva")) return "blue";
  if (alias.includes("quarterly")) return "green";
  if (alias.includes("full")) return "brown";
  return "purple";
}

export async function listMemberReports(
  db: MemberReportsDb,
  normalizedEmail: string,
): Promise<{ reports: MemberReportListItem[]; hasOpenEvaluations: boolean }> {
  return db.$transaction(async (tx) => {
    const identity = await resolveMemberIdentity(tx, normalizedEmail);
    const ownIds = identity.members.map((member) => member.respondentId);
    if (ownIds.length === 0) return { reports: [], hasOpenEvaluations: false };

    const entitledIds = await entitlementFor(
      identity.members,
      createMemberEntitlementReader(tx),
    );
    const organizationIds = [...new Set(identity.members.map((member) => member.organizationId))];
    const organizationCount = organizationIds.length;
    const rows = await tx.assessmentSubmission.findMany({
      where: {
        respondentId: { not: null },
        submittedAt: { not: null },
        campaign: { deletedAt: null, organizationId: { in: organizationIds } },
      },
      select: {
        id: true,
        respondentId: true,
        submittedAt: true,
        respondent: { select: { firstName: true, lastName: true } },
        invitation: { select: { status: true } },
        campaign: {
          select: {
            id: true,
            name: true,
            accessMode: true,
            createdByCoachId: true,
            organizationId: true,
            organization: { select: { name: true } },
            template: { select: { name: true, alias: true } },
            version: { select: { publishedAt: true } },
          },
        },
      },
      orderBy: { submittedAt: "desc" },
    });
    const ownSet = new Set(ownIds);
    const personalReports: MemberReportListItem[] = rows
      .filter((row) => row.respondentId !== null && entitledIds.has(row.respondentId))
      .map((row) => ({
        submissionId: row.id,
        kind: "personal",
        href: `/member/reports/${encodeURIComponent(row.id)}`,
        assessmentName: row.campaign.template.name,
        reportName: row.campaign.name?.trim() || row.campaign.template.name,
        personName:
          row.respondentId && !ownSet.has(row.respondentId) && row.respondent
            ? `${row.respondent.firstName} ${row.respondent.lastName}`.trim()
            : null,
        companyName:
          organizationCount > 1 ? row.campaign.organization?.name ?? null : null,
        completedAt: row.submittedAt,
        accent: accentFor(row.campaign.template.alias),
      }));

    const cohortByCampaign = new Map<string, ReportRow[]>();
    for (const row of rows) {
      if (row.invitation?.status !== "SUBMITTED") continue;
      const cohort = cohortByCampaign.get(row.campaign.id) ?? [];
      cohort.push(row);
      cohortByCampaign.set(row.campaign.id, cohort);
    }
    const groupReports: MemberReportListItem[] = [];
    for (const cohort of cohortByCampaign.values()) {
      const first = cohort[0];
      const campaign = first.campaign;
      if (
        campaign.accessMode !== "INVITED" ||
        campaign.organizationId === null ||
        !isGroupReportAlias(campaign.template.alias) ||
        !isGroupReportEnabled(null, campaign) ||
        (groupReportRequiresPublishedVersion(campaign.template.alias) &&
          campaign.version.publishedAt === null) ||
        !cohort.every(
          (row) => row.respondentId !== null && entitledIds.has(row.respondentId),
        )
      ) {
        continue;
      }
      groupReports.push({
        submissionId: campaign.id,
        kind: "group",
        href: `/member/reports/team/${encodeURIComponent(campaign.id)}`,
        assessmentName: campaign.template.name,
        reportName: campaign.name?.trim() || campaign.template.name,
        personName: null,
        companyName:
          organizationCount > 1 ? campaign.organization?.name ?? null : null,
        completedAt: first.submittedAt,
        accent: accentFor(campaign.template.alias),
      });
    }

    const hasOpenEvaluations =
      (await tx.assessmentInvitation.count({
        where: {
          respondentId: { in: ownIds },
          revokedAt: null,
          status: { in: ["PENDING", "SENT", "VIEWED"] },
          campaign: { deletedAt: null },
        },
      })) > 0;
    return {
      reports: [...personalReports, ...groupReports].sort(
        (left, right) => right.completedAt.getTime() - left.completedAt.getTime(),
      ),
      hasOpenEvaluations,
    };
  });
}
