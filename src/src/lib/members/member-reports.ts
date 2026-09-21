import { resolveMemberIdentity } from "@/lib/members/identity";

export type MemberReportListItem = {
  submissionId: string;
  assessmentName: string;
  reportName: string;
  personName: string | null;
  companyName: string | null;
  completedAt: Date;
  accent: "purple" | "orange" | "blue" | "green" | "brown";
};

type MemberReportsDb = Parameters<typeof resolveMemberIdentity>[0] & {
  assessmentSubmission: {
    findMany(args: Record<string, unknown>): Promise<
      Array<{
        id: string;
        respondentId: string | null;
        submittedAt: Date;
        respondent: { firstName: string; lastName: string } | null;
        campaign: {
          name: string | null;
          organizationId: string | null;
          organization: { name: string } | null;
          template: { name: string; alias: string };
        };
      }>
    >;
  };
  assessmentInvitation: {
    count(args: Record<string, unknown>): Promise<number>;
  };
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
  const identity = await resolveMemberIdentity(db, normalizedEmail);
  const ownIds = identity.members.map((member) => member.respondentId);
  if (ownIds.length === 0) return { reports: [], hasOpenEvaluations: false };
  const organizationCount = new Set(identity.members.map((member) => member.organizationId)).size;
  const rows = await db.assessmentSubmission.findMany({
    where: {
      respondentId: { in: ownIds },
      submittedAt: { not: null },
      campaign: { deletedAt: null },
    },
    select: {
      id: true,
      respondentId: true,
      submittedAt: true,
      respondent: { select: { firstName: true, lastName: true } },
      campaign: {
        select: {
          name: true,
          organizationId: true,
          organization: { select: { name: true } },
          template: { select: { name: true, alias: true } },
        },
      },
    },
    orderBy: { submittedAt: "desc" },
  });
  const ownSet = new Set(ownIds);
  const reports = rows.map((row) => ({
    submissionId: row.id,
    assessmentName: row.campaign.template.name,
    reportName: row.campaign.name?.trim() || row.campaign.template.name,
    personName:
      row.respondentId && !ownSet.has(row.respondentId) && row.respondent
        ? `${row.respondent.firstName} ${row.respondent.lastName}`.trim()
        : null,
    companyName: organizationCount > 1 ? row.campaign.organization?.name ?? null : null,
    completedAt: row.submittedAt,
    accent: accentFor(row.campaign.template.alias),
  }));
  const hasOpenEvaluations =
    (await db.assessmentInvitation.count({
      where: {
        respondentId: { in: ownIds },
        revokedAt: null,
        status: { in: ["PENDING", "SENT", "VIEWED"] },
        campaign: { deletedAt: null },
      },
    })) > 0;
  return { reports, hasOpenEvaluations };
}
