import { Prisma } from "@prisma/client";
import {
  INTENT_RENDERER_CONTRACT_VERSION,
  INTENT_SNAPSHOT_SCHEMA_VERSION,
  assessmentEmailIntentPayloadHash,
  parseAuthorizationSnapshot,
  terminalIntentData,
  type AuthorizationSnapshotV1,
  type ContentProvenanceV1,
} from "@/lib/assessments/assessment-email-delivery-intents";
import {
  evaluateIntentReauthorization,
  reviewContextHash,
  type CurrentAuthorizationFactsV1,
  type ReauthorizationDecision,
} from "@/lib/assessments/assessment-email-intent-reauthorization";
import {
  IntentReviewTokenError,
  issueIntentReviewToken,
  verifyIntentReviewToken,
  type ReviewTokenClaimsV1,
} from "@/lib/assessments/assessment-email-intent-review-token";
import { productionAssessmentEmailIntentReconcilerDeps } from "@/lib/assessments/assessment-email-intent-reconciler";
import { assessmentSendsPaused } from "@/lib/assessments/wave-d-feature-flags";
import { db } from "@/lib/db";

export type OperatorActor = { userId: string };

export const RELEASE_REASON_CODES = [
  "DRIFT_REVIEWED_SEND_FROZEN",
] as const;
export type ReleaseReasonCode = (typeof RELEASE_REASON_CODES)[number];

export const CANCELLATION_REASON_CODES = [
  "DELIVERY_NO_LONGER_AUTHORIZED",
  "RECIPIENT_SUPERSEDED",
  "CAMPAIGN_RETIRED",
  "DUPLICATE_CONFIRMED",
  "POLICY_DECISION",
] as const;
export type CancellationReasonCode =
  (typeof CANCELLATION_REASON_CODES)[number];

export type OperatorServiceErrorCode =
  | "INTENT_NOT_FOUND"
  | "INTENT_NOT_HELD"
  | "VERSION_CONFLICT"
  | "INTENT_EXPIRED"
  | "SENDS_PAUSED"
  | "SNAPSHOT_UNSUPPORTED"
  | "RENDERER_UNSUPPORTED"
  | "PROVENANCE_INVALID"
  | "PAYLOAD_INTEGRITY_FAILED"
  | "OUTBOX_OWNERSHIP_CONFLICT"
  | "RELEASE_REASON_NOT_ALLOWED"
  | "CANCELLATION_REASON_NOT_ALLOWED"
  | "REVIEW_TOKEN_CONFIGURATION_INVALID"
  | "REVIEW_TOKEN_INVALID"
  | "REVIEW_TOKEN_EXPIRED"
  | "REVIEW_TOKEN_ACTOR_MISMATCH"
  | "REVIEW_TOKEN_INTENT_MISMATCH"
  | "REVIEW_TOKEN_VERSION_MISMATCH"
  | "REVIEW_CONTEXT_CHANGED"
  | "AUDIT_FAILED"
  | "TRANSACTION_FAILED";

const ERROR_MESSAGES: Record<OperatorServiceErrorCode, string> = {
  INTENT_NOT_FOUND: "Delivery intent was not found.",
  INTENT_NOT_HELD: "Delivery intent is not held.",
  VERSION_CONFLICT: "Delivery intent version has changed.",
  INTENT_EXPIRED: "Delivery intent has expired.",
  SENDS_PAUSED: "Assessment email sending is paused.",
  SNAPSHOT_UNSUPPORTED: "Delivery intent snapshot is unsupported.",
  RENDERER_UNSUPPORTED: "Delivery intent renderer is unsupported.",
  PROVENANCE_INVALID: "Delivery intent provenance is invalid.",
  PAYLOAD_INTEGRITY_FAILED: "Delivery intent payload integrity check failed.",
  OUTBOX_OWNERSHIP_CONFLICT: "Delivery outbox ownership is inconsistent.",
  RELEASE_REASON_NOT_ALLOWED: "Release reason is not allowed.",
  CANCELLATION_REASON_NOT_ALLOWED: "Cancellation reason is not allowed.",
  REVIEW_TOKEN_CONFIGURATION_INVALID:
    "Review-token configuration is invalid.",
  REVIEW_TOKEN_INVALID: "Review token is invalid.",
  REVIEW_TOKEN_EXPIRED: "Review token has expired.",
  REVIEW_TOKEN_ACTOR_MISMATCH: "Review token belongs to a different actor.",
  REVIEW_TOKEN_INTENT_MISMATCH: "Review token belongs to a different intent.",
  REVIEW_TOKEN_VERSION_MISMATCH:
    "Review token belongs to a different intent version.",
  REVIEW_CONTEXT_CHANGED: "Reviewed current facts have changed.",
  AUDIT_FAILED: "Required delivery-intent audit could not be persisted.",
  TRANSACTION_FAILED: "Delivery-intent transaction failed.",
};

export class OperatorServiceError extends Error {
  readonly code: OperatorServiceErrorCode;

  constructor(code: OperatorServiceErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "OperatorServiceError";
    this.code = code;
  }
}

export type OperatorIntentRow = {
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
  holdReason: string | null;
  holdReasons: unknown;
  attempts: number;
  lastErrorClass: string | null;
  nextAttemptAt: Date;
  heldAt: Date | null;
  expiresAt: Date;
  handedOffOutboxId: string | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolutionReasonCode: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type LockedOutbox = {
  id: string;
  submissionId: string;
  recipientRole: string;
  status: string;
};

export type OperatorTransaction = {
  $executeRaw(query: Prisma.Sql): Promise<unknown>;
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
  assessmentEmailOutbox: {
    create(args: unknown): Promise<{ id: string }>;
  };
  assessmentEmailDeliveryIntent: {
    update(args: unknown): Promise<unknown>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

export type OperatorTransactionOptions = {
  isolationLevel?: Prisma.TransactionIsolationLevel;
  timeout: number;
};

export type OperatorDeps = {
  now(): Date;
  isPaused(): boolean;
  runTransaction<T>(
    work: (tx: OperatorTransaction) => Promise<T>,
    options: OperatorTransactionOptions,
  ): Promise<T>;
  loadCurrentAuthorizationFacts(
    tx: OperatorTransaction,
    intent: OperatorIntentRow,
    snapshot: AuthorizationSnapshotV1,
  ): Promise<CurrentAuthorizationFactsV1>;
  reviewTokens: {
    issue(
      claims: Omit<
        ReviewTokenClaimsV1,
        "schemaVersion" | "issuedAt" | "expiresAt" | "nonce"
      >,
      now: Date,
    ): string;
    verify(
      token: string,
      expected: {
        actorUserId: string;
        intentId: string;
        intentVersion: number;
        reviewContextHash: string;
      },
      now: Date,
    ): ReviewTokenClaimsV1;
  };
};

export type HeldIntentDetail = {
  id: string;
  submissionId: string;
  campaignId: string;
  invitationId: string;
  respondentId: string;
  recipientRole: string;
  emailType: string;
  recipientEmail: string;
  subject: string;
  bodyHtml: string;
  payloadHash: string;
  snapshotSchemaVersion: number;
  rendererContractVersion: number;
  authorizationSnapshot: AuthorizationSnapshotV1;
  contentProvenance: ContentProvenanceV1;
  status: "HELD";
  version: number;
  holdReason: string | null;
  holdReasons: unknown;
  heldAt: Date | null;
  expiresAt: Date;
  current: CurrentAuthorizationFactsV1;
  drift: ReauthorizationDecision;
  reviewContextHash: string;
  reviewToken: string;
};

export type OperatorResolution = {
  intentId: string;
  status: "HANDED_OFF" | "CANCELLED";
  version: number;
  outboxId: string | null;
  existingOutboxWon: boolean;
};

const TRANSACTION_TIMEOUT_MS = 15_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseContentProvenance(value: unknown): ContentProvenanceV1 | null {
  if (!isRecord(value)) return null;
  const exactKeys = [
    "schemaVersion",
    "templateId",
    "versionId",
    "templateAlias",
    "reportType",
    "approvalHash",
    "rendererContractVersion",
    "sourceCommit",
    "renderInputHash",
  ] as const;
  const stringFields = [
    "templateId",
    "versionId",
    "templateAlias",
    "reportType",
    "sourceCommit",
  ] as const;
  if (
    Object.keys(value).length !== exactKeys.length ||
    exactKeys.some(
      (field) => !Object.prototype.hasOwnProperty.call(value, field),
    ) ||
    value.schemaVersion !== INTENT_SNAPSHOT_SCHEMA_VERSION ||
    value.rendererContractVersion !== INTENT_RENDERER_CONTRACT_VERSION ||
    stringFields.some(
      (field) =>
        typeof value[field] !== "string" || value[field].length === 0,
    ) ||
    typeof value.renderInputHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.renderInputHash) ||
    !(
      value.approvalHash === null ||
      typeof value.approvalHash === "string"
    )
  ) {
    return null;
  }
  return {
    schemaVersion: INTENT_SNAPSHOT_SCHEMA_VERSION,
    templateId: value.templateId as string,
    versionId: value.versionId as string,
    templateAlias: value.templateAlias as string,
    reportType: value.reportType as string,
    approvalHash: value.approvalHash as string | null,
    rendererContractVersion: INTENT_RENDERER_CONTRACT_VERSION,
    sourceCommit: value.sourceCommit as string,
    renderInputHash: value.renderInputHash,
  };
}

function snapshotMatchesIntent(
  intent: OperatorIntentRow,
  snapshot: AuthorizationSnapshotV1,
): boolean {
  const common = snapshot.common;
  return (
    intent.submissionId.length > 0 &&
    intent.campaignId === common.campaignId &&
    intent.invitationId === common.invitationId &&
    intent.respondentId === common.respondentId &&
    intent.recipientRole === common.recipientRole &&
    intent.emailType === common.emailType
  );
}

function provenanceMatchesIntent(
  intent: OperatorIntentRow,
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

function frozenPayloadMatches(intent: OperatorIntentRow): boolean {
  if (
    intent.recipientEmail === null ||
    intent.subject === null ||
    intent.bodyHtml === null
  ) {
    return false;
  }
  return (
    assessmentEmailIntentPayloadHash({
      snapshotSchemaVersion: intent.snapshotSchemaVersion,
      recipientRole: intent.recipientRole,
      emailType: intent.emailType,
      recipientEmail: intent.recipientEmail,
      subject: intent.subject,
      bodyHtml: intent.bodyHtml,
    }) === intent.payloadHash
  );
}

async function readIntent(
  tx: OperatorTransaction,
  intentId: string,
  lock: "SHARE" | "UPDATE",
): Promise<OperatorIntentRow> {
  const rows =
    lock === "UPDATE"
      ? await tx.$queryRaw<OperatorIntentRow[]>(Prisma.sql`
          SELECT *
          FROM "assessment_email_delivery_intents"
          WHERE "id" = ${intentId}
          FOR UPDATE
        `)
      : await tx.$queryRaw<OperatorIntentRow[]>(Prisma.sql`
          SELECT *
          FROM "assessment_email_delivery_intents"
          WHERE "id" = ${intentId}
          FOR SHARE
        `);
  const intent = rows[0];
  if (!intent) throw new OperatorServiceError("INTENT_NOT_FOUND");
  return intent;
}

async function lockCurrentFactRows(
  tx: OperatorTransaction,
  intent: OperatorIntentRow,
  snapshot: AuthorizationSnapshotV1,
  includeOutbox: boolean,
): Promise<LockedOutbox | null> {
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
      FROM "coaches"
      WHERE "id" = ${snapshot.coachCompletion.coachId}
      FOR SHARE
    `);
  }
  if (!includeOutbox) return null;
  const outboxes = await tx.$queryRaw<LockedOutbox[]>(Prisma.sql`
    SELECT "id", "submissionId", "recipientRole", "status"
    FROM "assessment_email_outbox"
    WHERE "submissionId" = ${intent.submissionId}
      AND "recipientRole" = ${intent.recipientRole}
    FOR UPDATE
  `);
  return outboxes[0] ?? null;
}

function assertHeld(intent: OperatorIntentRow): void {
  if (intent.status !== "HELD") {
    throw new OperatorServiceError("INTENT_NOT_HELD");
  }
}

function assertVersion(
  intent: OperatorIntentRow,
  expectedVersion: number,
): void {
  if (intent.version !== expectedVersion) {
    throw new OperatorServiceError("VERSION_CONFLICT");
  }
}

function assertNotExpired(intent: OperatorIntentRow, now: Date): void {
  if (intent.expiresAt.getTime() <= now.getTime()) {
    throw new OperatorServiceError("INTENT_EXPIRED");
  }
}

function requiredSnapshot(intent: OperatorIntentRow): AuthorizationSnapshotV1 {
  const parsed = parseAuthorizationSnapshot(intent.authorizationSnapshot);
  if (
    !parsed.supported ||
    intent.snapshotSchemaVersion !== INTENT_SNAPSHOT_SCHEMA_VERSION ||
    !snapshotMatchesIntent(intent, parsed.value)
  ) {
    throw new OperatorServiceError("SNAPSHOT_UNSUPPORTED");
  }
  return parsed.value;
}

function requiredRenderer(intent: OperatorIntentRow): void {
  if (intent.rendererContractVersion !== INTENT_RENDERER_CONTRACT_VERSION) {
    throw new OperatorServiceError("RENDERER_UNSUPPORTED");
  }
}

function requiredProvenance(
  intent: OperatorIntentRow,
  snapshot: AuthorizationSnapshotV1,
): ContentProvenanceV1 {
  const provenance = parseContentProvenance(intent.contentProvenance);
  if (
    provenance === null ||
    !provenanceMatchesIntent(intent, snapshot, provenance)
  ) {
    throw new OperatorServiceError("PROVENANCE_INVALID");
  }
  return provenance;
}

function requiredPayload(intent: OperatorIntentRow): {
  recipientEmail: string;
  subject: string;
  bodyHtml: string;
} {
  if (!frozenPayloadMatches(intent)) {
    throw new OperatorServiceError("PAYLOAD_INTEGRITY_FAILED");
  }
  return {
    recipientEmail: intent.recipientEmail as string,
    subject: intent.subject as string,
    bodyHtml: intent.bodyHtml as string,
  };
}

function auditChanges(
  intent: OperatorIntentRow,
  input: {
    reasonCode: string;
    outboxId?: string;
    existingOutboxWon?: boolean;
    reviewContextHash?: string;
  },
): string {
  return JSON.stringify({
    intentId: intent.id,
    submissionId: intent.submissionId,
    campaignId: intent.campaignId,
    invitationId: intent.invitationId,
    recipientRole: intent.recipientRole,
    emailType: intent.emailType,
    payloadHash: intent.payloadHash,
    snapshotSchemaVersion: intent.snapshotSchemaVersion,
    rendererContractVersion: intent.rendererContractVersion,
    reasonCode: input.reasonCode,
    ...(input.outboxId ? { outboxId: input.outboxId } : {}),
    ...(input.existingOutboxWon === undefined
      ? {}
      : { existingOutboxWon: input.existingOutboxWon }),
    ...(input.reviewContextHash
      ? { reviewContextHash: input.reviewContextHash }
      : {}),
  });
}

async function writeRequiredAudit(
  tx: OperatorTransaction,
  intent: OperatorIntentRow,
  actor: OperatorActor,
  input: {
    action:
      | "ASSESSMENT_EMAIL_INTENT_DETAIL_VIEWED"
      | "ASSESSMENT_EMAIL_INTENT_RELEASED"
      | "ASSESSMENT_EMAIL_INTENT_CANCELLED";
    reasonCode: string;
    outboxId?: string;
    existingOutboxWon?: boolean;
    reviewContextHash?: string;
  },
): Promise<void> {
  try {
    await tx.auditLog.create({
      data: {
        entityType: "AssessmentEmailDeliveryIntent",
        entityId: intent.id,
        action: input.action,
        performedBy: actor.userId,
        changes: auditChanges(intent, input),
      },
    });
  } catch {
    throw new OperatorServiceError("AUDIT_FAILED");
  }
}

function mapReviewTokenError(error: unknown): OperatorServiceError {
  if (!(error instanceof IntentReviewTokenError)) {
    return new OperatorServiceError("TRANSACTION_FAILED");
  }
  switch (error.code) {
    case "CONFIGURATION_INVALID":
      return new OperatorServiceError("REVIEW_TOKEN_CONFIGURATION_INVALID");
    case "EXPIRED":
      return new OperatorServiceError("REVIEW_TOKEN_EXPIRED");
    case "ACTOR_MISMATCH":
      return new OperatorServiceError("REVIEW_TOKEN_ACTOR_MISMATCH");
    case "INTENT_MISMATCH":
      return new OperatorServiceError("REVIEW_TOKEN_INTENT_MISMATCH");
    case "VERSION_MISMATCH":
      return new OperatorServiceError("REVIEW_TOKEN_VERSION_MISMATCH");
    case "CONTEXT_MISMATCH":
      return new OperatorServiceError("REVIEW_CONTEXT_CHANGED");
    default:
      return new OperatorServiceError("REVIEW_TOKEN_INVALID");
  }
}

function issueReviewToken(
  deps: OperatorDeps,
  claims: Parameters<OperatorDeps["reviewTokens"]["issue"]>[0],
  now: Date,
): string {
  try {
    return deps.reviewTokens.issue(claims, now);
  } catch (error) {
    throw mapReviewTokenError(error);
  }
}

function verifyReviewToken(
  deps: OperatorDeps,
  token: string,
  expected: Parameters<OperatorDeps["reviewTokens"]["verify"]>[1],
  now: Date,
): void {
  try {
    deps.reviewTokens.verify(token, expected, now);
  } catch (error) {
    throw mapReviewTokenError(error);
  }
}

async function runOperatorTransaction<T>(
  deps: OperatorDeps,
  work: (tx: OperatorTransaction) => Promise<T>,
  options: OperatorTransactionOptions,
): Promise<T> {
  try {
    return await deps.runTransaction(work, options);
  } catch (error) {
    if (error instanceof OperatorServiceError) throw error;
    throw new OperatorServiceError("TRANSACTION_FAILED");
  }
}

function toHeldIntentDetail(
  intent: OperatorIntentRow,
  snapshot: AuthorizationSnapshotV1,
  provenance: ContentProvenanceV1,
  current: CurrentAuthorizationFactsV1,
  drift: ReauthorizationDecision,
  contextHash: string,
  reviewToken: string,
): HeldIntentDetail {
  const payload = requiredPayload(intent);
  return {
    id: intent.id,
    submissionId: intent.submissionId,
    campaignId: intent.campaignId,
    invitationId: intent.invitationId,
    respondentId: intent.respondentId,
    recipientRole: intent.recipientRole,
    emailType: intent.emailType,
    ...payload,
    payloadHash: intent.payloadHash,
    snapshotSchemaVersion: intent.snapshotSchemaVersion,
    rendererContractVersion: intent.rendererContractVersion,
    authorizationSnapshot: snapshot,
    contentProvenance: provenance,
    status: "HELD",
    version: intent.version,
    holdReason: intent.holdReason,
    holdReasons: intent.holdReasons,
    heldAt: intent.heldAt,
    expiresAt: intent.expiresAt,
    current,
    drift,
    reviewContextHash: contextHash,
    reviewToken,
  };
}

function terminalData(
  intent: OperatorIntentRow,
  input: {
    now: Date;
    actor: OperatorActor;
    status: "HANDED_OFF" | "CANCELLED";
    reasonCode: string;
    outboxId?: string;
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
          actor: input.actor.userId,
          reasonCode: input.reasonCode,
          snapshot: input.snapshot,
          provenance: input.provenance,
        })
      : {
          status: input.status,
          handedOffOutboxId: input.outboxId ?? null,
          resolvedAt: input.now,
          resolvedBy: input.actor.userId,
          resolutionReasonCode: input.reasonCode,
          recipientEmail: null,
          subject: null,
          bodyHtml: null,
          authorizationSnapshot: Prisma.DbNull,
          contentProvenance: Prisma.DbNull,
        };
  return {
    ...terminal,
    holdReason: null,
    holdReasons: Prisma.DbNull,
    heldAt: null,
    lastErrorClass: null,
    version: { increment: 1 },
    payloadHash: intent.payloadHash,
  };
}

export async function loadHeldIntentDetail(
  deps: OperatorDeps,
  input: { intentId: string; actor: OperatorActor },
): Promise<HeldIntentDetail> {
  return runOperatorTransaction(
    deps,
    async (tx) => {
      const now = deps.now();
      const intent = await readIntent(tx, input.intentId, "SHARE");
      assertHeld(intent);
      const snapshot = requiredSnapshot(intent);
      requiredRenderer(intent);
      const provenance = requiredProvenance(intent, snapshot);
      requiredPayload(intent);
      await lockCurrentFactRows(tx, intent, snapshot, false);
      const current = await deps.loadCurrentAuthorizationFacts(
        tx,
        intent,
        snapshot,
      );
      const contextHash = reviewContextHash({
        intentId: intent.id,
        intentVersion: intent.version,
        current,
      });
      const drift = evaluateIntentReauthorization({
        intent: {
          submissionId: intent.submissionId,
          campaignId: intent.campaignId,
          invitationId: intent.invitationId,
          respondentId: intent.respondentId,
          recipientRole: snapshot.common.recipientRole,
          emailType: snapshot.common.emailType,
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
      await writeRequiredAudit(tx, intent, input.actor, {
        action: "ASSESSMENT_EMAIL_INTENT_DETAIL_VIEWED",
        reasonCode: "DETAIL_VIEWED",
        reviewContextHash: contextHash,
      });
      const reviewToken = issueReviewToken(
        deps,
        {
          actorUserId: input.actor.userId,
          intentId: intent.id,
          intentVersion: intent.version,
          reviewContextHash: contextHash,
        },
        now,
      );
      return toHeldIntentDetail(
        intent,
        snapshot,
        provenance,
        current,
        drift,
        contextHash,
        reviewToken,
      );
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: TRANSACTION_TIMEOUT_MS,
    },
  );
}

export async function releaseHeldIntent(
  deps: OperatorDeps,
  input: {
    intentId: string;
    actor: OperatorActor;
    expectedVersion: number;
    reasonCode: ReleaseReasonCode;
    reviewToken: string;
  },
): Promise<OperatorResolution> {
  if (!RELEASE_REASON_CODES.includes(input.reasonCode)) {
    throw new OperatorServiceError("RELEASE_REASON_NOT_ALLOWED");
  }
  return runOperatorTransaction(
    deps,
    async (tx) => {
      await tx.$executeRaw(Prisma.sql`SET LOCAL lock_timeout = '2s'`);
      await tx.$executeRaw(
        Prisma.sql`SET LOCAL statement_timeout = '10s'`,
      );
      const intent = await readIntent(tx, input.intentId, "UPDATE");
      const initialNow = deps.now();
      assertHeld(intent);
      assertVersion(intent, input.expectedVersion);
      assertNotExpired(intent, initialNow);
      if (deps.isPaused()) {
        throw new OperatorServiceError("SENDS_PAUSED");
      }
      const snapshot = requiredSnapshot(intent);
      requiredRenderer(intent);
      const provenance = requiredProvenance(intent, snapshot);
      const payload = requiredPayload(intent);
      const existingOutbox = await lockCurrentFactRows(
        tx,
        intent,
        snapshot,
        true,
      );
      const current = await deps.loadCurrentAuthorizationFacts(
        tx,
        intent,
        snapshot,
      );
      const contextHash = reviewContextHash({
        intentId: intent.id,
        intentVersion: intent.version,
        current,
      });
      const now = deps.now();
      assertNotExpired(intent, now);
      verifyReviewToken(
        deps,
        input.reviewToken,
        {
          actorUserId: input.actor.userId,
          intentId: intent.id,
          intentVersion: intent.version,
          reviewContextHash: contextHash,
        },
        now,
      );

      if (
        existingOutbox !== null &&
        (existingOutbox.submissionId !== intent.submissionId ||
          existingOutbox.recipientRole !== intent.recipientRole)
      ) {
        throw new OperatorServiceError("OUTBOX_OWNERSHIP_CONFLICT");
      }
      const outboxId =
        existingOutbox?.id ??
        (
          await tx.assessmentEmailOutbox.create({
            data: {
              submissionId: intent.submissionId,
              recipientEmail: payload.recipientEmail,
              recipientRole: intent.recipientRole,
              emailType: intent.emailType,
              subject: payload.subject,
              bodyHtml: payload.bodyHtml,
              status: "PENDING",
              authorizationProvenance: snapshot,
              contentProvenance: provenance,
            },
            select: { id: true },
          })
        ).id;
      await writeRequiredAudit(tx, intent, input.actor, {
        action: "ASSESSMENT_EMAIL_INTENT_RELEASED",
        reasonCode: input.reasonCode,
        outboxId,
        existingOutboxWon: existingOutbox !== null,
        reviewContextHash: contextHash,
      });
      await tx.assessmentEmailDeliveryIntent.update({
        where: { id: intent.id },
        data: terminalData(intent, {
          now,
          actor: input.actor,
          status: "HANDED_OFF",
          outboxId,
          reasonCode: input.reasonCode,
          snapshot,
          provenance,
        }),
      });
      return {
        intentId: intent.id,
        status: "HANDED_OFF",
        version: intent.version + 1,
        outboxId,
        existingOutboxWon: existingOutbox !== null,
      };
    },
    { timeout: TRANSACTION_TIMEOUT_MS },
  );
}

export async function cancelHeldIntent(
  deps: OperatorDeps,
  input: {
    intentId: string;
    actor: OperatorActor;
    expectedVersion: number;
    reasonCode: CancellationReasonCode;
  },
): Promise<OperatorResolution> {
  if (!CANCELLATION_REASON_CODES.includes(input.reasonCode)) {
    throw new OperatorServiceError("CANCELLATION_REASON_NOT_ALLOWED");
  }
  return runOperatorTransaction(
    deps,
    async (tx) => {
      await tx.$executeRaw(Prisma.sql`SET LOCAL lock_timeout = '2s'`);
      await tx.$executeRaw(
        Prisma.sql`SET LOCAL statement_timeout = '10s'`,
      );
      const intent = await readIntent(tx, input.intentId, "UPDATE");
      const now = deps.now();
      assertHeld(intent);
      assertVersion(intent, input.expectedVersion);
      assertNotExpired(intent, now);

      const parsed = parseAuthorizationSnapshot(intent.authorizationSnapshot);
      const snapshot = parsed.supported ? parsed.value : null;
      const parsedProvenance = parseContentProvenance(
        intent.contentProvenance,
      );
      const provenance =
        snapshot !== null &&
        parsedProvenance !== null &&
        provenanceMatchesIntent(intent, snapshot, parsedProvenance)
          ? parsedProvenance
          : null;
      await writeRequiredAudit(tx, intent, input.actor, {
        action: "ASSESSMENT_EMAIL_INTENT_CANCELLED",
        reasonCode: input.reasonCode,
      });
      await tx.assessmentEmailDeliveryIntent.update({
        where: { id: intent.id },
        data: terminalData(intent, {
          now,
          actor: input.actor,
          status: "CANCELLED",
          reasonCode: input.reasonCode,
          snapshot: provenance === null ? null : snapshot,
          provenance,
        }),
      });
      return {
        intentId: intent.id,
        status: "CANCELLED",
        version: intent.version + 1,
        outboxId: null,
        existingOutboxWon: false,
      };
    },
    { timeout: TRANSACTION_TIMEOUT_MS },
  );
}

export function productionAssessmentEmailIntentOperatorDeps(options: {
  reviewTokenSecret?: string;
} = {}): OperatorDeps {
  const reconcilerDeps = productionAssessmentEmailIntentReconcilerDeps();
  return {
    now: () => new Date(),
    isPaused: assessmentSendsPaused,
    runTransaction: (work, transactionOptions) =>
      db.$transaction(
        (tx) => work(tx as unknown as OperatorTransaction),
        {
          timeout: transactionOptions.timeout,
          ...(transactionOptions.isolationLevel
            ? { isolationLevel: transactionOptions.isolationLevel }
            : {}),
        },
      ),
    loadCurrentAuthorizationFacts: (tx, intent, snapshot) =>
      reconcilerDeps.loadCurrentAuthorizationFacts(
        tx as never,
        intent as never,
        snapshot,
      ),
    reviewTokens: {
      issue: (claims, now) =>
        issueIntentReviewToken(claims, {
          now,
          secret: options.reviewTokenSecret,
        }),
      verify: (token, expected, now) =>
        verifyIntentReviewToken(token, expected, {
          now,
          secret: options.reviewTokenSecret,
        }),
    },
  };
}
