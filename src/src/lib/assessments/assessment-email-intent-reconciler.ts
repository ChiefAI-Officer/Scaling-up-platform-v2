import { Prisma } from "@prisma/client";
import {
  INTENT_RENDERER_CONTRACT_VERSION,
  INTENT_SNAPSHOT_SCHEMA_VERSION,
  parseAuthorizationSnapshot,
  terminalIntentData,
  type AuthorizationSnapshotV1,
  type ContentProvenanceV1,
} from "@/lib/assessments/assessment-email-delivery-intents";
import {
  evaluateIntentReauthorization,
  type CurrentAuthorizationFactsV1,
} from "@/lib/assessments/assessment-email-intent-reauthorization";
import { resultsEmailContentHash } from "@/lib/assessments/results-email-approval";
import {
  assessmentSendsPaused,
  waveDCoachNotifyEnabled,
  waveDResultsEmailEnabled,
} from "@/lib/assessments/wave-d-feature-flags";
import { db } from "@/lib/db";

const RECONCILER_BUDGET_MS = 45_000;
const RECONCILER_ACTOR = "assessment-email-intent-reconciler";

export type ReconcileScope =
  | { kind: "submission"; submissionId: string; maxRows: 10 }
  | { kind: "scheduled"; maxRows: 50 };

export type ReconcileResult = {
  handedOff: number;
  held: number;
  expired: number;
  deferredByPause: number;
  retried: number;
  existingOutboxWon: number;
  handedOffSubmissionIds: string[];
};

type IntentRow = {
  id: string;
  submissionId: string;
  campaignId: string;
  invitationId: string;
  respondentId: string;
  recipientRole: string;
  emailType: string;
  recipientEmail: string | null;
  subject: string | null;
  bodyHtml: string | null;
  payloadHash: string;
  snapshotSchemaVersion: number;
  rendererContractVersion: number;
  authorizationSnapshot: unknown;
  contentProvenance: unknown;
  status: string;
  version: number;
  attempts: number;
  expiresAt: Date;
};

type QueryClient = {
  $executeRaw(query: Prisma.Sql): Promise<unknown>;
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
};

type ReconcilerTransaction = QueryClient & {
  assessmentSubmission: {
    findUnique(args: unknown): Promise<unknown>;
  };
  assessmentCampaign: {
    findUnique(args: unknown): Promise<unknown>;
  };
  assessmentInvitation: {
    findUnique(args: unknown): Promise<unknown>;
  };
  orgRespondent: {
    findUnique(args: unknown): Promise<unknown>;
  };
  assessmentTemplate: {
    findUnique(args: unknown): Promise<unknown>;
  };
  assessmentTemplateVersion: {
    findUnique(args: unknown): Promise<unknown>;
  };
  coach: {
    findUnique(args: unknown): Promise<unknown>;
  };
  assessmentEmailOutbox: {
    create(args: unknown): Promise<{ id: string }>;
  };
  assessmentEmailDeliveryIntent: {
    update(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

type ReconcilerLogger = {
  info(message: string, fields: Record<string, unknown>): void;
  warn(message: string, fields: Record<string, unknown>): void;
  error(message: string, fields: Record<string, unknown>): void;
};

export type ReconcilerDeps = {
  now(): Date;
  isPaused(): boolean;
  logger: ReconcilerLogger;
  prisma: {
    assessmentEmailDeliveryIntent: {
      updateMany(args: unknown): Promise<{ count: number }>;
    };
  };
  loadCurrentAuthorizationFacts(
    tx: ReconcilerTransaction,
    intent: IntentRow,
    snapshot: AuthorizationSnapshotV1,
  ): Promise<CurrentAuthorizationFactsV1>;
  runOneTransaction<T>(
    work: (tx: ReconcilerTransaction) => Promise<T>,
  ): Promise<T>;
};

type LockedSubmission = {
  id: string;
  campaignId: string;
  invitationId: string | null;
  respondentId: string | null;
};

type LockedCampaign = {
  id: string;
  templateId: string;
  versionId: string;
  accessMode: string;
  status: string;
  deletedAt: Date | null;
  closeAt: Date | null;
  sendResultsToRespondent: boolean;
  notifyCoachOnCompletion: boolean;
  createdByCoachId: string | null;
};

type LockedInvitation = {
  id: string;
  campaignId: string;
  respondentId: string;
  status: string;
  revokedAt: Date | null;
  expiresAt: Date;
};

type LockedRespondent = {
  id: string;
  email: string;
};

type LockedTemplate = {
  id: string;
  alias: string;
  resultsEmailContentApproved: boolean;
  resultsEmailContentApprovedHash: string | null;
  resultsEmailSubject: string | null;
  resultsEmailBodyMarkdown: string | null;
};

type LockedVersion = {
  id: string;
  templateId: string;
};

type LockedCoach = {
  id: string;
  email: string;
};

function emptyResult(): ReconcileResult {
  return {
    handedOff: 0,
    held: 0,
    expired: 0,
    deferredByPause: 0,
    retried: 0,
    existingOutboxWon: 0,
    handedOffSubmissionIds: [],
  };
}

function assertFixedScope(scope: ReconcileScope): void {
  if (
    (scope.kind === "submission" && scope.maxRows !== 10) ||
    (scope.kind === "scheduled" && scope.maxRows !== 50)
  ) {
    throw new Error("Reconciliation maxRows must match the fixed scope maximum.");
  }
}

function scopePredicate(scope: ReconcileScope): Prisma.Sql {
  return scope.kind === "submission"
    ? Prisma.sql`AND "submissionId" = ${scope.submissionId}`
    : Prisma.sql``;
}

async function selectCandidate(
  tx: ReconcilerTransaction,
  scope: ReconcileScope,
  allowPending: boolean,
): Promise<IntentRow | null> {
  const rows = await tx.$queryRaw<IntentRow[]>(Prisma.sql`
    SELECT *
    FROM "assessment_email_delivery_intents"
    WHERE (
      (
        "status" IN ('PENDING', 'HELD')
        AND "expiresAt" <= (statement_timestamp() AT TIME ZONE 'UTC')
      )
      OR (
        "status" = 'PENDING'
        AND "nextAttemptAt" <= (statement_timestamp() AT TIME ZONE 'UTC')
        AND ${allowPending}::boolean
      )
    )
    ${scopePredicate(scope)}
    ORDER BY
      CASE
        WHEN "expiresAt" <= (statement_timestamp() AT TIME ZONE 'UTC')
          THEN 0
        ELSE 1
      END,
      "nextAttemptAt", "createdAt", "id"
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function countDeferredByPause(
  tx: ReconcilerTransaction,
  scope: ReconcileScope,
): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ deferredByPause: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS "deferredByPause"
    FROM (
      SELECT "id"
      FROM "assessment_email_delivery_intents"
      WHERE "status" = 'PENDING'
        AND "nextAttemptAt" <= (statement_timestamp() AT TIME ZONE 'UTC')
        AND "expiresAt" > (statement_timestamp() AT TIME ZONE 'UTC')
        ${scopePredicate(scope)}
      ORDER BY "nextAttemptAt", "createdAt", "id"
      LIMIT ${scope.maxRows}
    ) AS "deferredByPauseCandidates"
  `);
  return rows[0]?.deferredByPause ?? 0;
}

async function lockAuthoritativeRows(
  tx: ReconcilerTransaction,
  intent: IntentRow,
  snapshot: AuthorizationSnapshotV1 | null,
): Promise<{ id: string; status: string } | null> {
  await tx.$queryRaw(Prisma.sql`
    SELECT "id"
    FROM "assessment_submissions"
    WHERE "id" = ${intent.submissionId}
    FOR SHARE
  `);
  await tx.$queryRaw(Prisma.sql`
    SELECT "id"
    FROM "assessment_campaigns"
    WHERE "id" = ${intent.campaignId}
    FOR SHARE
  `);
  await tx.$queryRaw(Prisma.sql`
    SELECT "id"
    FROM "assessment_invitations"
    WHERE "id" = ${intent.invitationId}
    FOR SHARE
  `);
  await tx.$queryRaw(Prisma.sql`
    SELECT "id"
    FROM "org_respondents"
    WHERE "id" = ${intent.respondentId}
    FOR SHARE
  `);

  if (snapshot !== null) {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id"
      FROM "assessment_templates"
      WHERE "id" = ${snapshot.common.templateId}
      FOR SHARE
    `);
    await tx.$queryRaw(Prisma.sql`
      SELECT "id"
      FROM "assessment_template_versions"
      WHERE "id" = ${snapshot.common.versionId}
      FOR SHARE
    `);
    if (
      snapshot.common.recipientRole === "OWNING_COACH" &&
      snapshot.coachCompletion
    ) {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id"
        FROM "Coach"
        WHERE "id" = ${snapshot.coachCompletion.coachId}
        FOR SHARE
      `);
    }
  }

  const outboxRows = await tx.$queryRaw<
    Array<{ id: string; status: string }>
  >(Prisma.sql`
    SELECT "id", "status"
    FROM "assessment_email_outbox"
    WHERE "submissionId" = ${intent.submissionId}
      AND "recipientRole" = ${intent.recipientRole}
    FOR UPDATE
  `);
  return outboxRows[0] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseContentProvenance(value: unknown): ContentProvenanceV1 | null {
  if (!isRecord(value)) return null;
  const stringFields = [
    "templateId",
    "versionId",
    "templateAlias",
    "reportType",
    "sourceCommit",
    "renderInputHash",
  ] as const;
  if (
    value.schemaVersion !== 1 ||
    value.rendererContractVersion !== INTENT_RENDERER_CONTRACT_VERSION ||
    stringFields.some(
      (field) =>
        typeof value[field] !== "string" || value[field].length === 0,
    ) ||
    !(
      value.approvalHash === null ||
      typeof value.approvalHash === "string"
    )
  ) {
    return null;
  }
  return value as ContentProvenanceV1;
}

function contentProvenanceMatchesFrozenContract(
  intent: IntentRow,
  snapshot: AuthorizationSnapshotV1,
  provenance: ContentProvenanceV1,
): boolean {
  if (
    provenance.schemaVersion !== intent.snapshotSchemaVersion ||
    provenance.templateId !== snapshot.common.templateId ||
    provenance.versionId !== snapshot.common.versionId ||
    provenance.templateAlias !== snapshot.common.templateAlias ||
    provenance.rendererContractVersion !== intent.rendererContractVersion
  ) {
    return false;
  }

  if (snapshot.common.recipientRole === "RESPONDENT") {
    return (
      snapshot.respondentResults !== undefined &&
      provenance.approvalHash ===
        snapshot.respondentResults.approvedContentHash
    );
  }

  return (
    snapshot.coachCompletion !== undefined &&
    provenance.approvalHash === null
  );
}

function terminalDataFor(
  intent: IntentRow,
  input: {
    now: Date;
    status: "HANDED_OFF" | "EXPIRED";
    outboxId?: string;
    reasonCode: string;
    snapshot: AuthorizationSnapshotV1 | null;
    provenance: ContentProvenanceV1 | null;
  },
): Record<string, unknown> {
  const terminal =
    input.snapshot !== null && input.provenance !== null
      ? terminalIntentData({
          now: input.now,
          status: input.status,
          outboxId: input.outboxId,
          actor: RECONCILER_ACTOR,
          reasonCode: input.reasonCode,
          snapshot: input.snapshot,
          provenance: input.provenance,
        })
      : {
          status: input.status,
          handedOffOutboxId: input.outboxId ?? null,
          resolvedAt: input.now,
          resolvedBy: RECONCILER_ACTOR,
          resolutionReasonCode: input.reasonCode,
          recipientEmail: null,
          subject: null,
          bodyHtml: null,
          authorizationSnapshot: null,
          contentProvenance: null,
        };

  return {
    ...terminal,
    holdReason: null,
    holdReasons: Prisma.DbNull,
    heldAt: null,
    lastErrorClass: null,
    version: { increment: 1 },
    // Keep the immutable identity and payload digest as non-PII evidence.
    payloadHash: intent.payloadHash,
  };
}

function auditChanges(
  intent: IntentRow,
  input: {
    reasonCode: string;
    outboxId?: string;
    attempts?: number;
  },
): string {
  return JSON.stringify({
    submissionId: intent.submissionId,
    campaignId: intent.campaignId,
    invitationId: intent.invitationId,
    recipientRole: intent.recipientRole,
    emailType: intent.emailType,
    reasonCode: input.reasonCode,
    ...(input.outboxId ? { outboxId: input.outboxId } : {}),
    ...(input.attempts === undefined ? {} : { attempts: input.attempts }),
  });
}

async function writeAudit(
  tx: ReconcilerTransaction,
  intent: IntentRow,
  input: {
    action:
      | "ASSESSMENT_EMAIL_INTENT_HELD"
      | "ASSESSMENT_EMAIL_INTENT_HANDED_OFF"
      | "ASSESSMENT_EMAIL_INTENT_EXPIRED";
    reasonCode: string;
    outboxId?: string;
    attempts?: number;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      entityType: "AssessmentEmailDeliveryIntent",
      entityId: intent.id,
      action: input.action,
      performedBy: RECONCILER_ACTOR,
      changes: auditChanges(intent, input),
    },
  });
}

async function holdIntent(
  tx: ReconcilerTransaction,
  intent: IntentRow,
  input: {
    now: Date;
    primaryReason: string;
    reasons: string[];
  },
): Promise<void> {
  await tx.assessmentEmailDeliveryIntent.update({
    where: { id: intent.id },
    data: {
      status: "HELD",
      holdReason: input.primaryReason,
      holdReasons: input.reasons,
      heldAt: input.now,
      version: { increment: 1 },
    },
  });
  await writeAudit(tx, intent, {
    action: "ASSESSMENT_EMAIL_INTENT_HELD",
    reasonCode: input.primaryReason,
  });
}

type TransactionOutcome =
  | { kind: "EMPTY"; deferredByPause: number }
  | { kind: "HANDED_OFF"; submissionId: string; existingOutboxWon: boolean }
  | { kind: "HELD" }
  | { kind: "EXPIRED" };

async function reconcileCandidate(
  deps: ReconcilerDeps,
  tx: ReconcilerTransaction,
  intent: IntentRow,
  now: Date,
): Promise<TransactionOutcome> {
  const parsedSnapshot = parseAuthorizationSnapshot(
    intent.authorizationSnapshot,
  );
  const snapshot = parsedSnapshot.supported ? parsedSnapshot.value : null;
  const provenance = parseContentProvenance(intent.contentProvenance);
  const existingOutbox = await lockAuthoritativeRows(tx, intent, snapshot);

  if (existingOutbox !== null) {
    await tx.assessmentEmailDeliveryIntent.update({
      where: { id: intent.id },
      data: terminalDataFor(intent, {
        now,
        status: "HANDED_OFF",
        outboxId: existingOutbox.id,
        reasonCode: "EXISTING_OUTBOX_WON",
        snapshot,
        provenance,
      }),
    });
    await writeAudit(tx, intent, {
      action: "ASSESSMENT_EMAIL_INTENT_HANDED_OFF",
      reasonCode: "EXISTING_OUTBOX_WON",
      outboxId: existingOutbox.id,
    });
    return {
      kind: "HANDED_OFF",
      submissionId: intent.submissionId,
      existingOutboxWon: true,
    };
  }

  if (intent.expiresAt.getTime() <= now.getTime()) {
    await tx.assessmentEmailDeliveryIntent.update({
      where: { id: intent.id },
      data: terminalDataFor(intent, {
        now,
        status: "EXPIRED",
        reasonCode: "INTENT_EXPIRED",
        snapshot,
        provenance,
      }),
    });
    await writeAudit(tx, intent, {
      action: "ASSESSMENT_EMAIL_INTENT_EXPIRED",
      reasonCode: "INTENT_EXPIRED",
    });
    return { kind: "EXPIRED" };
  }

  if (
    snapshot === null ||
    provenance === null ||
    intent.snapshotSchemaVersion !== INTENT_SNAPSHOT_SCHEMA_VERSION ||
    intent.rendererContractVersion !== INTENT_RENDERER_CONTRACT_VERSION
  ) {
    await holdIntent(tx, intent, {
      now,
      primaryReason: "SCHEMA_UNSUPPORTED",
      reasons: ["SCHEMA_UNSUPPORTED"],
    });
    return { kind: "HELD" };
  }

  if (!contentProvenanceMatchesFrozenContract(intent, snapshot, provenance)) {
    await holdIntent(tx, intent, {
      now,
      primaryReason: "PAYLOAD_INTEGRITY_FAILED",
      reasons: ["PAYLOAD_INTEGRITY_FAILED"],
    });
    return { kind: "HELD" };
  }

  const current = await deps.loadCurrentAuthorizationFacts(
    tx,
    intent,
    snapshot,
  );
  const decision = evaluateIntentReauthorization({
    intent: {
      submissionId: intent.submissionId,
      campaignId: intent.campaignId,
      invitationId: intent.invitationId,
      respondentId: intent.respondentId,
      recipientRole: intent.recipientRole as
        | "RESPONDENT"
        | "OWNING_COACH",
      emailType: intent.emailType as
        | "ASSESSMENT_RESULTS"
        | "COACH_COMPLETION",
      recipientEmail: intent.recipientEmail,
      subject: intent.subject,
      bodyHtml: intent.bodyHtml,
      payloadHash: intent.payloadHash,
      snapshotSchemaVersion: intent.snapshotSchemaVersion,
      rendererContractVersion: intent.rendererContractVersion,
    },
    snapshot,
    current,
  });

  if (decision.kind === "HELD") {
    await holdIntent(tx, intent, {
      now,
      primaryReason: decision.primaryReason,
      reasons: decision.reasons,
    });
    return { kind: "HELD" };
  }

  // AUTHORIZED implies the evaluator verified all three frozen payload fields.
  const outbox = await tx.assessmentEmailOutbox.create({
    data: {
      submissionId: intent.submissionId,
      recipientEmail: intent.recipientEmail as string,
      recipientRole: intent.recipientRole,
      emailType: intent.emailType,
      subject: intent.subject as string,
      bodyHtml: intent.bodyHtml as string,
      status: "PENDING",
      authorizationProvenance: intent.authorizationSnapshot,
      contentProvenance: intent.contentProvenance,
    },
    select: { id: true },
  });
  await writeAudit(tx, intent, {
    action: "ASSESSMENT_EMAIL_INTENT_HANDED_OFF",
    reasonCode: "AUTHORIZED_HANDOFF",
    outboxId: outbox.id,
  });
  await tx.assessmentEmailDeliveryIntent.update({
    where: { id: intent.id },
    data: terminalDataFor(intent, {
      now,
      status: "HANDED_OFF",
      outboxId: outbox.id,
      reasonCode: "AUTHORIZED_HANDOFF",
      snapshot,
      provenance,
    }),
  });
  return {
    kind: "HANDED_OFF",
    submissionId: intent.submissionId,
    existingOutboxWon: false,
  };
}

function stableErrorClass(error: unknown): string {
  if (isRecord(error) && typeof error.code === "string") {
    if (/^P\d{4}$/.test(error.code)) return `PRISMA_${error.code}`;
    if (/^[0-9A-Z]{5}$/.test(error.code)) return `POSTGRES_${error.code}`;
  }
  if (
    isRecord(error) &&
    typeof error.name === "string" &&
    /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(error.name)
  ) {
    return error.name;
  }
  return "UNKNOWN_ERROR";
}

type BookkeepingOutcome = "RETRIED" | "HELD" | "UNCHANGED";

async function recordTransientFailure(
  deps: ReconcilerDeps,
  intent: IntentRow,
  error: unknown,
  now: Date,
  deadlineAt: number,
): Promise<BookkeepingOutcome> {
  const nextAttempts = intent.attempts + 1;
  const errorClass = stableErrorClass(error);
  const nextAttemptAt = new Date(
    now.getTime() + 2 ** nextAttempts * 60_000,
  );

  try {
    if (nextAttempts >= 5) {
      if (deps.now().getTime() >= deadlineAt) return "UNCHANGED";
      const changed = await deps.runOneTransaction(async (tx) => {
        const updated = await tx.assessmentEmailDeliveryIntent.updateMany({
          where: {
            id: intent.id,
            status: "PENDING",
            version: intent.version,
          },
          data: {
            status: "HELD",
            attempts: { increment: 1 },
            lastErrorClass: errorClass,
            nextAttemptAt,
            holdReason: "RETRY_EXHAUSTED",
            holdReasons: ["RETRY_EXHAUSTED"],
            heldAt: now,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) return false;
        await writeAudit(tx, intent, {
          action: "ASSESSMENT_EMAIL_INTENT_HELD",
          reasonCode: "RETRY_EXHAUSTED",
          attempts: nextAttempts,
        });
        return true;
      });
      return changed ? "HELD" : "UNCHANGED";
    }

    const updated = await deps.prisma.assessmentEmailDeliveryIntent.updateMany({
      where: {
        id: intent.id,
        status: "PENDING",
        version: intent.version,
      },
      data: {
        attempts: { increment: 1 },
        lastErrorClass: errorClass,
        nextAttemptAt,
      },
    });
    return updated.count === 1 ? "RETRIED" : "UNCHANGED";
  } catch (bookkeepingError) {
    deps.logger.error(
      "[assessment-email-intent] transient bookkeeping failed",
      {
        intentId: intent.id,
        submissionId: intent.submissionId,
        errorClass: stableErrorClass(bookkeepingError),
      },
    );
    return "UNCHANGED";
  }
}

export async function reconcileAssessmentEmailIntents(
  deps: ReconcilerDeps,
  scope: ReconcileScope,
): Promise<ReconcileResult> {
  assertFixedScope(scope);
  const result = emptyResult();
  const startedAt = deps.now().getTime();
  const deadlineAt = startedAt + RECONCILER_BUDGET_MS;
  const paused = deps.isPaused();

  if (paused) {
    try {
      result.deferredByPause = await deps.runOneTransaction(async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SET LOCAL lock_timeout = '2s'`,
        );
        await tx.$executeRaw(
          Prisma.sql`SET LOCAL statement_timeout = '10s'`,
        );
        return countDeferredByPause(tx, scope);
      });
    } catch (error) {
      deps.logger.error(
        "[assessment-email-intent] pause deferral count failed",
        { errorClass: stableErrorClass(error), scopeKind: scope.kind },
      );
    }
  }

  for (let processed = 0; processed < scope.maxRows; processed += 1) {
    const now = deps.now();
    if (now.getTime() >= deadlineAt) break;

    const selection = { current: null as IntentRow | null };
    try {
      const outcome = await deps.runOneTransaction(async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SET LOCAL lock_timeout = '2s'`,
        );
        await tx.$executeRaw(
          Prisma.sql`SET LOCAL statement_timeout = '10s'`,
        );
        selection.current = await selectCandidate(tx, scope, !paused);
        if (selection.current === null) {
          return {
            kind: "EMPTY" as const,
            deferredByPause: 0,
          };
        }
        return reconcileCandidate(deps, tx, selection.current, now);
      });

      if (outcome.kind === "EMPTY") {
        result.deferredByPause += outcome.deferredByPause;
        break;
      }
      if (outcome.kind === "HANDED_OFF") {
        result.handedOff += 1;
        result.handedOffSubmissionIds.push(outcome.submissionId);
        if (outcome.existingOutboxWon) result.existingOutboxWon += 1;
      } else if (outcome.kind === "HELD") {
        result.held += 1;
      } else {
        result.expired += 1;
      }
    } catch (error) {
      const selected = selection.current;
      if (selected === null) {
        deps.logger.error(
          "[assessment-email-intent] reconciliation transaction failed before selection",
          { errorClass: stableErrorClass(error), scopeKind: scope.kind },
        );
        break;
      }

      const bookkeeping = await recordTransientFailure(
        deps,
        selected,
        error,
        now,
        deadlineAt,
      );
      if (bookkeeping === "RETRIED") result.retried += 1;
      if (bookkeeping === "HELD") result.held += 1;
      deps.logger.warn(
        "[assessment-email-intent] reconciliation transaction deferred",
        {
          intentId: selected.id,
          submissionId: selected.submissionId,
          errorClass: stableErrorClass(error),
          bookkeeping,
        },
      );
      if (bookkeeping === "UNCHANGED") break;
    }
  }

  return result;
}

async function loadCurrentAuthorizationFactsProduction(
  tx: ReconcilerTransaction,
  intent: IntentRow,
  snapshot: AuthorizationSnapshotV1,
): Promise<CurrentAuthorizationFactsV1> {
  const submission = (await tx.assessmentSubmission.findUnique({
    where: { id: intent.submissionId },
    select: {
      id: true,
      campaignId: true,
      invitationId: true,
      respondentId: true,
    },
  })) as LockedSubmission | null;
  const campaign = (await tx.assessmentCampaign.findUnique({
    where: { id: intent.campaignId },
    select: {
      id: true,
      templateId: true,
      versionId: true,
      accessMode: true,
      status: true,
      deletedAt: true,
      closeAt: true,
      sendResultsToRespondent: true,
      notifyCoachOnCompletion: true,
      createdByCoachId: true,
    },
  })) as LockedCampaign | null;
  const invitation = (await tx.assessmentInvitation.findUnique({
    where: { id: intent.invitationId },
    select: {
      id: true,
      campaignId: true,
      respondentId: true,
      status: true,
      revokedAt: true,
      expiresAt: true,
    },
  })) as LockedInvitation | null;
  const respondent = (await tx.orgRespondent.findUnique({
    where: { id: intent.respondentId },
    select: { id: true, email: true },
  })) as LockedRespondent | null;
  const template = (await tx.assessmentTemplate.findUnique({
    where: { id: snapshot.common.templateId },
    select: {
      id: true,
      alias: true,
      resultsEmailContentApproved: true,
      resultsEmailContentApprovedHash: true,
      resultsEmailSubject: true,
      resultsEmailBodyMarkdown: true,
    },
  })) as LockedTemplate | null;
  const version = (await tx.assessmentTemplateVersion.findUnique({
    where: { id: snapshot.common.versionId },
    select: { id: true, templateId: true },
  })) as LockedVersion | null;
  const coach =
    snapshot.common.recipientRole === "OWNING_COACH" &&
    snapshot.coachCompletion
      ? ((await tx.coach.findUnique({
          where: { id: snapshot.coachCompletion.coachId },
          select: { id: true, email: true },
        })) as LockedCoach | null)
      : null;

  return {
    submission: {
      exists: submission !== null,
      campaignId: submission?.campaignId ?? null,
      invitationId: submission?.invitationId ?? null,
      respondentId: submission?.respondentId ?? null,
    },
    campaign: {
      exists: campaign !== null,
      templateId: campaign?.templateId ?? null,
      versionId: campaign?.versionId ?? null,
      accessMode: campaign?.accessMode ?? null,
      status: campaign?.status ?? null,
      deleted: campaign ? campaign.deletedAt !== null : null,
      closeAt: campaign?.closeAt?.toISOString() ?? null,
      sendResultsToRespondent:
        campaign?.sendResultsToRespondent ?? null,
      notifyCoachOnCompletion:
        campaign?.notifyCoachOnCompletion ?? null,
      createdByCoachId: campaign?.createdByCoachId ?? null,
    },
    invitation: {
      exists: invitation !== null,
      campaignId: invitation?.campaignId ?? null,
      respondentId: invitation?.respondentId ?? null,
      status: invitation?.status ?? null,
      revoked: invitation ? invitation.revokedAt !== null : null,
      expiresAt: invitation?.expiresAt.toISOString() ?? null,
    },
    respondent: {
      exists: respondent !== null,
      canonicalMailbox: respondent?.email ?? null,
    },
    template: {
      exists: template !== null,
      alias: template?.alias ?? null,
      resultsEmailApproved:
        template?.resultsEmailContentApproved ?? null,
      storedApprovedContentHash:
        template?.resultsEmailContentApprovedHash ?? null,
      liveContentHash: template
        ? resultsEmailContentHash(
            template.resultsEmailSubject,
            template.resultsEmailBodyMarkdown,
          )
        : null,
    },
    version: {
      exists: version !== null,
      templateId: version?.templateId ?? null,
    },
    coach:
      snapshot.common.recipientRole === "OWNING_COACH"
        ? {
            exists: coach !== null,
            id: coach?.id ?? null,
            canonicalMailbox: coach?.email ?? null,
          }
        : null,
    features: {
      resultsEmailEnabled: waveDResultsEmailEnabled(),
      coachNotifyEnabled: waveDCoachNotifyEnabled(),
    },
  };
}

export function productionAssessmentEmailIntentReconcilerDeps(): ReconcilerDeps {
  return {
    now: () => new Date(),
    isPaused: assessmentSendsPaused,
    logger: {
      info: (message, fields) => console.info(message, fields),
      warn: (message, fields) => console.warn(message, fields),
      error: (message, fields) => console.error(message, fields),
    },
    prisma: db as unknown as ReconcilerDeps["prisma"],
    loadCurrentAuthorizationFacts: loadCurrentAuthorizationFactsProduction,
    runOneTransaction: (work) =>
      db.$transaction(
        (tx) =>
          work(tx as unknown as ReconcilerTransaction),
        { timeout: 15_000 },
      ),
  };
}
