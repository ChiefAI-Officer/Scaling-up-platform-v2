import type { ApiActor } from "@/lib/auth/access-control";
import {
  asAccessDb,
  canViewGroupReport,
  type AccessControlDb,
} from "@/lib/assessments/access-control";
import type { SummaryReportType } from "./types";

export type CandidateScope = "current" | "all";

export interface SummaryReportCandidate {
  submissionId: string;
  campaignId: string;
  campaignName: string;
  respondentId: string;
  respondentName: string;
  jobTitle: string | null;
  organizationId: string;
  organizationName: string;
  templateId: string;
  templateAlias: string;
  versionId: string;
  versionNumber: number;
  language: string;
  submittedAt: string;
  eligible: boolean;
  disabledReason:
    | "WRONG_FAMILY"
    | "WRONG_ORGANIZATION"
    | "INCOMPATIBLE_VERSION"
    | null;
}

type AccessCampaignFindFirstArgs = Parameters<
  AccessControlDb["assessmentCampaign"]["findFirst"]
>[0];

type AccessCampaignFindFirstResult = ReturnType<
  AccessControlDb["assessmentCampaign"]["findFirst"]
>;

interface DestinationCampaignFindFirstArgs {
  where: { id: string; deletedAt: null };
  select: {
    id: true;
    organizationId: true;
    templateId: true;
    versionId: true;
    language: true;
    accessMode: true;
    template: { select: { alias: true } };
  };
}

export interface SummaryReportCandidateDb
  extends Omit<AccessControlDb, "assessmentCampaign"> {
  assessmentCampaign: {
    findFirst(
      args: AccessCampaignFindFirstArgs,
    ): AccessCampaignFindFirstResult;
    findFirst(
      args: DestinationCampaignFindFirstArgs,
    ): Promise<DestinationCampaignRow | null>;
  };
  assessmentSubmission: {
    findMany: (args: {
      where: Record<string, unknown>;
      select: Record<string, unknown>;
      orderBy: Array<Record<string, "asc" | "desc">>;
    }) => Promise<CandidateSubmissionRow[]>;
  };
}

interface DestinationCampaignRow {
  id: string;
  organizationId: string;
  templateId: string;
  versionId: string;
  language: string;
  accessMode: "INVITED" | "PUBLIC";
  template: { alias: string };
}

interface CandidateSubmissionRow {
  id: string;
  campaignId: string;
  respondentId: string | null;
  submittedAt: Date;
  respondent: {
    id: string;
    firstName: string;
    lastName: string;
    jobTitle: string | null;
    organizationId: string;
  } | null;
  campaign: {
    id: string;
    name: string;
    organizationId: string;
    templateId: string;
    versionId: string;
    language: string;
    status: "DRAFT" | "ACTIVE" | "CLOSED";
    accessMode: "INVITED" | "PUBLIC";
    deletedAt: Date | null;
    organization: { id: string; name: string };
    template: { alias: string };
    version: { versionNumber: number };
  };
}

const SCALING_TEMPLATE_ALIAS = "scaling-up-full";

export async function listSummaryReportCandidates(
  db: SummaryReportCandidateDb,
  actor: ApiActor,
  input: {
    destinationCampaignId: string;
    reportType: SummaryReportType;
    scope: CandidateScope;
  },
): Promise<
  | { kind: "ok"; candidates: SummaryReportCandidate[] }
  | { kind: "not-found" }
> {
  const authorized = await canViewGroupReport(
    asAccessDb(db),
    actor,
    input.destinationCampaignId,
  );
  if (!authorized) return { kind: "not-found" };

  const destination = await db.assessmentCampaign.findFirst({
    where: { id: input.destinationCampaignId, deletedAt: null },
    select: {
      id: true,
      organizationId: true,
      templateId: true,
      versionId: true,
      language: true,
      accessMode: true,
      template: { select: { alias: true } },
    },
  });
  if (
    !destination ||
    destination.accessMode !== "INVITED" ||
    input.reportType !== "SCALING_CEO_FULL" ||
    destination.template.alias !== SCALING_TEMPLATE_ALIAS
  ) {
    return { kind: "not-found" };
  }

  const rows = await db.assessmentSubmission.findMany({
    where: {
      respondentId: { not: null },
      ...(input.scope === "current"
        ? { campaignId: input.destinationCampaignId }
        : {}),
      campaign: {
        organizationId: destination.organizationId,
        accessMode: "INVITED",
        status: { in: ["ACTIVE", "CLOSED"] },
        deletedAt: null,
        template: { alias: SCALING_TEMPLATE_ALIAS },
      },
    },
    select: {
      id: true,
      campaignId: true,
      respondentId: true,
      submittedAt: true,
      respondent: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          jobTitle: true,
          organizationId: true,
        },
      },
      campaign: {
        select: {
          id: true,
          name: true,
          organizationId: true,
          templateId: true,
          versionId: true,
          language: true,
          status: true,
          accessMode: true,
          deletedAt: true,
          organization: { select: { id: true, name: true } },
          template: { select: { alias: true } },
          version: { select: { versionNumber: true } },
        },
      },
    },
    orderBy: [{ submittedAt: "desc" }, { id: "asc" }],
  });

  const inScopeRows = rows.filter((row) => {
    const source = row.campaign;
    return (
      row.respondentId !== null &&
      row.respondent !== null &&
      row.respondent.id === row.respondentId &&
      row.campaignId === source.id &&
      (input.scope === "all" || source.id === destination.id) &&
      source.organizationId === destination.organizationId &&
      row.respondent.organizationId === destination.organizationId &&
      source.organization.id === destination.organizationId &&
      source.accessMode === "INVITED" &&
      (source.status === "ACTIVE" || source.status === "CLOSED") &&
      source.deletedAt === null &&
      source.template.alias === SCALING_TEMPLATE_ALIAS
    );
  });

  const sourceAuthorization = new Map<string, boolean>([
    [destination.id, true],
  ]);
  const distinctSourceCampaignIds = [
    ...new Set(inScopeRows.map((row) => row.campaignId)),
  ].filter((campaignId) => campaignId !== destination.id);
  await Promise.all(
    distinctSourceCampaignIds.map(async (campaignId) => {
      sourceAuthorization.set(
        campaignId,
        await canViewGroupReport(asAccessDb(db), actor, campaignId),
      );
    }),
  );

  const candidates = inScopeRows
    .filter((row) => sourceAuthorization.get(row.campaignId) === true)
    .map((row): SummaryReportCandidate => {
      const { campaign: source, respondent } = row;
      if (!respondent) {
        throw new Error("Filtered candidate is missing a respondent");
      }
      const compatible =
        source.templateId === destination.templateId &&
        source.versionId === destination.versionId &&
        source.language === destination.language;

      return {
        submissionId: row.id,
        campaignId: source.id,
        campaignName: source.name,
        respondentId: respondent.id,
        respondentName: `${respondent.firstName} ${respondent.lastName}`.trim(),
        jobTitle: respondent.jobTitle,
        organizationId: source.organizationId,
        organizationName: source.organization.name,
        templateId: source.templateId,
        templateAlias: source.template.alias,
        versionId: source.versionId,
        versionNumber: source.version.versionNumber,
        language: source.language,
        submittedAt: row.submittedAt.toISOString(),
        eligible: compatible,
        disabledReason: compatible ? null : "INCOMPATIBLE_VERSION",
      };
    })
    .sort(
      (left, right) =>
        right.submittedAt.localeCompare(left.submittedAt) ||
        left.submissionId.localeCompare(right.submissionId),
    );

  return { kind: "ok", candidates };
}
