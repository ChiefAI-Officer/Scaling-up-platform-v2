import type { ApiActor } from "@/lib/auth/access-control";
import type { PrismaClient } from "@prisma/client";
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
    "WRONG_FAMILY" | "WRONG_ORGANIZATION" | "INCOMPATIBLE_VERSION" | null;
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

export interface SummaryReportCandidateDb extends Omit<
  AccessControlDb,
  "assessmentCampaign"
> {
  assessmentCampaign: {
    findFirst(args: AccessCampaignFindFirstArgs): AccessCampaignFindFirstResult;
    findFirst(
      args: DestinationCampaignFindFirstArgs,
    ): Promise<DestinationCampaignRow | null>;
  };
  assessmentSubmission: {
    findMany: (
      args: CandidateSubmissionFindManyArgs,
    ) => Promise<CandidateSubmissionRow[]>;
  };
}

interface CandidateSubmissionFindManyArgs {
  where: {
    respondentId: { not: null };
    campaignId?: string;
    respondent: { is: { deletedAt: null } };
    invitation: { is: { status: "SUBMITTED"; revokedAt: null } };
    campaign: {
      organizationId: string;
      accessMode: "INVITED";
      status: { in: Array<"ACTIVE" | "CLOSED"> };
      deletedAt: null;
      template: { alias: string };
    };
  };
  select: Record<string, unknown>;
  orderBy: [{ submittedAt: "desc" }, { id: "asc" }];
}

interface DestinationCampaignRow {
  id: string;
  organizationId: string | null;
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
    deletedAt: Date | null;
  } | null;
  invitation: {
    campaignId: string;
    respondentId: string;
    status: "PENDING" | "SENT" | "VIEWED" | "SUBMITTED";
    revokedAt: Date | null;
  } | null;
  campaign: {
    id: string;
    name: string;
    organizationId: string | null;
    templateId: string;
    versionId: string;
    language: string;
    status: "DRAFT" | "ACTIVE" | "CLOSED";
    accessMode: "INVITED" | "PUBLIC";
    deletedAt: Date | null;
    organization: { id: string; name: string } | null;
    template: { alias: string };
    version: { versionNumber: number };
  };
}

const SCALING_TEMPLATE_ALIAS = "scaling-up-full";

function createCampaignDelegate(
  client: PrismaClient,
): SummaryReportCandidateDb["assessmentCampaign"] {
  async function findFirst(
    args: AccessCampaignFindFirstArgs,
  ): AccessCampaignFindFirstResult;
  async function findFirst(
    args: DestinationCampaignFindFirstArgs,
  ): Promise<DestinationCampaignRow | null>;
  async function findFirst(
    args: AccessCampaignFindFirstArgs | DestinationCampaignFindFirstArgs,
  ): Promise<
    Awaited<AccessCampaignFindFirstResult> | DestinationCampaignRow | null
  > {
    if ("select" in args && args.select) {
      return client.assessmentCampaign.findFirst({
        where: { id: args.where.id, deletedAt: null },
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
    }
    return client.assessmentCampaign.findFirst({
      where: { id: args.where.id, deletedAt: args.where.deletedAt },
      select: {
        id: true,
        organizationId: true,
        templateId: true,
        createdByCoachId: true,
        status: true,
        deletedAt: true,
      },
    });
  }
  return { findFirst };
}

export function createPrismaSummaryReportCandidateDb(
  client: PrismaClient,
): SummaryReportCandidateDb {
  return {
    accessGroupCoach: {
      findMany(args) {
        return client.accessGroupCoach.findMany({
          where: args.where?.coachId
            ? { coachId: args.where.coachId }
            : undefined,
          select: {
            accessGroupId: true,
            coachId: true,
            accessGroup: { select: { id: true, deletedAt: true } },
          },
        });
      },
    },
    accessGroupTemplate: {
      findMany(args) {
        return client.accessGroupTemplate.findMany({
          where: {
            accessGroupId: args.where?.accessGroupId?.in
              ? { in: args.where.accessGroupId.in }
              : undefined,
            templateId: args.where?.templateId,
          },
          select: { accessGroupId: true, templateId: true },
        });
      },
    },
    organization: {
      findUnique(args) {
        return client.organization.findUnique({
          where: { id: args.where.id },
          select: { id: true, ownerCoachId: true, deletedAt: true },
        });
      },
    },
    coach: {
      findUnique(args) {
        return client.coach.findUnique({
          where: { id: args.where.id },
          select: { id: true, certificationStatus: true },
        });
      },
    },
    assessmentCampaign: createCampaignDelegate(client),
    assessmentSubmission: {
      findMany(args) {
        return client.assessmentSubmission.findMany({
          where: args.where,
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
                deletedAt: true,
              },
            },
            invitation: {
              select: {
                campaignId: true,
                respondentId: true,
                status: true,
                revokedAt: true,
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
          orderBy: args.orderBy,
        });
      },
    },
  } satisfies SummaryReportCandidateDb;
}

export async function listSummaryReportCandidates(
  db: SummaryReportCandidateDb,
  actor: ApiActor,
  input: {
    destinationCampaignId: string;
    reportType: SummaryReportType;
    scope: CandidateScope;
  },
): Promise<
  { kind: "ok"; candidates: SummaryReportCandidate[] } | { kind: "not-found" }
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
    destination.organizationId === null ||
    destination.accessMode !== "INVITED" ||
    input.reportType !== "SCALING_CEO_FULL" ||
    destination.template.alias !== SCALING_TEMPLATE_ALIAS
  ) {
    return { kind: "not-found" };
  }

  const rows = await db.assessmentSubmission.findMany({
    where: {
      respondentId: { not: null },
      respondent: { is: { deletedAt: null } },
      invitation: { is: { status: "SUBMITTED", revokedAt: null } },
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
          deletedAt: true,
        },
      },
      invitation: {
        select: {
          campaignId: true,
          respondentId: true,
          status: true,
          revokedAt: true,
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
      row.respondent.deletedAt === null &&
      row.invitation !== null &&
      row.invitation.status === "SUBMITTED" &&
      row.invitation.revokedAt === null &&
      row.invitation.campaignId === row.campaignId &&
      row.invitation.respondentId === row.respondentId &&
      row.campaignId === source.id &&
      (input.scope === "all" || source.id === destination.id) &&
      source.organizationId !== null &&
      source.organization !== null &&
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
      if (source.organizationId === null || source.organization === null) {
        throw new Error("Filtered candidate is missing an organization");
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
