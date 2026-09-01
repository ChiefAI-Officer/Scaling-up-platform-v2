/**
 * Injected database orchestration for the SunHub mini-quiz successor.
 *
 * This module never constructs a Prisma client or loads credentials. The CLI
 * supplies the client; tests supply the same narrow Prisma-compatible seam.
 */

import type { Prisma } from "@prisma/client";

import { activePublishedWhere } from "@/lib/assessments/active-version";
import { stableCanonicalJson } from "@/lib/assessments/assessment-email-delivery-intents";
import {
  LIVE_ALIAS,
  PROMOTION_MANIFEST_SCHEMA_VERSION,
  RETIRED_ALIAS,
  SOURCE_CAMPAIGN_ID,
  SOURCE_VERSION_ID,
  SUCCESSOR_CAMPAIGN_ID,
  TARGET_VERSION_ID,
  PromotionInvariantError,
  buildPromotionPlan,
  type PromotionArgs,
  type PromotionExpectedCas,
  type PromotionInput,
  type PromotionPlan,
  type SourceCampaign,
  type SuccessorCampaignFields,
  type TemplateSnapshot,
  type TemplateVersionSnapshot,
} from "@/lib/scripts/promote-sunhub-quick-quiz-core";

type SourceCampaignRow = Omit<SourceCampaign, "submissionCount"> & {
  _count: { submissions: number };
};

type SuccessorCampaignRow = SuccessorCampaignFields & {
  inviteTiming: "IMMEDIATELY";
  organizationId: string | null;
  externalId: string | null;
  invitedWelcomeSnapshot: unknown;
  invitationSubject: string | null;
  invitationBodyMarkdown: string | null;
  invitationBodyHtml: string | null;
  inviteSendStartedAt: Date | string | null;
  inviteSendHeartbeatAt: Date | string | null;
  invitesSentAt: Date | string | null;
  importManifest: unknown;
  deletedAt: Date | string | null;
  _count: {
    participants: number;
    invitations: number;
    submissions: number;
    summaryReports: number;
  };
};

type AuditReceiptRow = {
  entityType: string;
  entityId: string;
  action: string;
  performedBy: string | null;
  changes: string;
};

export type AuditCreateData = {
  entityType: "AssessmentCampaign";
  entityId: typeof SOURCE_CAMPAIGN_ID;
  action: PromotionPlan["manifest"]["audit"]["action"];
  performedBy: string;
  changes: string;
};

/** Prisma's database-NULL sentinel, injected so this module stays import-safe. */
export type PromotionJsonDatabaseNull = Prisma.NullTypes.DbNull;

type SuccessorCampaignCreateData = Omit<
  SuccessorCampaignFields,
  "publicConfig" | "customSlides"
> & {
  publicConfig: Prisma.InputJsonValue | PromotionJsonDatabaseNull;
  customSlides: Prisma.InputJsonValue | PromotionJsonDatabaseNull;
};

export interface TransactionClient {
  assessmentCampaign: {
    findUnique(args: unknown): Promise<SourceCampaignRow | SuccessorCampaignRow | { id: string } | null>;
    updateMany(args: unknown): Promise<{ count: number }>;
    create(args: { data: SuccessorCampaignCreateData }): Promise<{ id: string }>;
  };
  assessmentTemplate: {
    findUnique(args: unknown): Promise<TemplateSnapshot | null>;
  };
  assessmentTemplateVersion: {
    findUnique(args: unknown): Promise<TemplateVersionSnapshot | null>;
    findFirst(args: unknown): Promise<{ id: string } | null>;
  };
  auditLog: {
    findMany(args: unknown): Promise<AuditReceiptRow[]>;
    create(args: { data: AuditCreateData }): Promise<unknown>;
  };
  $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number>;
}

export interface DbClient extends TransactionClient {
  $transaction<T>(
    callback: (tx: TransactionClient) => Promise<T>,
    options?: {
      isolationLevel: "Serializable";
      maxWait: number;
      timeout: number;
    },
  ): Promise<T>;
}

const PROMOTION_TRANSACTION_OPTIONS = {
  isolationLevel: "Serializable" as const,
  maxWait: 10_000,
  timeout: 30_000,
};

export type PromotionLoadExpected = {
  args: PromotionArgs;
  expected?: PromotionExpectedCas;
  now?: Date | string;
};

const sourceSelect = {
  id: true,
  templateId: true,
  versionId: true,
  language: true,
  alias: true,
  status: true,
  accessMode: true,
  deletedAt: true,
  updatedAt: true,
  name: true,
  description: true,
  publicConfig: true,
  invitedWelcomeSnapshot: true,
  openAt: true,
  endMode: true,
  closeAt: true,
  notifyAdminOnSubmit: true,
  invitationSubject: true,
  invitationBodyMarkdown: true,
  sendResultsToRespondent: true,
  notifyCoachOnCompletion: true,
  showResultsOnScreen: true,
  reportStyle: true,
  reportStyleSource: true,
  reportStyleLockedAt: true,
  invitationBodyHtml: true,
  customSlides: true,
  createdBy: true,
  createdByCoachId: true,
  _count: { select: { submissions: true } },
} as const;

const versionSelect = {
  id: true,
  templateId: true,
  language: true,
  publishedAt: true,
  archivedAt: true,
  questions: true,
  sections: true,
  scoringConfig: true,
  reportConfig: true,
} as const;

const successorSelect = {
  ...sourceSelect,
  // Database-managed and intentionally absent from the durable successor manifest.
  updatedAt: false,
  organizationId: true,
  externalId: true,
  inviteSendStartedAt: true,
  inviteTiming: true,
  inviteSendHeartbeatAt: true,
  invitesSentAt: true,
  importManifest: true,
  _count: {
    select: {
      participants: true,
      invitations: true,
      submissions: true,
      summaryReports: true,
    },
  },
} as const;

function invariant(field: string, message: string): never {
  throw new PromotionInvariantError(field, message);
}

function requireOperator(operator: string): void {
  if (operator.trim() === "") invariant("operator", "must be non-empty");
}

function sourceFromRow(row: SourceCampaignRow): SourceCampaign {
  const { _count, ...campaign } = row;
  return { ...campaign, submissionCount: _count.submissions };
}

/** Load the complete planner input without invoking any write or transaction. */
export async function loadPromotionInput(
  db: TransactionClient,
  loadExpected: PromotionLoadExpected,
): Promise<PromotionInput> {
  const sourceRow = await db.assessmentCampaign.findUnique({
    where: { id: SOURCE_CAMPAIGN_ID },
    select: sourceSelect,
  }) as SourceCampaignRow | null;
  if (!sourceRow) invariant("sourceCampaign.id", "the compiled source campaign was not found");

  const [template, sourceVersion, targetVersion, latestActiveVersion, retiredAliasOwner] =
    await Promise.all([
      db.assessmentTemplate.findUnique({
        where: { id: sourceRow.templateId },
        select: {
          id: true,
          alias: true,
          deletedAt: true,
          disabledAt: true,
          deliveryType: true,
        },
      }),
      db.assessmentTemplateVersion.findUnique({
        where: { id: SOURCE_VERSION_ID },
        select: versionSelect,
      }),
      db.assessmentTemplateVersion.findUnique({
        where: { id: TARGET_VERSION_ID },
        select: versionSelect,
      }),
      db.assessmentTemplateVersion.findFirst({
        where: {
          templateId: sourceRow.templateId,
          language: sourceRow.language,
          ...activePublishedWhere,
        },
        orderBy: { versionNumber: "desc" },
        select: { id: true },
      }),
      db.assessmentCampaign.findUnique({
        where: { alias: RETIRED_ALIAS },
        select: { id: true },
      }),
    ]);

  if (!template) invariant("template.id", "the source template was not found");
  if (!sourceVersion) invariant("sourceVersion.id", "the compiled source version was not found");
  if (!targetVersion) invariant("targetVersion.id", "the compiled target version was not found");

  const sourceCampaign = sourceFromRow(sourceRow);
  const expected = loadExpected.expected ?? {
    sourceUpdatedAt:
      loadExpected.args.expectedSourceUpdatedAt ??
      new Date(sourceCampaign.updatedAt).toISOString(),
    submissionCount:
      loadExpected.args.expectedSubmissionCount ?? sourceCampaign.submissionCount,
  };

  return {
    args: loadExpected.args,
    sourceCampaign,
    template,
    sourceVersion,
    targetVersion,
    latestPublishedVersionId: latestActiveVersion?.id ?? null,
    retiredAliasOccupied: retiredAliasOwner !== null,
    expected,
    ...(loadExpected.now === undefined ? {} : { now: loadExpected.now }),
  };
}

function loadExpectedFromPlan(plan: PromotionPlan): PromotionLoadExpected {
  return {
    args: {
      mode: plan.mode,
      hasProductionAcknowledgement: true,
      expectedSourceUpdatedAt: plan.sourceCas.updatedAt,
      expectedSubmissionCount: plan.sourceCas.submissionCount,
    },
    expected: {
      sourceUpdatedAt: plan.sourceCas.updatedAt,
      submissionCount: plan.sourceCas.submissionCount,
    },
  };
}

function normalizedJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function canonicalMatches(left: unknown, right: unknown): boolean {
  try {
    return stableCanonicalJson(normalizedJson(left)) === stableCanonicalJson(normalizedJson(right));
  } catch {
    return false;
  }
}

function assertSamePlan(expected: PromotionPlan, actual: PromotionPlan): void {
  if (!canonicalMatches(actual, expected)) {
    invariant("transaction.plan", "transaction-time revalidation did not reproduce the supplied plan");
  }
}

function receiptData(plan: PromotionPlan, operator: string): AuditCreateData {
  return {
    entityType: "AssessmentCampaign",
    entityId: SOURCE_CAMPAIGN_ID,
    action: plan.manifest.audit.action,
    performedBy: operator,
    changes: JSON.stringify(plan.manifest.audit.payload),
  };
}

async function loadReceipts(
  db: TransactionClient,
  action: PromotionPlan["manifest"]["audit"]["action"],
): Promise<AuditReceiptRow[]> {
  return db.auditLog.findMany({
    where: {
      entityType: "AssessmentCampaign",
      entityId: SOURCE_CAMPAIGN_ID,
      action,
    },
    select: {
      entityType: true,
      entityId: true,
      action: true,
      performedBy: true,
      changes: true,
    },
    orderBy: { timestamp: "asc" },
  });
}

function receiptMatches(receipt: AuditReceiptRow, plan: PromotionPlan): boolean {
  if (
    receipt.entityType !== "AssessmentCampaign" ||
    receipt.entityId !== SOURCE_CAMPAIGN_ID ||
    receipt.action !== plan.manifest.audit.action ||
    typeof receipt.performedBy !== "string" ||
    receipt.performedBy.trim() === ""
  ) {
    return false;
  }
  try {
    return canonicalMatches(JSON.parse(receipt.changes), plan.manifest.audit.payload);
  } catch {
    return false;
  }
}

function sourceMatchesPlan(
  source: SourceCampaign,
  plan: PromotionPlan,
  expectedAlias: string,
  expectedStatus: "CLOSED",
): boolean {
  const expectedCommon = plan.successor;
  return (
    source.id === plan.sourceCas.id &&
    source.templateId === expectedCommon.templateId &&
    source.versionId === plan.sourceCas.versionId &&
    source.language === expectedCommon.language &&
    source.alias === expectedAlias &&
    source.status === expectedStatus &&
    source.accessMode === expectedCommon.accessMode &&
    source.deletedAt === null &&
    source.submissionCount === plan.sourceCas.submissionCount &&
    source.name === expectedCommon.name &&
    source.description === expectedCommon.description &&
    canonicalMatches(source.publicConfig, expectedCommon.publicConfig) &&
    canonicalMatches(source.openAt, expectedCommon.openAt) &&
    source.endMode === expectedCommon.endMode &&
    canonicalMatches(source.closeAt, expectedCommon.closeAt) &&
    source.notifyAdminOnSubmit === expectedCommon.notifyAdminOnSubmit &&
    source.sendResultsToRespondent === expectedCommon.sendResultsToRespondent &&
    source.notifyCoachOnCompletion === expectedCommon.notifyCoachOnCompletion &&
    source.showResultsOnScreen === expectedCommon.showResultsOnScreen &&
    source.reportStyle === expectedCommon.reportStyle &&
    source.reportStyleSource === expectedCommon.reportStyleSource &&
    canonicalMatches(source.reportStyleLockedAt, expectedCommon.reportStyleLockedAt) &&
    canonicalMatches(source.customSlides, expectedCommon.customSlides) &&
    source.createdBy === expectedCommon.createdBy &&
    source.createdByCoachId === expectedCommon.createdByCoachId
  );
}

function expectedSuccessor(plan: PromotionPlan): SuccessorCampaignRow {
  return {
    ...plan.successor,
    inviteTiming: "IMMEDIATELY",
    organizationId: null,
    externalId: null,
    invitedWelcomeSnapshot: null,
    invitationSubject: null,
    invitationBodyMarkdown: null,
    invitationBodyHtml: null,
    inviteSendStartedAt: null,
    inviteSendHeartbeatAt: null,
    invitesSentAt: null,
    importManifest: null,
    deletedAt: null,
    _count: {
      participants: 0,
      invitations: 0,
      submissions: 0,
      summaryReports: 0,
    },
  };
}

function successorCreateData(
  plan: PromotionPlan,
  databaseJsonNull: PromotionJsonDatabaseNull,
): SuccessorCampaignCreateData {
  return {
    ...plan.successor,
    publicConfig:
      plan.successor.publicConfig === null
        ? databaseJsonNull
        : plan.successor.publicConfig as Prisma.InputJsonValue,
    customSlides:
      plan.successor.customSlides === null
        ? databaseJsonNull
        : plan.successor.customSlides as Prisma.InputJsonValue,
  };
}

async function loadSuccessor(db: TransactionClient): Promise<SuccessorCampaignRow | null> {
  return db.assessmentCampaign.findUnique({
    where: { id: SUCCESSOR_CAMPAIGN_ID },
    select: successorSelect,
  }) as Promise<SuccessorCampaignRow | null>;
}

function assertCompleteQuiescence(
  input: PromotionInput,
  successor: SuccessorCampaignRow | null,
  receipts: AuditReceiptRow[],
  plan: PromotionPlan,
): void {
  if (
    !sourceMatchesPlan(input.sourceCampaign, plan, LIVE_ALIAS, "CLOSED") ||
    input.retiredAliasOccupied ||
    successor !== null ||
    receipts.length !== 1 ||
    !receiptMatches(receipts[0], plan)
  ) {
    invariant("idempotency.quiesce", "partial or conflicting quiescence state was found");
  }
}

function assertCompleteApply(
  input: PromotionInput,
  successor: SuccessorCampaignRow | null,
  receipts: AuditReceiptRow[],
  plan: PromotionPlan,
): void {
  if (
    !sourceMatchesPlan(input.sourceCampaign, plan, RETIRED_ALIAS, "CLOSED") ||
    !input.retiredAliasOccupied ||
    successor === null ||
    !canonicalMatches(successor, expectedSuccessor(plan)) ||
    receipts.length !== 1 ||
    !receiptMatches(receipts[0], plan)
  ) {
    invariant("idempotency.apply", "partial or conflicting promotion state was found");
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function canonicalIso(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  return (
    actualKeys.length === sortedExpectedKeys.length &&
    actualKeys.every((key, index) => key === sortedExpectedKeys[index])
  );
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function nullableCanonicalIso(value: unknown): value is string | null {
  return value === null || canonicalIso(value);
}

const APPLY_RECEIPT_KEYS = [
  "schemaVersion",
  "source",
  "targetVersionId",
  "successor",
  "retiredAlias",
] as const;

const SOURCE_CAS_KEYS = [
  "id",
  "versionId",
  "alias",
  "status",
  "deletedAt",
  "updatedAt",
  "submissionCount",
] as const;

const SUCCESSOR_ALLOW_LIST = [
  "id",
  "templateId",
  "versionId",
  "language",
  "alias",
  "name",
  "description",
  "status",
  "accessMode",
  "publicConfig",
  "openAt",
  "endMode",
  "closeAt",
  "notifyAdminOnSubmit",
  "sendResultsToRespondent",
  "notifyCoachOnCompletion",
  "showResultsOnScreen",
  "reportStyle",
  "reportStyleSource",
  "reportStyleLockedAt",
  "customSlides",
  "createdBy",
  "createdByCoachId",
] as const;

/**
 * Reconstruct the historical apply plan solely from its durable audit payload.
 * Completion inspection must not rerun today's mutable preflight facts (for
 * example Active-version, archive, or template-enabled state).
 */
function planFromApplyReceipt(receipts: AuditReceiptRow[]): PromotionPlan {
  if (receipts.length !== 1) invariant("idempotency.apply", "expected exactly one promotion receipt");
  const receipt = receipts[0];
  if (
    receipt.entityType !== "AssessmentCampaign" ||
    receipt.entityId !== SOURCE_CAMPAIGN_ID ||
    receipt.action !== "PUBLIC_CAMPAIGN_SUCCESSOR_PROMOTION" ||
    typeof receipt.performedBy !== "string" ||
    receipt.performedBy.trim() === ""
  ) {
    invariant("idempotency.apply", "promotion receipt identity did not match");
  }

  let payload: Record<string, unknown> | null = null;
  try {
    payload = record(JSON.parse(receipt.changes));
  } catch {
    invariant("idempotency.apply", "promotion receipt payload was not JSON");
  }
  if (!payload) invariant("idempotency.apply", "promotion receipt payload was not an object");
  if (!hasExactKeys(payload, APPLY_RECEIPT_KEYS)) {
    invariant("idempotency.apply", "promotion receipt payload keys did not match the schema");
  }
  if (
    payload.schemaVersion !== PROMOTION_MANIFEST_SCHEMA_VERSION ||
    payload.targetVersionId !== TARGET_VERSION_ID ||
    payload.retiredAlias !== RETIRED_ALIAS
  ) {
    invariant("idempotency.apply", "promotion receipt constants did not match");
  }

  const source = record(payload.source);
  if (
    !source ||
    !hasExactKeys(source, SOURCE_CAS_KEYS) ||
    source.id !== SOURCE_CAMPAIGN_ID ||
    source.versionId !== SOURCE_VERSION_ID ||
    source.alias !== LIVE_ALIAS ||
    source.status !== "CLOSED" ||
    source.deletedAt !== null ||
    !canonicalIso(source.updatedAt) ||
    !Number.isSafeInteger(source.submissionCount) ||
    (source.submissionCount as number) < 0
  ) {
    invariant("idempotency.apply", "promotion receipt payload did not contain a valid source CAS");
  }

  const sourceCas: PromotionPlan["sourceCas"] = {
    id: SOURCE_CAMPAIGN_ID,
    versionId: SOURCE_VERSION_ID,
    alias: LIVE_ALIAS,
    status: "CLOSED",
    deletedAt: null,
    updatedAt: source.updatedAt as string,
    submissionCount: source.submissionCount as number,
  };
  const successorRecord = record(payload.successor);
  if (
    !successorRecord ||
    !hasExactKeys(successorRecord, SUCCESSOR_ALLOW_LIST) ||
    successorRecord.id !== SUCCESSOR_CAMPAIGN_ID ||
    typeof successorRecord.templateId !== "string" ||
    successorRecord.templateId === "" ||
    successorRecord.versionId !== TARGET_VERSION_ID ||
    typeof successorRecord.language !== "string" ||
    successorRecord.language === "" ||
    successorRecord.alias !== LIVE_ALIAS ||
    typeof successorRecord.name !== "string" ||
    !nullableString(successorRecord.description) ||
    successorRecord.status !== "ACTIVE" ||
    successorRecord.accessMode !== "PUBLIC" ||
    !canonicalIso(successorRecord.openAt) ||
    typeof successorRecord.endMode !== "string" ||
    successorRecord.endMode === "" ||
    !nullableCanonicalIso(successorRecord.closeAt) ||
    typeof successorRecord.notifyAdminOnSubmit !== "boolean" ||
    typeof successorRecord.sendResultsToRespondent !== "boolean" ||
    typeof successorRecord.notifyCoachOnCompletion !== "boolean" ||
    typeof successorRecord.showResultsOnScreen !== "boolean" ||
    typeof successorRecord.reportStyle !== "string" ||
    successorRecord.reportStyle === "" ||
    typeof successorRecord.reportStyleSource !== "string" ||
    successorRecord.reportStyleSource === "" ||
    !nullableCanonicalIso(successorRecord.reportStyleLockedAt) ||
    typeof successorRecord.createdBy !== "string" ||
    successorRecord.createdBy === "" ||
    !nullableString(successorRecord.createdByCoachId)
  ) {
    invariant("idempotency.apply", "promotion receipt successor did not match the allow-list schema");
  }

  const successor: SuccessorCampaignFields = {
    id: SUCCESSOR_CAMPAIGN_ID,
    templateId: successorRecord.templateId,
    versionId: TARGET_VERSION_ID,
    language: successorRecord.language,
    alias: LIVE_ALIAS,
    name: successorRecord.name,
    description: successorRecord.description,
    status: "ACTIVE",
    accessMode: "PUBLIC",
    publicConfig: successorRecord.publicConfig,
    openAt: successorRecord.openAt,
    endMode: successorRecord.endMode,
    closeAt: successorRecord.closeAt,
    notifyAdminOnSubmit: successorRecord.notifyAdminOnSubmit,
    sendResultsToRespondent: successorRecord.sendResultsToRespondent,
    notifyCoachOnCompletion: successorRecord.notifyCoachOnCompletion,
    showResultsOnScreen: successorRecord.showResultsOnScreen,
    reportStyle: successorRecord.reportStyle,
    reportStyleSource: successorRecord.reportStyleSource,
    reportStyleLockedAt: successorRecord.reportStyleLockedAt,
    customSlides: successorRecord.customSlides,
    createdBy: successorRecord.createdBy,
    createdByCoachId: successorRecord.createdByCoachId,
  };
  const expected: PromotionExpectedCas = {
    sourceUpdatedAt: source.updatedAt as string,
    submissionCount: source.submissionCount as number,
  };
  const historicalPayload: PromotionPlan["manifest"]["audit"]["payload"] = {
    schemaVersion: PROMOTION_MANIFEST_SCHEMA_VERSION,
    source: sourceCas,
    targetVersionId: TARGET_VERSION_ID,
    successor,
    retiredAlias: RETIRED_ALIAS,
  };
  const plan: PromotionPlan = {
    mode: "apply",
    sourceCas,
    successor,
    manifest: {
      schemaVersion: PROMOTION_MANIFEST_SCHEMA_VERSION,
      operation: "sunhub-quick-quiz-successor-promotion",
      mode: "apply",
      source: {
        campaignId: SOURCE_CAMPAIGN_ID,
        templateId: successor.templateId,
        versionId: SOURCE_VERSION_ID,
        alias: LIVE_ALIAS,
      },
      target: {
        versionId: TARGET_VERSION_ID,
        templateId: successor.templateId,
        language: successor.language,
      },
      successor: {
        id: SUCCESSOR_CAMPAIGN_ID,
        alias: LIVE_ALIAS,
        versionId: TARGET_VERSION_ID,
        templateId: successor.templateId,
      },
      expected,
      audit: {
        action: "PUBLIC_CAMPAIGN_SUCCESSOR_PROMOTION",
        payload: historicalPayload,
      },
    },
  };
  if (!receiptMatches(receipt, plan)) {
    invariant("idempotency.apply", "promotion receipt did not match the complete manifest");
  }
  return plan;
}

/**
 * Inspect a retired source read-only using the exact completed-apply predicate
 * already used by apply retries. Any partial or conflicting state aborts.
 */
export async function inspectCompletedPromotion(
  db: TransactionClient,
  input: PromotionInput,
): Promise<{ status: "complete" } | null> {
  if (
    input.sourceCampaign.alias !== RETIRED_ALIAS ||
    input.sourceCampaign.status !== "CLOSED"
  ) {
    return null;
  }

  const [successor, receipts] = await Promise.all([
    loadSuccessor(db),
    loadReceipts(db, "PUBLIC_CAMPAIGN_SUCCESSOR_PROMOTION"),
  ]);
  const plan = planFromApplyReceipt(receipts);
  assertCompleteApply(input, successor, receipts, plan);
  return { status: "complete" };
}

/** Close the exact source while retaining its live alias and write one receipt. */
export async function quiescePromotion(
  db: DbClient,
  plan: PromotionPlan,
  operator: string,
): Promise<{ status: "quiesced" | "idempotent" }> {
  requireOperator(operator);
  if (plan.mode !== "quiesce") invariant("plan.mode", "must be quiesce");

  return db.$transaction(async (tx) => {
    const input = await loadPromotionInput(tx, loadExpectedFromPlan(plan));
    const [successor, receipts] = await Promise.all([
      loadSuccessor(tx),
      loadReceipts(tx, "PUBLIC_CAMPAIGN_SUCCESSOR_QUIESCE"),
    ]);
    const mayBeRetry =
      input.sourceCampaign.status !== "ACTIVE" ||
      input.retiredAliasOccupied ||
      successor !== null ||
      receipts.length > 0;
    if (mayBeRetry) {
      assertCompleteQuiescence(input, successor, receipts, plan);
      return { status: "idempotent" as const };
    }

    assertSamePlan(plan, buildPromotionPlan(input));
    const updated = await tx.assessmentCampaign.updateMany({
      where: {
        id: plan.sourceCas.id,
        versionId: plan.sourceCas.versionId,
        alias: plan.sourceCas.alias,
        status: "ACTIVE",
        deletedAt: null,
        updatedAt: new Date(plan.sourceCas.updatedAt),
      },
      data: { status: "CLOSED" },
    });
    if (updated.count !== 1) invariant("sourceCampaign.CAS", "quiescence CAS matched zero rows");

    await tx.auditLog.create({ data: receiptData(plan, operator) });
    return { status: "quiesced" as const };
  }, PROMOTION_TRANSACTION_OPTIONS);
}

/** Atomically retire v1's alias, create the deterministic v7 successor, and receipt it. */
export async function applyPromotion(
  db: DbClient,
  plan: PromotionPlan,
  operator: string,
  databaseJsonNull: PromotionJsonDatabaseNull,
): Promise<{
  status: "applied" | "idempotent";
  successorCampaignId: typeof SUCCESSOR_CAMPAIGN_ID;
}> {
  requireOperator(operator);
  if (plan.mode !== "apply") invariant("plan.mode", "must be apply");

  return db.$transaction(async (tx) => {
    const input = await loadPromotionInput(tx, loadExpectedFromPlan(plan));
    const [successor, receipts] = await Promise.all([
      loadSuccessor(tx),
      loadReceipts(tx, "PUBLIC_CAMPAIGN_SUCCESSOR_PROMOTION"),
    ]);
    const mayBeRetry =
      input.sourceCampaign.alias !== LIVE_ALIAS ||
      input.retiredAliasOccupied ||
      successor !== null ||
      receipts.length > 0;
    if (mayBeRetry) {
      assertCompleteApply(input, successor, receipts, plan);
      return {
        status: "idempotent" as const,
        successorCampaignId: SUCCESSOR_CAMPAIGN_ID,
      };
    }

    assertSamePlan(plan, buildPromotionPlan(input));
    const updated = await tx.$executeRaw`
      UPDATE "assessment_campaigns" AS source
      SET "alias" = ${RETIRED_ALIAS}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE source."id" = ${plan.sourceCas.id}
        AND source."versionId" = ${plan.sourceCas.versionId}
        AND source."alias" = ${plan.sourceCas.alias}
        AND source."status"::text = ${plan.sourceCas.status}
        AND source."deletedAt" IS NULL
        AND source."updatedAt" = ${new Date(plan.sourceCas.updatedAt)}
        AND (
          SELECT COUNT(*)
          FROM "assessment_submissions" AS submission
          WHERE submission."campaignId" = source."id"
        ) = ${plan.sourceCas.submissionCount}
    `;
    if (updated !== 1) invariant("sourceCampaign.CAS", "promotion alias/count CAS matched zero rows");

    await tx.assessmentCampaign.create({
      data: successorCreateData(plan, databaseJsonNull),
    });
    await tx.auditLog.create({ data: receiptData(plan, operator) });
    return {
      status: "applied" as const,
      successorCampaignId: SUCCESSOR_CAMPAIGN_ID,
    };
  }, PROMOTION_TRANSACTION_OPTIONS);
}
