import { Prisma, PrismaClient } from "@prisma/client";

export const LEGACY_AUDIT_EVIDENCE_CODES = [
  "RESPONDENT_OUTBOX_MISSING",
  "OWNING_COACH_OUTBOX_MISSING",
  "CAMPAIGN_DELETED",
  "CAMPAIGN_NOT_ACTIVE",
  "INVITATION_REVOKED",
  "INVITATION_NOT_SUBMITTED",
  "INVITATION_EXPIRED",
  "RESPONDENT_DELETED",
  "RESPONDENT_ROLE_CURRENTLY_DISABLED",
  "OWNING_COACH_ROLE_CURRENTLY_DISABLED",
  "RESPONDENT_APPROVAL_CURRENTLY_INVALID",
  "OWNING_COACH_CURRENTLY_MISSING",
] as const;

type LegacyAuditEvidenceCode = (typeof LEGACY_AUDIT_EVIDENCE_CODES)[number];
type LegacyRecipientRole = "RESPONDENT" | "OWNING_COACH";

export type LegacyAuditReport = {
  classification: "UNVERIFIABLE_CANDIDATE";
  generatedAt: string;
  counts: {
    submissionsInspected: number;
    missingRespondentRole: number;
    missingCoachRole: number;
  };
  candidates: Array<{
    submissionId: string;
    campaignId: string;
    invitationId: string;
    missingRoles: LegacyRecipientRole[];
    currentEvidenceCodes: string[];
  }>;
};

type LegacyAuditRow = {
  submissionId: string;
  campaignId: string;
  invitationId: string;
  hasRespondentOutbox: boolean;
  hasCoachOutbox: boolean;
  campaignDeleted: boolean;
  campaignStatus: string;
  invitationRevoked: boolean;
  invitationStatus: string;
  invitationExpired: boolean;
  respondentDeleted: boolean;
  respondentRoleCurrentlyEnabled: boolean;
  coachRoleCurrentlyEnabled: boolean;
  respondentApprovalCurrentlyValid: boolean;
  coachOwnerCurrentlyPresent: boolean;
};

type QueryRawClient = {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
};

export type LegacyAuditArgs = {
  since?: Date;
  until: Date;
};

function parseCanonicalIsoDate(name: string, value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error(`${name} must be a canonical ISO timestamp.`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`${name} must be a valid canonical ISO timestamp.`);
  }
  return parsed;
}

export function parseLegacyAuditArgs(argv: string[]): LegacyAuditArgs {
  let since: Date | undefined;
  let until: Date | undefined;
  let sawSince = false;
  let sawUntil = false;

  for (const argument of argv) {
    if (argument.startsWith("--since=")) {
      if (sawSince) throw new Error("--since may be supplied only once.");
      sawSince = true;
      since = parseCanonicalIsoDate("--since", argument.slice("--since=".length));
      continue;
    }
    if (argument.startsWith("--until=")) {
      if (sawUntil) throw new Error("--until may be supplied only once.");
      sawUntil = true;
      until = parseCanonicalIsoDate("--until", argument.slice("--until=".length));
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!until) {
    throw new Error("Required argument --until=<ISO> was not supplied.");
  }
  if (since && since.getTime() >= until.getTime()) {
    throw new Error("--since must be earlier than --until.");
  }

  return { ...(since ? { since } : {}), until };
}

function evidenceCodes(row: LegacyAuditRow): LegacyAuditEvidenceCode[] {
  const codes: LegacyAuditEvidenceCode[] = [];
  if (!row.hasRespondentOutbox) codes.push("RESPONDENT_OUTBOX_MISSING");
  if (!row.hasCoachOutbox) codes.push("OWNING_COACH_OUTBOX_MISSING");
  if (row.campaignDeleted) codes.push("CAMPAIGN_DELETED");
  if (row.campaignStatus !== "ACTIVE") codes.push("CAMPAIGN_NOT_ACTIVE");
  if (row.invitationRevoked) codes.push("INVITATION_REVOKED");
  if (row.invitationStatus !== "SUBMITTED") codes.push("INVITATION_NOT_SUBMITTED");
  if (row.invitationExpired) codes.push("INVITATION_EXPIRED");
  if (row.respondentDeleted) codes.push("RESPONDENT_DELETED");
  if (!row.respondentRoleCurrentlyEnabled) {
    codes.push("RESPONDENT_ROLE_CURRENTLY_DISABLED");
  }
  if (!row.coachRoleCurrentlyEnabled) {
    codes.push("OWNING_COACH_ROLE_CURRENTLY_DISABLED");
  }
  if (!row.respondentApprovalCurrentlyValid) {
    codes.push("RESPONDENT_APPROVAL_CURRENTLY_INVALID");
  }
  if (!row.coachOwnerCurrentlyPresent) {
    codes.push("OWNING_COACH_CURRENTLY_MISSING");
  }
  return codes;
}

export async function auditLegacyAssessmentEmailGaps(input: {
  prisma: QueryRawClient;
  since?: Date;
  until: Date;
  now?: Date;
}): Promise<LegacyAuditReport> {
  const generatedAt = input.now ?? new Date();
  const rows = await input.prisma.$queryRaw<LegacyAuditRow[]>(Prisma.sql`
    WITH invited_submissions AS (
      SELECT
        submission."id" AS "submissionId",
        submission."campaignId" AS "campaignId",
        submission."invitationId" AS "invitationId",
        campaign."deletedAt" IS NOT NULL AS "campaignDeleted",
        campaign."status"::text AS "campaignStatus",
        invitation."revokedAt" IS NOT NULL AS "invitationRevoked",
        invitation."status"::text AS "invitationStatus",
        invitation."expiresAt" <= ${generatedAt} AS "invitationExpired",
        respondent."deletedAt" IS NOT NULL AS "respondentDeleted",
        campaign."sendResultsToRespondent" AS "respondentRoleCurrentlyEnabled",
        campaign."notifyCoachOnCompletion" AS "coachRoleCurrentlyEnabled",
        (
          template."resultsEmailContentApproved" = TRUE
          AND template."resultsEmailContentApprovedHash" IS NOT NULL
        ) AS "respondentApprovalCurrentlyValid",
        campaign."createdByCoachId" IS NOT NULL AS "coachOwnerCurrentlyPresent"
      FROM "assessment_submissions" AS submission
      INNER JOIN "assessment_campaigns" AS campaign
        ON campaign."id" = submission."campaignId"
      INNER JOIN "assessment_invitations" AS invitation
        ON invitation."id" = submission."invitationId"
      INNER JOIN "org_respondents" AS respondent
        ON respondent."id" = submission."respondentId"
      INNER JOIN "assessment_templates" AS template
        ON template."id" = campaign."templateId"
      WHERE submission."invitationId" IS NOT NULL
        AND submission."submittedAt" < ${input.until}
        ${input.since
          ? Prisma.sql`AND submission."submittedAt" >= ${input.since}`
          : Prisma.empty}
    )
    SELECT
      invited."submissionId",
      invited."campaignId",
      invited."invitationId",
      EXISTS (
        SELECT 1
        FROM "assessment_email_outbox" AS respondent_outbox
        WHERE respondent_outbox."submissionId" = invited."submissionId"
          AND respondent_outbox."recipientRole" = 'RESPONDENT'
      ) AS "hasRespondentOutbox",
      EXISTS (
        SELECT 1
        FROM "assessment_email_outbox" AS coach_outbox
        WHERE coach_outbox."submissionId" = invited."submissionId"
          AND coach_outbox."recipientRole" = 'OWNING_COACH'
      ) AS "hasCoachOutbox",
      invited."campaignDeleted",
      invited."campaignStatus",
      invited."invitationRevoked",
      invited."invitationStatus",
      invited."invitationExpired",
      invited."respondentDeleted",
      invited."respondentRoleCurrentlyEnabled",
      invited."coachRoleCurrentlyEnabled",
      invited."respondentApprovalCurrentlyValid",
      invited."coachOwnerCurrentlyPresent"
    FROM invited_submissions AS invited
    ORDER BY invited."submissionId" ASC
  `);

  const candidates = rows
    .map((row) => {
      const missingRoles: LegacyRecipientRole[] = [];
      if (!row.hasRespondentOutbox) missingRoles.push("RESPONDENT");
      if (!row.hasCoachOutbox) missingRoles.push("OWNING_COACH");
      return {
        submissionId: row.submissionId,
        campaignId: row.campaignId,
        invitationId: row.invitationId,
        missingRoles,
        currentEvidenceCodes: evidenceCodes(row),
      };
    })
    .filter((candidate) => candidate.missingRoles.length > 0)
    .sort((left, right) => left.submissionId.localeCompare(right.submissionId));

  return {
    classification: "UNVERIFIABLE_CANDIDATE",
    generatedAt: generatedAt.toISOString(),
    counts: {
      submissionsInspected: rows.length,
      missingRespondentRole: candidates.filter((candidate) =>
        candidate.missingRoles.includes("RESPONDENT"),
      ).length,
      missingCoachRole: candidates.filter((candidate) =>
        candidate.missingRoles.includes("OWNING_COACH"),
      ).length,
    },
    candidates,
  };
}

async function main(): Promise<void> {
  const args = parseLegacyAuditArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    const report = await auditLegacyAssessmentEmailGaps({ prisma, ...args });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch(() => {
    process.stderr.write("Legacy audit failed.\n");
    process.exitCode = 1;
  });
}
