import { Prisma, type PrismaClient } from "@prisma/client";
import type { ApiActor } from "@/lib/auth/access-control";
import {
  canViewGroupReport,
  type AccessControlDb,
} from "@/lib/assessments/access-control";

import {
  createSummaryArtifactStore,
  type SummaryArtifactStore,
} from "./artifact-store";
import {
  canonicalJson,
  type ScalingCeoFullSnapshot,
  type SelectedSummarySource,
} from "./canonical";
import { renderSummaryReportPdf } from "./renderers";
import {
  buildScalingCeoFullSnapshot,
  type SummaryReportSnapshotDb,
} from "./scaling-ceo-full-snapshot";

export interface CreateSummaryReportCommand {
  destinationCampaignId: string;
  reportType: "SCALING_CEO_FULL";
  creationRequestId: string;
  sources: SelectedSummarySource[];
}

interface SummaryReportInvalidError {
  code: string;
  message: string;
  submissionId?: string;
}

export type CreateSummaryReportResult =
  | { kind: "created" | "existing"; report: SummaryReportListItem }
  | { kind: "invalid"; errors: SummaryReportInvalidError[] }
  | { kind: "not-found" }
  | { kind: "render-failed" };

type SnapshotResult = Awaited<ReturnType<typeof buildScalingCeoFullSnapshot>>;

export interface SummaryReportOperationalError {
  event: "summary-report-create-failed";
  stage: "render" | "upload" | "persist";
  reportType: "SCALING_CEO_FULL";
  campaignId: string;
  creationRequestId: string;
  errorClass: string;
}

export interface CreateSummaryReportDependencies {
  artifactStore?: SummaryArtifactStore;
  buildSnapshot?: (
    tx: SummaryReportSnapshotDb,
    actor: ApiActor,
    input: {
      destinationCampaignId: string;
      sources: readonly SelectedSummarySource[];
      createdAt: Date;
    },
  ) => Promise<SnapshotResult>;
  renderPdf?: (
    reportType: "SCALING_CEO_FULL",
    snapshot: ScalingCeoFullSnapshot,
  ) => Promise<{ bytes: Buffer; rendererVersion: string }>;
  canViewCampaign?: (
    db: AccessControlDb,
    actor: ApiActor,
    campaignId: string,
  ) => Promise<boolean>;
  now?: () => Date;
  logOperationalError?: (event: SummaryReportOperationalError) => void;
}

const REPORT_LIST_SELECT = Prisma.validator<Prisma.SummaryReportSelect>()({
  id: true,
  campaignId: true,
  reportType: true,
  name: true,
  createdByUserId: true,
  createdByEmailSnapshot: true,
  createdAt: true,
});

export type SummaryReportListItem = Prisma.SummaryReportGetPayload<{
  select: typeof REPORT_LIST_SELECT;
}>;

export interface SummaryReportCreateTransaction {
  snapshotDb: SummaryReportSnapshotDb;
  createReport(
    data: Prisma.SummaryReportUncheckedCreateInput,
  ): Promise<SummaryReportListItem>;
  createSources(
    data: Prisma.SummaryReportSourceCreateManyInput[],
  ): Promise<void>;
  createAudit(data: Prisma.AuditLogUncheckedCreateInput): Promise<void>;
}

export interface SummaryReportCreateDb {
  accessDb: AccessControlDb;
  findByCreationRequestId(
    creationRequestId: string,
  ): Promise<SummaryReportListItem | null>;
  repeatableRead<T>(
    callback: (tx: SummaryReportCreateTransaction) => Promise<T>,
  ): Promise<T>;
}

const SNAPSHOT_CAMPAIGN_SELECT =
  Prisma.validator<Prisma.AssessmentCampaignSelect>()({
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
  });

const SNAPSHOT_SUBMISSION_SELECT =
  Prisma.validator<Prisma.AssessmentSubmissionSelect>()({
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
  });

function createPrismaSnapshotDb(
  client: Prisma.TransactionClient,
): SummaryReportSnapshotDb {
  const snapshotDb = {
    accessGroupCoach: {
      async findMany(args) {
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
      async findMany(args) {
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
      async findUnique(args) {
        return client.organization.findUnique({
          where: { id: args.where.id },
          select: {
            id: true,
            ownerCoachId: true,
            deletedAt: true,
          },
        });
      },
    },
    coach: {
      async findUnique(args) {
        return client.coach.findUnique({
          where: { id: args.where.id },
          select: { id: true, certificationStatus: true },
        });
      },
    },
    assessmentCampaign: {
      async findFirst(args: {
        where: { id: string; deletedAt?: Date | null };
        select?: Record<string, unknown>;
      }) {
        return client.assessmentCampaign.findFirst({
          where: {
            id: args.where.id,
            deletedAt: args.where.deletedAt,
          },
          select: SNAPSHOT_CAMPAIGN_SELECT,
        });
      },
    },
    assessmentSubmission: {
      async findMany(args) {
        return client.assessmentSubmission.findMany({
          where: {
            id: { in: args.where.id.in },
            campaignId: { in: args.where.campaignId.in },
          },
          select: SNAPSHOT_SUBMISSION_SELECT,
        });
      },
    },
  } satisfies SummaryReportSnapshotDb;

  return snapshotDb;
}

export function createPrismaSummaryReportCreateTransaction(
  client: Prisma.TransactionClient,
): SummaryReportCreateTransaction {
  return {
    snapshotDb: createPrismaSnapshotDb(client),
    async createReport(data) {
      return client.summaryReport.create({
        data,
        select: REPORT_LIST_SELECT,
      });
    },
    async createSources(data) {
      await client.summaryReportSource.createMany({ data });
    },
    async createAudit(data) {
      await client.auditLog.create({ data });
    },
  } satisfies SummaryReportCreateTransaction;
}

export function createPrismaSummaryReportCreateDb(
  client: PrismaClient,
): SummaryReportCreateDb {
  const accessDb = createPrismaSnapshotDb(client);
  return {
    accessDb,
    async findByCreationRequestId(creationRequestId) {
      return client.summaryReport.findUnique({
        where: { creationRequestId },
        select: REPORT_LIST_SELECT,
      });
    },
    repeatableRead(callback) {
      return client.$transaction(
        (tx) => callback(createPrismaSummaryReportCreateTransaction(tx)),
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );
    },
  } satisfies SummaryReportCreateDb;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SELECTED_SOURCES = 200;

type CapturedSummarySource = Readonly<SelectedSummarySource>;
type CapturedCreateSummaryReportCommand = Readonly<
  Omit<CreateSummaryReportCommand, "sources"> & {
    sources: readonly CapturedSummarySource[];
  }
>;

function captureActor(actor: ApiActor): Readonly<ApiActor> {
  return Object.freeze({
    userId: actor.userId,
    email: actor.email,
    role: actor.role,
    coachId: actor.coachId,
  });
}

function captureCommand(
  command: CreateSummaryReportCommand,
): CapturedCreateSummaryReportCommand {
  const sources = command.sources.map((source) =>
    Object.freeze({
      submissionId: source.submissionId,
      sourceCampaignId: source.sourceCampaignId,
      role: source.role,
      position: source.position,
    }),
  );
  return Object.freeze({
    destinationCampaignId: command.destinationCampaignId,
    reportType: command.reportType,
    creationRequestId: command.creationRequestId,
    sources: Object.freeze(sources),
  });
}

function defaultLogOperationalError(
  event: SummaryReportOperationalError,
): void {
  // This intentionally serializes a fixed, low-cardinality shape. Never pass
  // the underlying error, snapshot, artifact pathname, or source display data.
  console.error(JSON.stringify(event));
}

function safelyLogOperationalError(
  sink: (event: SummaryReportOperationalError) => void,
  event: SummaryReportOperationalError,
): void {
  try {
    sink(event);
  } catch {
    // Observability cannot change the domain result or mask the primary error.
  }
}

function errorClass(error: unknown): string {
  if (error instanceof Error) return error.name || "Error";
  if (
    error !== null &&
    (typeof error === "object" || typeof error === "function") &&
    typeof error.constructor?.name === "string"
  ) {
    return error.constructor.name;
  }
  return typeof error;
}

function operationalError(
  command: CapturedCreateSummaryReportCommand,
  stage: SummaryReportOperationalError["stage"],
  error: unknown,
): SummaryReportOperationalError {
  return {
    event: "summary-report-create-failed",
    stage,
    reportType: command.reportType,
    campaignId: command.destinationCampaignId,
    creationRequestId: command.creationRequestId,
    errorClass: errorClass(error),
  };
}

function sameActorSafeRequest(
  row: SummaryReportListItem,
  actor: Readonly<ApiActor>,
  command: CapturedCreateSummaryReportCommand,
): boolean {
  return (
    row.campaignId === command.destinationCampaignId &&
    row.reportType === command.reportType &&
    row.createdByUserId === actor.userId
  );
}

async function findAuthorizedExisting(
  db: SummaryReportCreateDb,
  actor: Readonly<ApiActor>,
  command: CapturedCreateSummaryReportCommand,
  canViewCampaign: NonNullable<
    CreateSummaryReportDependencies["canViewCampaign"]
  >,
): Promise<SummaryReportListItem | null | "not-found"> {
  const row = await db.findByCreationRequestId(command.creationRequestId);
  if (!row) return null;
  if (!sameActorSafeRequest(row, actor, command)) return "not-found";
  if (
    !(await canViewCampaign(db.accessDb, actor, command.destinationCampaignId))
  ) {
    return "not-found";
  }
  return row;
}

function targetNames(error: unknown): string[] {
  if (!error || typeof error !== "object") return [];
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  if (Array.isArray(target)) {
    return target.filter((entry): entry is string => typeof entry === "string");
  }
  return typeof target === "string" ? [target] : [];
}

function isCreationRequestCollision(error: unknown): boolean {
  if (
    !error ||
    typeof error !== "object" ||
    (error as { code?: unknown }).code !== "P2002"
  ) {
    return false;
  }
  const targets = targetNames(error);
  return (
    targets.length === 1 &&
    (targets[0] === "creationRequestId" ||
      /(?:^|_)creationRequestId_key$/.test(targets[0]))
  );
}

async function bestEffortDelete(
  store: SummaryArtifactStore,
  path: string,
): Promise<void> {
  try {
    await store.delete(path);
  } catch {
    // The production store already swallows deletion failures. This second
    // guard keeps alternative adapters/test doubles equally best-effort.
  }
}

function invalidInput(
  command: CapturedCreateSummaryReportCommand,
): Extract<CreateSummaryReportResult, { kind: "invalid" }> | null {
  if (!UUID_PATTERN.test(command.creationRequestId)) {
    return {
      kind: "invalid",
      errors: [
        {
          code: "invalid_creation_request_id",
          message: "Creation request ID must be a UUID.",
        },
      ],
    };
  }
  if (command.sources.length > MAX_SELECTED_SOURCES) {
    return {
      kind: "invalid",
      errors: [
        {
          code: "too_many_sources",
          message: "Select no more than 200 sources.",
        },
      ],
    };
  }
  return null;
}

function toNullablePrismaInputJson(
  value: unknown,
): Prisma.InputJsonValue | null {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(toNullablePrismaInputJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        toNullablePrismaInputJson(entry),
      ]),
    );
  }
  throw new TypeError("Canonical snapshot is not valid Prisma JSON input");
}

function toPrismaInputJson(value: unknown): Prisma.InputJsonValue {
  const converted = toNullablePrismaInputJson(value);
  if (converted === null) {
    throw new TypeError("Prisma JSON input cannot be null at the top level");
  }
  return converted;
}

function prismaSnapshot(
  snapshot: ScalingCeoFullSnapshot,
): Prisma.InputJsonValue {
  const parsed: unknown = JSON.parse(canonicalJson(snapshot));
  return toPrismaInputJson(parsed);
}

/**
 * Creates a Summary Report through the immutable two-transaction lifecycle.
 * The only artifact written before persistence is private and every failure
 * after that write attempts orphan cleanup.
 */
export async function createSummaryReport(
  db: SummaryReportCreateDb,
  inputActor: ApiActor,
  inputCommand: CreateSummaryReportCommand,
  dependencyOverrides: CreateSummaryReportDependencies = {},
): Promise<CreateSummaryReportResult> {
  const actor = captureActor(inputActor);
  const command = captureCommand(inputCommand);
  const inputError = invalidInput(command);
  if (inputError) return inputError;

  const artifactStore =
    dependencyOverrides.artifactStore ?? createSummaryArtifactStore();
  const buildSnapshot =
    dependencyOverrides.buildSnapshot ??
    ((tx, currentActor, input) =>
      buildScalingCeoFullSnapshot(tx, currentActor, input));
  const renderPdf = dependencyOverrides.renderPdf ?? renderSummaryReportPdf;
  const canViewCampaign =
    dependencyOverrides.canViewCampaign ??
    ((client, currentActor, campaignId) =>
      canViewGroupReport(client, currentActor, campaignId));
  const now = dependencyOverrides.now ?? (() => new Date());
  const logOperationalError =
    dependencyOverrides.logOperationalError ?? defaultLogOperationalError;

  let existing: SummaryReportListItem | null | "not-found";
  try {
    existing = await findAuthorizedExisting(
      db,
      actor,
      command,
      canViewCampaign,
    );
  } catch (error) {
    safelyLogOperationalError(
      logOperationalError,
      operationalError(command, "persist", error),
    );
    throw error;
  }
  if (existing === "not-found") return { kind: "not-found" };
  if (existing) return { kind: "existing", report: existing };

  const createdAt = now();
  let frozen: SnapshotResult;
  try {
    frozen = await db.repeatableRead((tx) =>
      buildSnapshot(tx.snapshotDb, actor, {
        destinationCampaignId: command.destinationCampaignId,
        sources: command.sources,
        createdAt,
      }),
    );
  } catch (error) {
    safelyLogOperationalError(
      logOperationalError,
      operationalError(command, "persist", error),
    );
    throw error;
  }
  if (frozen.kind !== "ok") return frozen;

  let rendered: { bytes: Buffer; rendererVersion: string };
  try {
    rendered = await renderPdf(command.reportType, frozen.snapshot);
  } catch (error) {
    safelyLogOperationalError(
      logOperationalError,
      operationalError(command, "render", error),
    );
    return { kind: "render-failed" };
  }

  let artifact: Awaited<ReturnType<SummaryArtifactStore["putPdf"]>>;
  try {
    artifact = await artifactStore.putPdf({
      campaignId: command.destinationCampaignId,
      creationRequestId: command.creationRequestId,
      bytes: rendered.bytes,
      createdAt,
    });
  } catch (error) {
    safelyLogOperationalError(
      logOperationalError,
      operationalError(command, "upload", error),
    );
    return { kind: "render-failed" };
  }

  try {
    const persisted = await db.repeatableRead(async (tx) => {
      const rechecked = await buildSnapshot(tx.snapshotDb, actor, {
        destinationCampaignId: command.destinationCampaignId,
        sources: command.sources,
        createdAt,
      });
      if (rechecked.kind !== "ok") return rechecked;
      if (rechecked.inputHash !== frozen.inputHash) {
        return {
          kind: "invalid" as const,
          errors: [
            {
              code: "source_changed",
              message:
                "One or more selected sources changed before creation completed.",
            },
          ],
        };
      }

      const reportData = {
        campaignId: command.destinationCampaignId,
        reportType: command.reportType,
        name: frozen.snapshot.destination.campaignName,
        templateId: frozen.snapshot.destination.templateId,
        versionId: frozen.snapshot.destination.versionId,
        language: frozen.snapshot.destination.language,
        createdByUserId: actor.userId,
        createdByEmailSnapshot: actor.email,
        createdAt,
        rendererVersion: rendered.rendererVersion,
        inputSnapshot: prismaSnapshot(frozen.snapshot),
        inputHash: frozen.inputHash,
        creationRequestId: command.creationRequestId,
        artifactPath: artifact.path,
        artifactSha256: artifact.sha256,
        artifactSizeBytes: artifact.sizeBytes,
        artifactCreatedAt: artifact.createdAt,
      } satisfies Prisma.SummaryReportUncheckedCreateInput;
      const report = await tx.createReport(reportData);

      const sourceData = frozen.snapshot.sources.map((source) => ({
        summaryReportId: report.id,
        submissionId: source.submissionId,
        role: source.role,
        position: source.position,
        respondentSnapshot: toPrismaInputJson({
          respondentId: source.respondent.id,
          displayName: source.respondent.displayName,
          jobTitle: source.respondent.jobTitle,
          sourceCampaignId: source.sourceCampaignId,
          submittedAt: source.submittedAt,
        }),
      })) satisfies Prisma.SummaryReportSourceCreateManyInput[];
      await tx.createSources(sourceData);

      const auditData = {
        entityType: "SummaryReport",
        entityId: report.id,
        action: "SUMMARY_REPORT_CREATE",
        performedBy: actor.userId,
        changes: JSON.stringify({
          reportId: report.id,
          campaignId: command.destinationCampaignId,
          reportType: command.reportType,
          inputHash: frozen.inputHash,
          artifactSha256: artifact.sha256,
        }),
      } satisfies Prisma.AuditLogUncheckedCreateInput;
      await tx.createAudit(auditData);

      return { kind: "created" as const, report };
    });

    if (persisted.kind !== "created") {
      await bestEffortDelete(artifactStore, artifact.path);
      return persisted;
    }
    return persisted;
  } catch (error) {
    await bestEffortDelete(artifactStore, artifact.path);

    if (isCreationRequestCollision(error)) {
      let winner: SummaryReportListItem | null | "not-found";
      try {
        winner = await findAuthorizedExisting(
          db,
          actor,
          command,
          canViewCampaign,
        );
      } catch (lookupError) {
        safelyLogOperationalError(
          logOperationalError,
          operationalError(command, "persist", lookupError),
        );
        throw lookupError;
      }
      if (winner === "not-found") return { kind: "not-found" };
      if (winner) return { kind: "existing", report: winner };
    }

    safelyLogOperationalError(
      logOperationalError,
      operationalError(command, "persist", error),
    );
    throw error;
  }
}
