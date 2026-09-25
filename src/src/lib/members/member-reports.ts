import type { Prisma } from "@prisma/client";
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
import { isMemberReportGroupingEnabled } from "@/lib/members/flags";

export type MemberReportAccent = "purple" | "orange" | "blue" | "green" | "brown";

export type MemberReportListItem = {
  campaignId: string;
  campaignName: string;
  submissionId: string;
  kind: "personal" | "group";
  href: string;
  assessmentName: string;
  reportName: string;
  personName: string | null;
  companyName: string | null;
  completedAt: Date;
  accent: MemberReportAccent;
};

export type MemberReportGroup = {
  campaignId: string;
  campaignName: string;
  assessmentName: string;
  companyName: string | null;
  completedAt: Date;
  accent: MemberReportAccent;
  reports: MemberReportListItem[];
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

export const MEMBER_REPORT_ACCENT_BY_ALIAS: Readonly<
  Record<string, MemberReportAccent>
> = Object.freeze({
  RockHabits: "orange",
  "qsp-v1": "green",
  "qsp-v2": "green",
  "leadership-vision-alignment": "blue",
  "scaling-up-full": "brown",
  "five-dysfunctions": "purple",
  "scaling-up-quick": "purple",
});

export const MEMBER_REPORT_DEFAULT_ACCENT: MemberReportAccent = "purple";

function legacyAccentFor(alias: string): MemberReportAccent {
  if (alias.includes("rockefeller")) return "orange";
  if (alias.includes("leadership") || alias.includes("lva")) return "blue";
  if (alias.includes("quarterly")) return "green";
  if (alias.includes("full")) return "brown";
  return MEMBER_REPORT_DEFAULT_ACCENT;
}

function accentFor(alias: string, useCorrectedAccents: boolean): MemberReportAccent {
  return useCorrectedAccents
    ? MEMBER_REPORT_ACCENT_BY_ALIAS[alias] ?? MEMBER_REPORT_DEFAULT_ACCENT
    : legacyAccentFor(alias);
}

function campaignDisplayName(campaign: ReportRow["campaign"]): string {
  return campaign.name?.trim() || campaign.template.name;
}

function reportOrder(left: MemberReportListItem, right: MemberReportListItem): number {
  const rank = (report: MemberReportListItem) => {
    if (report.kind === "group") return 0;
    if (report.personName === null) return 1;
    return 2;
  };
  const rankDifference = rank(left) - rank(right);
  if (rankDifference !== 0) return rankDifference;
  return (left.personName ?? "").localeCompare(right.personName ?? "", "en", {
    sensitivity: "base",
  });
}

export function groupMemberReports(
  reports: MemberReportListItem[],
): MemberReportGroup[] {
  const byCampaign = new Map<string, MemberReportListItem[]>();
  for (const report of reports) {
    const campaignReports = byCampaign.get(report.campaignId) ?? [];
    campaignReports.push(report);
    byCampaign.set(report.campaignId, campaignReports);
  }

  return [...byCampaign.entries()]
    .map(([campaignId, campaignReports]) => {
      const first = campaignReports[0];
      const completedAt = campaignReports.reduce(
        (latest, report) =>
          report.completedAt.getTime() > latest.getTime()
            ? report.completedAt
            : latest,
        first.completedAt,
      );
      return {
        campaignId,
        campaignName: first.campaignName,
        assessmentName: first.assessmentName,
        companyName: first.companyName,
        completedAt,
        accent: first.accent,
        reports: [...campaignReports].sort(reportOrder),
      };
    })
    .sort(
      (left, right) =>
        right.completedAt.getTime() - left.completedAt.getTime(),
    );
}

export async function listMemberReports(
  db: MemberReportsDb,
  normalizedEmail: string,
): Promise<{
  reports: MemberReportListItem[];
  groups: MemberReportGroup[];
  hasOpenEvaluations: boolean;
}> {
  return db.$transaction(async (tx) => {
    const identity = await resolveMemberIdentity(tx, normalizedEmail);
    const ownIds = identity.members.map((member) => member.respondentId);
    if (ownIds.length === 0) {
      return { reports: [], groups: [], hasOpenEvaluations: false };
    }

    const entitledIds = await entitlementFor(
      identity.members,
      createMemberEntitlementReader(tx),
    );
    const organizationIds = [...new Set(identity.members.map((member) => member.organizationId))];
    const useCorrectedAccents = isMemberReportGroupingEnabled();
    const submissionQuery = {
      where: {
        respondentId: { not: null },
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
    } satisfies Prisma.AssessmentSubmissionFindManyArgs;
    const rows = await tx.assessmentSubmission.findMany(submissionQuery);
    const ownSet = new Set(ownIds);
    const visibleRows = rows.filter(
      (row) => row.respondentId !== null && entitledIds.has(row.respondentId),
    );
    const visibleOrganizationIds = new Set(
      visibleRows.flatMap((row) =>
        row.campaign.organizationId ? [row.campaign.organizationId] : [],
      ),
    );
    const showCompanyName = visibleOrganizationIds.size > 1;
    const personalReports: MemberReportListItem[] = visibleRows
      .map((row) => ({
        campaignId: row.campaign.id,
        campaignName: campaignDisplayName(row.campaign),
        submissionId: row.id,
        kind: "personal",
        href: `/member/reports/${encodeURIComponent(row.id)}`,
        assessmentName: row.campaign.template.name,
        reportName: campaignDisplayName(row.campaign),
        personName:
          row.respondentId && !ownSet.has(row.respondentId) && row.respondent
            ? `${row.respondent.firstName} ${row.respondent.lastName}`.trim()
            : null,
        companyName: showCompanyName
          ? row.campaign.organization?.name ?? null
          : null,
        completedAt: row.submittedAt,
        accent: accentFor(row.campaign.template.alias, useCorrectedAccents),
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
        campaignId: campaign.id,
        campaignName: campaignDisplayName(campaign),
        submissionId: campaign.id,
        kind: "group",
        href: `/member/reports/team/${encodeURIComponent(campaign.id)}`,
        assessmentName: campaign.template.name,
        reportName: campaignDisplayName(campaign),
        personName: null,
        companyName: showCompanyName
          ? campaign.organization?.name ?? null
          : null,
        completedAt: first.submittedAt,
        accent: accentFor(campaign.template.alias, useCorrectedAccents),
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
    const reports = [...personalReports, ...groupReports].sort(
        (left, right) => right.completedAt.getTime() - left.completedAt.getTime(),
      );
    return {
      reports,
      groups: groupMemberReports(reports),
      hasOpenEvaluations,
    };
  });
}
