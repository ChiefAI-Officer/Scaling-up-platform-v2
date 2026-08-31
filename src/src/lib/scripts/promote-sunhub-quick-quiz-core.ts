/**
 * Pure planning and validation for the SunHub mini-quiz successor operation.
 *
 * This module deliberately has no database dependency. The runner supplies a
 * freshly read snapshot and is responsible for using the plan's CAS values in
 * its transaction; keeping the invariant rules here makes dry-runs and
 * transaction-time revalidation use the same decision point.
 */

import { stableCanonicalJson } from "@/lib/assessments/assessment-email-delivery-intents";
import { loadSafeReportHtml } from "@/lib/assessments/report-html";

export const SOURCE_CAMPAIGN_ID = "cmsm0jlxo0002lvi3lvb8u2gy";
export const SOURCE_VERSION_ID = "cmsm0efu30005dlwfucrosxdm";
export const TARGET_VERSION_ID = "cmtd124fz000413xies2p6bh8";
export const LIVE_ALIAS = "sunhub-quick-quiz";
export const RETIRED_ALIAS = "sunhub-quick-quiz-retired-v1";
export const SUCCESSOR_CAMPAIGN_ID = "item7-sunhub-quick-quiz-v7-successor";
export const PROMOTION_MANIFEST_SCHEMA_VERSION = 1;
export const DRAIN_WINDOW_MS = 15 * 60 * 1_000;

export type PromotionMode = "dry-run" | "quiesce" | "apply";

export type PromotionArgs = {
  mode: PromotionMode;
  hasProductionAcknowledgement: boolean;
  expectedDatabaseHost?: string;
  expectedSourceUpdatedAt?: string;
  expectedSubmissionCount?: number;
};

type Json = unknown;

export type SourceCampaign = {
  id: string;
  templateId: string;
  versionId: string;
  language: string;
  alias: string;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
  accessMode: "INVITED" | "PUBLIC";
  deletedAt: Date | string | null;
  updatedAt: Date | string;
  submissionCount: number;
  name: string;
  description: string | null;
  publicConfig: Json;
  invitedWelcomeSnapshot: Json;
  openAt: Date | string;
  endMode: string;
  closeAt: Date | string | null;
  notifyAdminOnSubmit: boolean;
  invitationSubject: string | null;
  invitationBodyMarkdown: string | null;
  sendResultsToRespondent: boolean;
  notifyCoachOnCompletion: boolean;
  showResultsOnScreen: boolean;
  reportStyle: string;
  reportStyleSource: string;
  reportStyleLockedAt: Date | string | null;
  invitationBodyHtml: string | null;
  customSlides: Json;
  createdBy: string;
  createdByCoachId: string | null;
};

export type TemplateSnapshot = {
  id: string;
  alias: string;
  deletedAt: Date | string | null;
  disabledAt: Date | string | null;
  deliveryType: "PUBLIC_MARKETING_QUIZ" | "INVITED_ASSESSMENT";
};

export type TemplateVersionSnapshot = {
  id: string;
  templateId: string;
  language: string;
  publishedAt: Date | string | null;
  questions: Json;
  sections: Json;
  scoringConfig: Json;
  reportConfig: Json;
};

export type PromotionExpectedCas = {
  sourceUpdatedAt: string;
  submissionCount: number;
};

export type PromotionInput = {
  args: PromotionArgs;
  sourceCampaign: SourceCampaign;
  template: TemplateSnapshot;
  sourceVersion: TemplateVersionSnapshot;
  targetVersion: TemplateVersionSnapshot;
  latestPublishedVersionId: string | null;
  retiredAliasOccupied: boolean;
  expected: PromotionExpectedCas;
  /** Injected clock for the drain check; defaults to the current time. */
  now?: Date | string;
};

export type SuccessorCampaignFields = Omit<
  SourceCampaign,
  | "id"
  | "versionId"
  | "alias"
  | "status"
  | "deletedAt"
  | "updatedAt"
  | "submissionCount"
  | "invitedWelcomeSnapshot"
  | "invitationSubject"
  | "invitationBodyMarkdown"
  | "invitationBodyHtml"
> & {
  id: string;
  versionId: string;
  alias: string;
  status: "ACTIVE";
};

export type PromotionManifest = {
  schemaVersion: typeof PROMOTION_MANIFEST_SCHEMA_VERSION;
  operation: "sunhub-quick-quiz-successor-promotion";
  mode: PromotionMode;
  source: { campaignId: string; templateId: string; versionId: string; alias: string };
  target: { versionId: string; templateId: string; language: string };
  successor: { id: string; alias: string; versionId: string; templateId: string };
  expected: PromotionExpectedCas;
  audit: {
    action:
      | "PUBLIC_CAMPAIGN_SUCCESSOR_DRY_RUN"
      | "PUBLIC_CAMPAIGN_SUCCESSOR_QUIESCE"
      | "PUBLIC_CAMPAIGN_SUCCESSOR_PROMOTION";
    payload: Record<string, unknown>;
  };
};

export type PromotionPlan = {
  mode: PromotionMode;
  sourceCas: {
    id: string;
    versionId: string;
    alias: string;
    status: "ACTIVE" | "CLOSED";
    deletedAt: null;
    updatedAt: string;
    submissionCount: number;
  };
  successor: SuccessorCampaignFields;
  manifest: PromotionManifest;
};

/** A guard failure whose field identifies the exact stale or unsafe fact. */
export class PromotionInvariantError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(`Promotion invariant failed for ${field}: ${message}`);
    this.name = "PromotionInvariantError";
    this.field = field;
  }
}

function fail(field: string, message: string): never {
  throw new PromotionInvariantError(field, message);
}

function parseIso(value: Date | string, field: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) fail(field, "must be a valid ISO timestamp");
  return date.toISOString();
}

/** Accept only the canonical ISO representation used by compare-and-swap. */
function parseCanonicalIso(value: string, field: string): string {
  const parsed = parseIso(value, field);
  if (parsed !== value) fail(field, "must be a canonical ISO timestamp");
  return parsed;
}

function readFlagValue(argv: string[], flag: string): string | undefined {
  const positions = argv.reduce<number[]>((result, value, index) => {
    if (value === flag) result.push(index);
    return result;
  }, []);
  if (positions.length > 1) fail(flag.slice(2), "must be specified at most once");
  if (positions.length === 0) return undefined;
  const value = argv[positions[0] + 1];
  if (!value || value.startsWith("--")) fail(flag.slice(2), "requires a value");
  return value;
}

function requireWriteValue(value: string | undefined, field: string): string {
  if (!value) fail(field, "is required for --quiesce and --apply");
  return value;
}

/** Parse command arguments without connecting to a database. */
export function parsePromotionArgs(argv: string[]): PromotionArgs {
  const flagsWithValues = new Set([
    "--expect-database-host",
    "--expect-source-updated-at",
    "--expect-submissions",
  ]);
  const allowedFlags = new Set([
    "--dry-run",
    "--quiesce",
    "--apply",
    "--i-know-this-is-prod",
    ...flagsWithValues,
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value.startsWith("--")) {
      if (!allowedFlags.has(value)) fail("argv", `unknown argument ${value}`);
      if (flagsWithValues.has(value)) index += 1;
    } else if (index === 0 || !flagsWithValues.has(argv[index - 1])) {
      fail("argv", `unexpected argument ${value}`);
    }
  }

  const modes = (["--dry-run", "--quiesce", "--apply"] as const).filter((flag) => argv.includes(flag));
  const modeFlagCount = argv.filter((value) => modes.includes(value as typeof modes[number])).length;
  if (modeFlagCount > 1) fail("mode", "--dry-run, --quiesce, and --apply are mutually exclusive");
  const mode: PromotionMode = modes[0] === "--quiesce" ? "quiesce" : modes[0] === "--apply" ? "apply" : "dry-run";

  const expectedDatabaseHost = readFlagValue(argv, "--expect-database-host");
  const expectedSourceUpdatedAt = readFlagValue(argv, "--expect-source-updated-at");
  const expectedSubmissions = readFlagValue(argv, "--expect-submissions");

  if (mode === "dry-run") {
    return {
      mode,
      hasProductionAcknowledgement: argv.includes("--i-know-this-is-prod"),
      ...(expectedDatabaseHost ? { expectedDatabaseHost } : {}),
      ...(expectedSourceUpdatedAt ? { expectedSourceUpdatedAt: parseCanonicalIso(expectedSourceUpdatedAt, "expect-source-updated-at") } : {}),
      ...(expectedSubmissions ? { expectedSubmissionCount: parseSubmissionCount(expectedSubmissions) } : {}),
    };
  }

  return {
    mode,
    hasProductionAcknowledgement: argv.includes("--i-know-this-is-prod"),
    expectedDatabaseHost: requireWriteValue(expectedDatabaseHost, "expect-database-host"),
    expectedSourceUpdatedAt: parseCanonicalIso(
      requireWriteValue(expectedSourceUpdatedAt, "expect-source-updated-at"),
      "expect-source-updated-at",
    ),
    expectedSubmissionCount: parseSubmissionCount(
      requireWriteValue(expectedSubmissions, "expect-submissions"),
    ),
  };
}

function parseSubmissionCount(value: string): number {
  if (!/^(0|[1-9]\d*)$/.test(value)) fail("expect-submissions", "must be a non-negative integer");
  const count = Number(value);
  if (!Number.isSafeInteger(count)) fail("expect-submissions", "must be a safe integer");
  return count;
}

/** Guard the write-only credentials independently from the database provider. */
export function validateWriteAuthorization(args: PromotionArgs, actualDatabaseHost: string): void {
  if (args.mode === "dry-run") return;
  if (!args.hasProductionAcknowledgement) {
    fail("i-know-this-is-prod", "is required for every write");
  }
  const expectedHost = requireWriteValue(args.expectedDatabaseHost, "expect-database-host");
  if (actualDatabaseHost !== expectedHost) {
    fail("expect-database-host", "does not exactly match the connected database host");
  }
}

function canonicalEqual(left: unknown, right: unknown, field: string): boolean {
  try {
    return stableCanonicalJson(left) === stableCanonicalJson(right);
  } catch {
    fail(field, "must be JSON-compatible stored content");
  }
}

function requiredSafeReportFragment(
  reportConfig: unknown,
  field: "introductionHtml" | "conclusionHtml",
): void {
  const raw =
    typeof reportConfig === "object" && reportConfig !== null && !Array.isArray(reportConfig)
      ? (reportConfig as { reportHtml?: { [key: string]: unknown } }).reportHtml?.[field]
      : undefined;
  const safe = loadSafeReportHtml(reportConfig, { onDrift: () => undefined })[field];
  if (typeof raw !== "string" || raw.trim() === "" || safe === null || safe !== raw) {
    fail(`targetVersion.reportConfig.reportHtml.${field}`, "must contain canonical safe report HTML");
  }
}

function expectedStatus(mode: PromotionMode, status: SourceCampaign["status"]): "ACTIVE" | "CLOSED" {
  if (mode === "quiesce" && status !== "ACTIVE") {
    fail("sourceCampaign.status", "must be ACTIVE before quiescence");
  }
  if (mode === "apply" && status !== "CLOSED") {
    fail("sourceCampaign.status", "must be CLOSED before apply");
  }
  if (mode === "dry-run" && status !== "ACTIVE" && status !== "CLOSED") {
    fail("sourceCampaign.status", "must be ACTIVE or CLOSED");
  }
  return status as "ACTIVE" | "CLOSED";
}

function auditAction(mode: PromotionMode): PromotionManifest["audit"]["action"] {
  if (mode === "quiesce") return "PUBLIC_CAMPAIGN_SUCCESSOR_QUIESCE";
  if (mode === "apply") return "PUBLIC_CAMPAIGN_SUCCESSOR_PROMOTION";
  return "PUBLIC_CAMPAIGN_SUCCESSOR_DRY_RUN";
}

/**
 * Validate the supplied snapshot and construct the deterministic, auditable
 * successor plan. It never reads or writes external state.
 */
export function buildPromotionPlan(input: PromotionInput): PromotionPlan {
  const { args, sourceCampaign, sourceVersion, targetVersion, template, expected } = input;
  const sourceUpdatedAt = parseIso(sourceCampaign.updatedAt, "sourceCampaign.updatedAt");
  const expectedUpdatedAt = parseCanonicalIso(expected.sourceUpdatedAt, "expected.sourceUpdatedAt");
  const sourceStatus = expectedStatus(args.mode, sourceCampaign.status);

  if (sourceCampaign.id !== SOURCE_CAMPAIGN_ID) fail("sourceCampaign.id", "does not match the compiled source campaign");
  if (sourceCampaign.versionId !== SOURCE_VERSION_ID) fail("sourceCampaign.versionId", "does not match the compiled source version");
  if (sourceCampaign.alias !== LIVE_ALIAS) fail("sourceCampaign.alias", "does not match the compiled live alias");
  if (sourceCampaign.deletedAt !== null) fail("sourceCampaign.deletedAt", "must be null");
  if (sourceCampaign.accessMode !== "PUBLIC") fail("sourceCampaign.accessMode", "must be PUBLIC");
  if (sourceCampaign.templateId !== template.id) fail("sourceCampaign.templateId", "must match template.id");
  if (sourceVersion.id !== SOURCE_VERSION_ID) fail("sourceVersion.id", "does not match the compiled source version");
  if (targetVersion.id !== TARGET_VERSION_ID) fail("targetVersion.id", "does not match the compiled target version");
  if (sourceVersion.templateId !== template.id) fail("sourceVersion.templateId", "must match template.id");
  if (targetVersion.templateId !== template.id) fail("targetVersion.templateId", "must match template.id");
  if (sourceVersion.language !== sourceCampaign.language) fail("sourceVersion.language", "must match source campaign language");
  if (targetVersion.language !== sourceCampaign.language) fail("targetVersion.language", "must match source campaign language");
  if (template.deletedAt !== null) fail("template.deletedAt", "must be null");
  if (template.disabledAt !== null) fail("template.disabledAt", "must be null");
  if (template.deliveryType !== "PUBLIC_MARKETING_QUIZ") fail("template.deliveryType", "must be PUBLIC_MARKETING_QUIZ");
  if (input.retiredAliasOccupied) fail("retiredAlias", `${RETIRED_ALIAS} is already occupied`);
  if (targetVersion.publishedAt === null) fail("targetVersion.publishedAt", "must be published");
  if (input.latestPublishedVersionId !== TARGET_VERSION_ID) fail("latestPublishedVersionId", "must identify the compiled target version");
  if (!canonicalEqual(sourceVersion.questions, targetVersion.questions, "targetVersion.questions")) fail("targetVersion.questions", "must canonically match sourceVersion.questions");
  if (!canonicalEqual(sourceVersion.sections, targetVersion.sections, "targetVersion.sections")) fail("targetVersion.sections", "must canonically match sourceVersion.sections");
  if (!canonicalEqual(sourceVersion.scoringConfig, targetVersion.scoringConfig, "targetVersion.scoringConfig")) fail("targetVersion.scoringConfig", "must canonically match sourceVersion.scoringConfig");
  requiredSafeReportFragment(targetVersion.reportConfig, "introductionHtml");
  requiredSafeReportFragment(targetVersion.reportConfig, "conclusionHtml");
  if (sourceUpdatedAt !== expectedUpdatedAt) fail("sourceCampaign.updatedAt", "does not match the expected CAS timestamp");
  if (sourceCampaign.submissionCount !== expected.submissionCount) fail("sourceCampaign.submissionCount", "does not match the expected CAS count");
  if (!Number.isSafeInteger(expected.submissionCount) || expected.submissionCount < 0) fail("expected.submissionCount", "must be a non-negative safe integer");
  if (args.mode !== "dry-run") {
    if (args.expectedSourceUpdatedAt !== expectedUpdatedAt) fail("expect-source-updated-at", "does not match the plan CAS timestamp");
    if (args.expectedSubmissionCount !== expected.submissionCount) fail("expect-submissions", "does not match the plan CAS count");
  }

  if (args.mode === "apply") {
    const now = parseIso(input.now ?? new Date(), "now");
    if (new Date(now).getTime() - new Date(sourceUpdatedAt).getTime() < DRAIN_WINDOW_MS) {
      fail("sourceCampaign.updatedAt", "must have remained CLOSED for at least 15 minutes before apply");
    }
  }

  const successor: SuccessorCampaignFields = {
    id: SUCCESSOR_CAMPAIGN_ID,
    templateId: sourceCampaign.templateId,
    versionId: TARGET_VERSION_ID,
    language: sourceCampaign.language,
    alias: LIVE_ALIAS,
    name: sourceCampaign.name,
    description: sourceCampaign.description,
    status: "ACTIVE",
    accessMode: sourceCampaign.accessMode,
    publicConfig: sourceCampaign.publicConfig,
    openAt: sourceCampaign.openAt,
    endMode: sourceCampaign.endMode,
    closeAt: sourceCampaign.closeAt,
    notifyAdminOnSubmit: sourceCampaign.notifyAdminOnSubmit,
    sendResultsToRespondent: sourceCampaign.sendResultsToRespondent,
    notifyCoachOnCompletion: sourceCampaign.notifyCoachOnCompletion,
    showResultsOnScreen: sourceCampaign.showResultsOnScreen,
    reportStyle: sourceCampaign.reportStyle,
    reportStyleSource: sourceCampaign.reportStyleSource,
    reportStyleLockedAt: sourceCampaign.reportStyleLockedAt,
    customSlides: sourceCampaign.customSlides,
    createdBy: sourceCampaign.createdBy,
    createdByCoachId: sourceCampaign.createdByCoachId,
  };

  const sourceCas = {
    id: SOURCE_CAMPAIGN_ID,
    versionId: SOURCE_VERSION_ID,
    alias: LIVE_ALIAS,
    status: sourceStatus,
    deletedAt: null,
    updatedAt: sourceUpdatedAt,
    submissionCount: expected.submissionCount,
  } as const;
  const action = auditAction(args.mode);
  const manifest: PromotionManifest = {
    schemaVersion: PROMOTION_MANIFEST_SCHEMA_VERSION,
    operation: "sunhub-quick-quiz-successor-promotion",
    mode: args.mode,
    source: { campaignId: SOURCE_CAMPAIGN_ID, templateId: template.id, versionId: SOURCE_VERSION_ID, alias: LIVE_ALIAS },
    target: { versionId: TARGET_VERSION_ID, templateId: template.id, language: sourceCampaign.language },
    successor: { id: SUCCESSOR_CAMPAIGN_ID, alias: LIVE_ALIAS, versionId: TARGET_VERSION_ID, templateId: template.id },
    expected: { sourceUpdatedAt: expectedUpdatedAt, submissionCount: expected.submissionCount },
    audit: {
      action,
      payload: {
        schemaVersion: PROMOTION_MANIFEST_SCHEMA_VERSION,
        source: sourceCas,
        targetVersionId: TARGET_VERSION_ID,
        successor,
        retiredAlias: RETIRED_ALIAS,
      },
    },
  };

  return { mode: args.mode, sourceCas, successor, manifest };
}
