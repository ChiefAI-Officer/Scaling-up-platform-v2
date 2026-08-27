import type { ApiActor } from "@/lib/auth/access-control";
import {
  asAccessDb,
  canViewGroupReport,
} from "@/lib/assessments/access-control";

import {
  createSummaryArtifactStore,
  type SummaryArtifactStore,
} from "./artifact-store";
import type {
  ScalingCeoFullSnapshot,
  SelectedSummarySource,
} from "./canonical";
import { renderSummaryReportPdf } from "./renderers";
import {
  buildScalingCeoFullSnapshot,
  type SummaryReportSnapshotDb,
} from "./scaling-ceo-full-snapshot";
import type { SummaryReportType } from "./types";

export interface CreateSummaryReportCommand {
  destinationCampaignId: string;
  reportType: "SCALING_CEO_FULL";
  creationRequestId: string;
  sources: SelectedSummarySource[];
}

export interface SummaryReportListItem {
  id: string;
  campaignId: string;
  reportType: SummaryReportType;
  name: string;
  createdByUserId: string;
  createdByEmailSnapshot: string;
  createdAt: Date;
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

interface SummaryReportLookupDelegate {
  findUnique(args: {
    where: { creationRequestId: string };
    select: Record<string, boolean>;
  }): Promise<SummaryReportListItem | null>;
}

interface SummaryReportPersistenceTx {
  summaryReport: {
    create(args: {
      data: Record<string, unknown>;
      select: Record<string, boolean>;
    }): Promise<SummaryReportListItem>;
  };
  summaryReportSource: {
    createMany(args: { data: Record<string, unknown>[] }): Promise<unknown>;
  };
  auditLog: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

export interface SummaryReportCreateDb {
  summaryReport: SummaryReportLookupDelegate;
  $transaction<T>(
    callback: (tx: SummaryReportPersistenceTx) => Promise<T>,
    options: { isolationLevel: "RepeatableRead" },
  ): Promise<T>;
}

type SnapshotResult = Awaited<ReturnType<typeof buildScalingCeoFullSnapshot>>;

export interface SummaryReportOperationalError {
  event: "summary-report-create-failed";
  stage: "render" | "upload" | "persist";
  reportType: "SCALING_CEO_FULL";
  campaignId: string;
  creationRequestId: string;
  errorClass: string;
}

interface CreateSummaryReportDependencies {
  artifactStore?: SummaryArtifactStore;
  buildSnapshot?: (
    tx: unknown,
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
    db: unknown,
    actor: ApiActor,
    campaignId: string,
  ) => Promise<boolean>;
  now?: () => Date;
  logOperationalError?: (event: SummaryReportOperationalError) => void;
}

const REPORT_LIST_SELECT = {
  id: true,
  campaignId: true,
  reportType: true,
  name: true,
  createdByUserId: true,
  createdByEmailSnapshot: true,
  createdAt: true,
} as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SELECTED_SOURCES = 200;

function defaultLogOperationalError(
  event: SummaryReportOperationalError,
): void {
  // This intentionally serializes a fixed, low-cardinality shape. Never pass
  // the underlying error, snapshot, artifact pathname, or source display data.
  console.error(JSON.stringify(event));
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
  command: CreateSummaryReportCommand,
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
  actor: ApiActor,
  command: CreateSummaryReportCommand,
): boolean {
  return (
    row.campaignId === command.destinationCampaignId &&
    row.reportType === command.reportType &&
    row.createdByUserId === actor.userId
  );
}

async function findAuthorizedExisting(
  db: SummaryReportCreateDb,
  actor: ApiActor,
  command: CreateSummaryReportCommand,
  canViewCampaign: NonNullable<
    CreateSummaryReportDependencies["canViewCampaign"]
  >,
): Promise<SummaryReportListItem | null | "not-found"> {
  const row = await db.summaryReport.findUnique({
    where: { creationRequestId: command.creationRequestId },
    select: REPORT_LIST_SELECT,
  });
  if (!row) return null;
  if (!sameActorSafeRequest(row, actor, command)) return "not-found";
  if (!(await canViewCampaign(db, actor, command.destinationCampaignId))) {
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
  command: CreateSummaryReportCommand,
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

/**
 * Creates a Summary Report through the immutable two-transaction lifecycle.
 * The only artifact written before persistence is private and every failure
 * after that write attempts orphan cleanup.
 */
export async function createSummaryReport(
  db: SummaryReportCreateDb,
  actor: ApiActor,
  command: CreateSummaryReportCommand,
  dependencyOverrides: CreateSummaryReportDependencies = {},
): Promise<CreateSummaryReportResult> {
  const inputError = invalidInput(command);
  if (inputError) return inputError;

  const artifactStore =
    dependencyOverrides.artifactStore ?? createSummaryArtifactStore();
  const buildSnapshot =
    dependencyOverrides.buildSnapshot ??
    ((tx, currentActor, input) =>
      buildScalingCeoFullSnapshot(
        tx as SummaryReportSnapshotDb,
        currentActor,
        input,
      ));
  const renderPdf = dependencyOverrides.renderPdf ?? renderSummaryReportPdf;
  const canViewCampaign =
    dependencyOverrides.canViewCampaign ??
    ((client, currentActor, campaignId) =>
      canViewGroupReport(asAccessDb(client), currentActor, campaignId));
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
    logOperationalError(operationalError(command, "persist", error));
    throw error;
  }
  if (existing === "not-found") return { kind: "not-found" };
  if (existing) return { kind: "existing", report: existing };

  const createdAt = now();
  let frozen: SnapshotResult;
  try {
    frozen = await db.$transaction(
      (tx) =>
        buildSnapshot(tx, actor, {
          destinationCampaignId: command.destinationCampaignId,
          sources: command.sources,
          createdAt,
        }),
      { isolationLevel: "RepeatableRead" },
    );
  } catch (error) {
    logOperationalError(operationalError(command, "persist", error));
    throw error;
  }
  if (frozen.kind !== "ok") return frozen;

  let rendered: { bytes: Buffer; rendererVersion: string };
  try {
    rendered = await renderPdf(command.reportType, frozen.snapshot);
  } catch (error) {
    logOperationalError(operationalError(command, "render", error));
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
    logOperationalError(operationalError(command, "upload", error));
    return { kind: "render-failed" };
  }

  try {
    const persisted = await db.$transaction(
      async (tx) => {
        const rechecked = await buildSnapshot(tx, actor, {
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

        const report = await tx.summaryReport.create({
          data: {
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
            inputSnapshot: frozen.snapshot,
            inputHash: frozen.inputHash,
            moderationManifest: null,
            creationRequestId: command.creationRequestId,
            artifactPath: artifact.path,
            artifactSha256: artifact.sha256,
            artifactSizeBytes: artifact.sizeBytes,
            artifactCreatedAt: artifact.createdAt,
          },
          select: REPORT_LIST_SELECT,
        });

        await tx.summaryReportSource.createMany({
          data: frozen.snapshot.sources.map((source) => ({
            summaryReportId: report.id,
            submissionId: source.submissionId,
            role: source.role,
            position: source.position,
            respondentSnapshot: {
              respondentId: source.respondent.id,
              displayName: source.respondent.displayName,
              jobTitle: source.respondent.jobTitle,
              sourceCampaignId: source.sourceCampaignId,
              submittedAt: source.submittedAt,
            },
          })),
        });

        await tx.auditLog.create({
          data: {
            entityType: "SummaryReport",
            entityId: report.id,
            action: "SUMMARY_REPORT_CREATE",
            performedBy: actor.userId,
            changes: JSON.stringify({
              reportId: report.id,
              campaignId: command.destinationCampaignId,
              reportType: command.reportType,
              templateId: frozen.snapshot.destination.templateId,
              versionId: frozen.snapshot.destination.versionId,
              creationRequestId: command.creationRequestId,
              sourceSubmissionIds: frozen.snapshot.sources.map(
                (source) => source.submissionId,
              ),
              sourceCount: frozen.snapshot.sources.length,
              inputHash: frozen.inputHash,
              artifactSha256: artifact.sha256,
              rendererVersion: rendered.rendererVersion,
            }),
          },
        });

        return { kind: "created" as const, report };
      },
      { isolationLevel: "RepeatableRead" },
    );

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
        logOperationalError(operationalError(command, "persist", lookupError));
        throw lookupError;
      }
      if (winner === "not-found") return { kind: "not-found" };
      if (winner) return { kind: "existing", report: winner };
    }

    logOperationalError(operationalError(command, "persist", error));
    throw error;
  }
}
