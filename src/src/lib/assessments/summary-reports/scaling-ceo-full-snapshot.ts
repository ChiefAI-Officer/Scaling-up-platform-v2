import type { ApiActor } from "@/lib/auth/access-control";
import {
  asAccessDb,
  canViewGroupReport,
  type AccessControlDb,
} from "@/lib/assessments/access-control";
import {
  buildGroupReportModel,
  type GroupReportInput,
  type GroupReportParticipantInput,
  type GroupReportSubmissionInput,
} from "@/lib/assessments/group-report-model";

import {
  canonicalJson,
  sha256Hex,
  type ScalingCeoFullSnapshot,
  type SelectedSummarySource,
} from "./canonical";
import { SUMMARY_REPORT_REGISTRY } from "./registry";
import { validateComposition } from "./validation";

type AccessCampaignFindFirstArgs = Parameters<
  AccessControlDb["assessmentCampaign"]["findFirst"]
>[0];
type AccessCampaignFindFirstResult = ReturnType<
  AccessControlDb["assessmentCampaign"]["findFirst"]
>;

interface DestinationCampaignFindFirstArgs {
  where: { id: string; deletedAt: null };
  select: Record<string, unknown>;
}

interface SnapshotSubmissionFindManyArgs {
  where: { id: { in: string[] }; campaignId: { in: string[] } };
  select: Record<string, unknown>;
}

interface DestinationCampaignRow {
  id: string;
  name: string;
  organizationId: string;
  templateId: string;
  versionId: string;
  language: string;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
  accessMode: "INVITED" | "PUBLIC";
  createdByCoachId: string | null;
  deletedAt: Date | null;
  importManifest: unknown;
  organization: { id: string; name: string };
  template: { id: string; alias: string; name: string };
  version: {
    id: string;
    templateId: string;
    versionNumber: number;
    language: string;
    publishedAt: Date | null;
    questions: unknown;
    sections: unknown;
    scoringConfig: unknown;
  };
  creatorCoach: {
    profileImage: string | null;
    firstName: string;
    lastName: string;
  } | null;
}

interface SnapshotSubmissionRow {
  id: string;
  campaignId: string;
  respondentId: string | null;
  submittedAt: Date;
  answers: unknown;
  result: unknown;
  respondent: {
    id: string;
    organizationId: string;
    firstName: string;
    lastName: string;
    jobTitle: string | null;
  } | null;
  invitation: {
    campaignId: string;
    respondentId: string;
    status: "PENDING" | "SENT" | "VIEWED" | "SUBMITTED";
    revokedAt: Date | null;
  } | null;
  campaign: {
    id: string;
    organizationId: string;
    templateId: string;
    versionId: string;
    language: string;
    status: "DRAFT" | "ACTIVE" | "CLOSED";
    accessMode: "INVITED" | "PUBLIC";
    createdByCoachId: string | null;
    deletedAt: Date | null;
    template: { alias: string };
  };
}

export interface SummaryReportSnapshotDb extends Omit<
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
    findMany(
      args: SnapshotSubmissionFindManyArgs,
    ): Promise<SnapshotSubmissionRow[]>;
  };
}

interface SnapshotValidationError {
  code: string;
  message: string;
  submissionId?: string;
}

const SCALING_TEMPLATE_ALIAS = "scaling-up-full";
const definition = SUMMARY_REPORT_REGISTRY.find(
  (candidate) => candidate.type === "SCALING_CEO_FULL",
);

function displayName(row: SnapshotSubmissionRow): string {
  const respondent = row.respondent;
  if (!respondent) return "Respondent";
  const name = `${respondent.firstName} ${respondent.lastName}`.trim();
  return name || respondent.jobTitle?.trim() || "Respondent";
}

function jsonSafe(value: unknown, path = "$"): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Map) {
    const object: Record<string, unknown> = {};
    for (const [key, entry] of value.entries()) {
      if (typeof key !== "string") {
        throw new TypeError(`Snapshot Map key at ${path} must be a string`);
      }
      object[key] = jsonSafe(entry, `${path}.${key}`);
    }
    return object;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => jsonSafe(entry, `${path}[${index}]`));
  }
  if (value !== null && typeof value === "object") {
    const object: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry !== undefined) object[key] = jsonSafe(entry, `${path}.${key}`);
    }
    return object;
  }
  return value;
}

function invalidSource(
  code: string,
  message: string,
  submissionId: string,
): SnapshotValidationError {
  return { code, message, submissionId };
}

function sourceStateErrors(
  selected: SelectedSummarySource,
  row: SnapshotSubmissionRow,
  destination: DestinationCampaignRow,
): SnapshotValidationError[] {
  const errors: SnapshotValidationError[] = [];
  const respondent = row.respondent;
  const invitation = row.invitation;
  const campaign = row.campaign;

  if (
    row.campaignId !== selected.sourceCampaignId ||
    campaign.id !== selected.sourceCampaignId
  ) {
    errors.push(
      invalidSource(
        "source_campaign_mismatch",
        "The selected submission no longer belongs to the selected campaign.",
        selected.submissionId,
      ),
    );
  }

  if (
    !row.respondentId ||
    !respondent ||
    respondent.id !== row.respondentId ||
    !invitation ||
    invitation.status !== "SUBMITTED" ||
    invitation.revokedAt !== null ||
    invitation.campaignId !== row.campaignId ||
    invitation.respondentId !== row.respondentId ||
    campaign.accessMode !== "INVITED" ||
    campaign.deletedAt !== null ||
    (campaign.status !== "ACTIVE" && campaign.status !== "CLOSED")
  ) {
    errors.push(
      invalidSource(
        "source_not_completed",
        "The selected source is no longer a completed invited personal report.",
        selected.submissionId,
      ),
    );
  }

  if (
    campaign.organizationId !== destination.organizationId ||
    respondent?.organizationId !== destination.organizationId ||
    campaign.templateId !== destination.templateId ||
    campaign.versionId !== destination.versionId ||
    campaign.language !== destination.language ||
    campaign.template.alias !== SCALING_TEMPLATE_ALIAS
  ) {
    errors.push(
      invalidSource(
        "source_incompatible",
        "The selected source is no longer compatible with the destination report.",
        selected.submissionId,
      ),
    );
  }

  return errors;
}

function isValidDestination(
  destination: DestinationCampaignRow | null,
): destination is DestinationCampaignRow {
  return Boolean(
    destination &&
    destination.deletedAt === null &&
    destination.accessMode === "INVITED" &&
    destination.template.alias === SCALING_TEMPLATE_ALIAS &&
    destination.template.id === destination.templateId &&
    destination.version.id === destination.versionId &&
    destination.version.templateId === destination.templateId &&
    destination.version.language === destination.language &&
    destination.version.publishedAt !== null &&
    destination.organization.id === destination.organizationId,
  );
}

function roleOrder(role: SelectedSummarySource["role"]): number {
  return (
    definition?.roles.findIndex((contract) => contract.role === role) ?? -1
  );
}

export async function buildScalingCeoFullSnapshot(
  tx: SummaryReportSnapshotDb,
  actor: ApiActor,
  input: {
    destinationCampaignId: string;
    sources: readonly SelectedSummarySource[];
    createdAt: Date;
  },
): Promise<
  | { kind: "ok"; snapshot: ScalingCeoFullSnapshot; inputHash: string }
  | { kind: "invalid"; errors: SnapshotValidationError[] }
  | { kind: "not-found" }
> {
  if (!definition)
    throw new Error("SCALING_CEO_FULL registry definition is missing");

  const composition = validateComposition(definition, input.sources);
  if (!composition.ok) return { kind: "invalid", errors: composition.errors };

  const destinationAuthorized = await canViewGroupReport(
    asAccessDb(tx),
    actor,
    input.destinationCampaignId,
  );
  if (!destinationAuthorized) return { kind: "not-found" };

  const destination = await tx.assessmentCampaign.findFirst({
    where: { id: input.destinationCampaignId, deletedAt: null },
    select: {
      id: true,
      name: true,
      organizationId: true,
      templateId: true,
      versionId: true,
      language: true,
      status: true,
      accessMode: true,
      createdByCoachId: true,
      deletedAt: true,
      importManifest: true,
      organization: { select: { id: true, name: true } },
      template: { select: { id: true, alias: true, name: true } },
      version: {
        select: {
          id: true,
          templateId: true,
          versionNumber: true,
          language: true,
          publishedAt: true,
          questions: true,
          sections: true,
          scoringConfig: true,
        },
      },
      creatorCoach: {
        select: { profileImage: true, firstName: true, lastName: true },
      },
    },
  });
  if (!isValidDestination(destination)) return { kind: "not-found" };

  const authorizedCampaigns = new Map<string, boolean>([
    [input.destinationCampaignId, true],
  ]);
  const distinctSourceCampaignIds = [
    ...new Set(input.sources.map((source) => source.sourceCampaignId)),
  ].filter((campaignId) => campaignId !== input.destinationCampaignId);
  await Promise.all(
    distinctSourceCampaignIds.map(async (campaignId) => {
      authorizedCampaigns.set(
        campaignId,
        await canViewGroupReport(asAccessDb(tx), actor, campaignId),
      );
    }),
  );
  if (
    input.sources.some(
      (source) => authorizedCampaigns.get(source.sourceCampaignId) !== true,
    )
  ) {
    return {
      kind: "invalid",
      errors: [
        {
          code: "source_unavailable",
          message:
            "One or more selected sources are unavailable or unauthorized.",
        },
      ],
    };
  }

  const selectedRows = await tx.assessmentSubmission.findMany({
    where: {
      id: { in: input.sources.map((source) => source.submissionId) },
      campaignId: {
        in: [
          ...new Set(input.sources.map((source) => source.sourceCampaignId)),
        ],
      },
    },
    select: {
      id: true,
      campaignId: true,
      respondentId: true,
      submittedAt: true,
      answers: true,
      result: true,
      respondent: {
        select: {
          id: true,
          organizationId: true,
          firstName: true,
          lastName: true,
          jobTitle: true,
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
          organizationId: true,
          templateId: true,
          versionId: true,
          language: true,
          status: true,
          accessMode: true,
          createdByCoachId: true,
          deletedAt: true,
          template: { select: { alias: true } },
        },
      },
    },
  });

  const rowById = new Map(selectedRows.map((row) => [row.id, row]));
  const stateErrors: SnapshotValidationError[] = [];
  for (const source of input.sources) {
    const row = rowById.get(source.submissionId);
    if (!row) {
      stateErrors.push(
        invalidSource(
          "source_not_found",
          "The selected source is no longer available.",
          source.submissionId,
        ),
      );
      continue;
    }
    stateErrors.push(...sourceStateErrors(source, row, destination));
  }
  if (stateErrors.length > 0) return { kind: "invalid", errors: stateErrors };

  const orderedSources = [...input.sources].sort(
    (left, right) =>
      roleOrder(left.role) - roleOrder(right.role) ||
      left.position - right.position,
  );
  const frozenSources = orderedSources.map((source) => {
    const row = rowById.get(source.submissionId);
    if (!row?.respondent || !row.respondentId) {
      throw new Error(
        "Validated summary report source is missing its respondent",
      );
    }
    return {
      submissionId: source.submissionId,
      sourceCampaignId: source.sourceCampaignId,
      role: source.role as "CEO" | "TEAM",
      position: source.position,
      submittedAt: row.submittedAt.toISOString(),
      respondent: {
        id: row.respondentId,
        displayName: displayName(row),
        jobTitle: row.respondent.jobTitle,
      },
      answers: row.answers,
      result: row.result,
    };
  });

  const participants: GroupReportParticipantInput[] = frozenSources.map(
    (source) => ({
      respondentId: source.respondent.id,
      isCEO: source.role === "CEO",
      respondent: {
        firstName: rowById.get(source.submissionId)?.respondent?.firstName,
        lastName: rowById.get(source.submissionId)?.respondent?.lastName,
        jobTitle: source.respondent.jobTitle,
      },
    }),
  );
  const submissions: GroupReportSubmissionInput[] = frozenSources.map(
    (source) => ({
      respondentId: source.respondent.id,
      answers: source.answers,
      result: source.result,
      respondent: participants.find(
        (participant) => participant.respondentId === source.respondent.id,
      )?.respondent,
    }),
  );
  const modelInput: GroupReportInput = {
    alias: SCALING_TEMPLATE_ALIAS,
    version: {
      questions: destination.version.questions,
      sections: destination.version.sections,
      scoringConfig: destination.version.scoringConfig,
    },
    participants,
    submissions,
  };
  const reportModel = buildGroupReportModel(modelInput);
  const modelContentHash = sha256Hex(
    canonicalJson(
      jsonSafe({
        versionId: destination.versionId,
        alias: SCALING_TEMPLATE_ALIAS,
        submissions: frozenSources.map((source) => ({
          id: source.submissionId,
          respondentId: source.respondent.id,
          answers: source.answers,
          result: source.result,
        })),
      }),
    ),
  );
  const creatorCoach = destination.creatorCoach;
  const coachName = creatorCoach
    ? `${creatorCoach.firstName} ${creatorCoach.lastName}`.trim()
    : null;
  const ceoSource = frozenSources.find((source) => source.role === "CEO");

  const snapshot = jsonSafe({
    schemaVersion: 1,
    reportType: "SCALING_CEO_FULL",
    destination: {
      campaignId: destination.id,
      campaignName: destination.name,
      organizationId: destination.organizationId,
      organizationName: destination.organization.name,
      templateId: destination.templateId,
      templateAlias: SCALING_TEMPLATE_ALIAS,
      versionId: destination.versionId,
      versionNumber: destination.version.versionNumber,
      language: destination.language,
    },
    createdAt: input.createdAt,
    sources: frozenSources,
    reportModel,
    provenance: {
      generatedAt: input.createdAt,
      completedCount: frozenSources.length,
      invitedCount: frozenSources.length,
      versionId: destination.versionId,
      templateAlias: SCALING_TEMPLATE_ALIAS,
      ceoParticipantId: ceoSource?.respondent.id ?? null,
      contentHash: modelContentHash,
      submissionIds: frozenSources.map((source) => source.submissionId),
      companyName: destination.organization.name,
      assessmentName: destination.template.name,
      versionLabel: `${SCALING_TEMPLATE_ALIAS}-v${destination.version.versionNumber}`,
      coachLogoUrl: creatorCoach?.profileImage ?? null,
      coachName,
      isImported: destination.importManifest != null,
      benchmarkVersion: reportModel.benchmarkVersion,
      benchmarkKeyMismatch: reportModel.benchmarkKeyMismatch,
    },
  }) as ScalingCeoFullSnapshot;
  const inputHash = sha256Hex(canonicalJson(snapshot));

  return { kind: "ok", snapshot, inputHash };
}
