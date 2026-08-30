import type { ApiActor } from "@/lib/auth/access-control";
import { asAccessDb, canManageCampaign } from "@/lib/assessments/access-control";
import { buildQuestionMetaByKey } from "@/lib/assessments/question-meta";
import {
  buildReportComparisonModel,
  type ComparisonQuestionMeta,
  type ComparisonSnapshot,
  type ReportComparisonCandidate,
  type ReportComparisonModel,
} from "@/lib/assessments/report-comparison-model";
import { isScoreResult } from "@/lib/assessments/respondent-report";
import {
  REPORT_COMPARISON_ALIAS,
  isReportComparisonEnabled,
  isReportComparisonRolloutActive,
} from "@/lib/assessments/wave-report-comparison-flags";
import { emitReportComparisonMetric } from "@/lib/assessments/report-comparison-metrics";
import {
  revalidateCeoReportAccessInTransaction,
  type CeoReportAccessTransaction,
} from "@/lib/assessments/ceo-report-access";

export const MAX_REPORT_COMPARISON_IDENTITIES = 50;
export const MAX_REPORT_COMPARISON_INSPECTED = 200;
export const MAX_REPORT_COMPARISON_CANDIDATES = 12;

export type ReportComparisonViewer =
  | { kind: "operator"; actor: ApiActor }
  | {
      kind: "ceo-self";
      focusCampaignId: string;
      focusSubmissionId: string;
      respondentId: string;
      invitationId: string;
      expiresAt: number;
    };

export interface ReportComparisonFocus {
  campaignId: string;
  respondentId: string;
  submissionId: string;
}

export type CandidateOutcome =
  | { kind: "ok"; candidates: ReportComparisonCandidate[]; bounded: boolean }
  | { kind: "not-applicable" | "unavailable" };

export type ComparisonOutcome =
  | { kind: "ok"; model: ReportComparisonModel }
  | { kind: "invalid" };

interface ComparisonRespondent {
  id: string;
  organizationId: string;
  normalizedEmail: string | null;
  deletedAt: Date | null;
}

interface ComparisonCampaign {
  id: string;
  organizationId: string;
  templateId: string;
  name: string | null;
  openAt: Date;
  accessMode: "INVITED" | "PUBLIC";
  deletedAt: Date | null;
  importManifest: unknown;
  template: { alias: string };
  version: { id: string; versionNumber: number; questions: unknown };
}

interface ComparisonSubmission {
  id: string;
  campaignId: string;
  respondentId: string | null;
  submittedAt: Date;
  result: unknown;
  respondent: ComparisonRespondent | null;
  campaign: ComparisonCampaign;
}

interface SubmissionQuery {
  where: Record<string, unknown>;
  include?: Record<string, unknown>;
  orderBy?: unknown;
  take?: number;
}

export interface ReportComparisonDb extends CeoReportAccessTransaction {
  orgRespondent: {
    findMany: (args: {
      where: Record<string, unknown>;
      select?: Record<string, unknown>;
      take: number;
    }) => Promise<ComparisonRespondent[]>;
  };
  assessmentSubmission: {
    findFirst: (args: SubmissionQuery) => Promise<ComparisonSubmission | null>;
    findMany: (args: SubmissionQuery) => Promise<ComparisonSubmission[]>;
  };
  $transaction: <T>(
    callback: (tx: ReportComparisonDb) => Promise<T>,
    options?: { isolationLevel: "Serializable" },
  ) => Promise<T>;
}

const submissionInclude = {
  respondent: true,
  campaign: { include: { template: true, version: true } },
} as const;

function viewerMetric(viewer: ReportComparisonViewer): "COACH" | "ADMIN" | "STAFF" | "CEO_SELF" | "UNKNOWN" {
  if (viewer.kind === "ceo-self") return "CEO_SELF";
  if (viewer.actor.role === "COACH") return "COACH";
  if (viewer.actor.role === "ADMIN") return "ADMIN";
  if (viewer.actor.role === "STAFF") return "STAFF";
  return "UNKNOWN";
}

function isLiveSameScope(submission: ComparisonSubmission, focus: ComparisonSubmission): boolean {
  return submission.respondent !== null &&
    submission.respondent.deletedAt === null &&
    submission.campaign.deletedAt === null &&
    submission.campaign.accessMode === "INVITED" &&
    submission.campaign.organizationId === focus.campaign.organizationId &&
    submission.respondent.organizationId === focus.campaign.organizationId &&
    submission.campaign.templateId === focus.campaign.templateId &&
    submission.campaign.template.alias === REPORT_COMPARISON_ALIAS &&
    isScoreResult(submission.result);
}

function isApplicableFocus(
  submission: ComparisonSubmission | null,
  focus: ReportComparisonFocus,
  requireWaveRcEligibility: boolean,
): submission is ComparisonSubmission {
  return submission !== null &&
    submission.id === focus.submissionId &&
    submission.campaignId === focus.campaignId &&
    submission.respondentId === focus.respondentId &&
    submission.respondent !== null &&
    submission.respondent.id === focus.respondentId &&
    submission.respondent.organizationId === submission.campaign.organizationId &&
    submission.respondent.deletedAt === null &&
    submission.campaign.deletedAt === null &&
    submission.campaign.accessMode === "INVITED" &&
    submission.campaign.template.alias === REPORT_COMPARISON_ALIAS &&
    isScoreResult(submission.result) &&
    (!requireWaveRcEligibility || isReportComparisonEnabled({
      organizationId: submission.campaign.organizationId,
      templateId: submission.campaign.templateId,
    }));
}

function compareNewest(left: ComparisonSubmission, right: ComparisonSubmission): number {
  return right.submittedAt.getTime() - left.submittedAt.getTime() ||
    right.campaign.openAt.getTime() - left.campaign.openAt.getTime() ||
    descendingString(left.campaignId, right.campaignId) ||
    descendingString(left.id, right.id);
}

function descendingString(left: string, right: string): number {
  return left === right ? 0 : left > right ? -1 : 1;
}

async function loadFocus(db: ReportComparisonDb, focus: ReportComparisonFocus): Promise<ComparisonSubmission | null> {
  return db.assessmentSubmission.findFirst({
    where: { id: focus.submissionId },
    include: submissionInclude,
  });
}

async function identityIds(
  db: ReportComparisonDb,
  focus: ComparisonSubmission,
): Promise<{ ids: string[]; bounded: boolean }> {
  const respondent = focus.respondent;
  if (!respondent) return { ids: [], bounded: false };
  const normalizedEmail = respondent.normalizedEmail?.trim();
  if (!normalizedEmail) return { ids: [respondent.id], bounded: false };

  const rows = await db.orgRespondent.findMany({
    where: {
      organizationId: focus.campaign.organizationId,
      normalizedEmail,
      deletedAt: null,
    },
    select: { id: true, organizationId: true, normalizedEmail: true, deletedAt: true },
    take: MAX_REPORT_COMPARISON_IDENTITIES,
  });
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.organizationId === focus.campaign.organizationId && row.deletedAt === null && row.normalizedEmail === normalizedEmail) {
      ids.add(row.id);
    }
  }
  // The query is bounded at 50, but retain the exact focus identity even if a
  // broad same-email set causes the database ordering to omit it.
  const others = [...ids].filter((id) => id !== respondent.id).sort();
  return {
    ids: [respondent.id, ...others]
      .slice(0, MAX_REPORT_COMPARISON_IDENTITIES)
      .sort(),
    bounded: rows.length >= MAX_REPORT_COMPARISON_IDENTITIES,
  };
}

function candidateFor(submission: ComparisonSubmission): ReportComparisonCandidate {
  return {
    submissionId: submission.id,
    campaignId: submission.campaignId,
    campaignLabel: submission.campaign.name?.trim() || null,
    submittedAt: submission.submittedAt,
    versionId: submission.campaign.version.id,
    versionNumber: submission.campaign.version.versionNumber,
    isImported: submission.campaign.importManifest !== null,
  };
}

function isEarlierSamePerson(candidate: ComparisonSubmission, focus: ComparisonSubmission, ids: Set<string>): boolean {
  return candidate.id !== focus.id &&
    candidate.campaignId !== focus.campaignId &&
    candidate.respondentId !== null &&
    ids.has(candidate.respondentId) &&
    candidate.submittedAt.getTime() < focus.submittedAt.getTime() &&
    isLiveSameScope(candidate, focus);
}

async function operatorCanRead(db: ReportComparisonDb, viewer: ReportComparisonViewer, campaignId: string): Promise<boolean> {
  return viewer.kind !== "operator" || canManageCampaign(asAccessDb(db), viewer.actor, campaignId, "read");
}

function ceoFocusMatches(viewer: ReportComparisonViewer, focus: ReportComparisonFocus): boolean {
  return viewer.kind !== "ceo-self" ||
    (viewer.focusCampaignId === focus.campaignId &&
      viewer.focusSubmissionId === focus.submissionId &&
      viewer.respondentId === focus.respondentId);
}

async function liveCeoGrantMatchesFocus(
  db: CeoReportAccessTransaction,
  viewer: ReportComparisonViewer,
  focus: ReportComparisonFocus,
): Promise<boolean> {
  if (viewer.kind !== "ceo-self") return true;
  const liveGrant = await revalidateCeoReportAccessInTransaction(db, {
    version: 1,
    purpose: "assessment-report-comparison-self",
    focusCampaignId: viewer.focusCampaignId,
    invitationId: viewer.invitationId,
    respondentId: viewer.respondentId,
    expiresAt: viewer.expiresAt,
  });
  return liveGrant !== null &&
    liveGrant.focusCampaignId === focus.campaignId &&
    liveGrant.focusSubmissionId === focus.submissionId &&
    liveGrant.respondentId === focus.respondentId;
}

async function discoverReportComparisonCandidates(
  db: ReportComparisonDb,
  viewer: ReportComparisonViewer,
  focus: ReportComparisonFocus,
  requireWaveRcEligibility = true,
): Promise<CandidateOutcome> {
  if (!await liveCeoGrantMatchesFocus(db, viewer, focus)) {
    return { kind: "unavailable" };
  }
  const focusSubmission = await loadFocus(db, focus);
  if (!isApplicableFocus(focusSubmission, focus, requireWaveRcEligibility) || !ceoFocusMatches(viewer, focus)) {
    return { kind: "not-applicable" };
  }
  if (!await operatorCanRead(db, viewer, focus.campaignId)) {
    return { kind: "unavailable" };
  }
  const identity = await identityIds(db, focusSubmission);
  const ids = identity.ids;
  const rows = await db.assessmentSubmission.findMany({
    where: {
      campaignId: { not: focusSubmission.campaignId },
      submittedAt: { lt: focusSubmission.submittedAt },
      respondentId: { in: ids },
      campaign: {
        organizationId: focusSubmission.campaign.organizationId,
        templateId: focusSubmission.campaign.templateId,
        accessMode: "INVITED",
        deletedAt: null,
      },
    },
    include: submissionInclude,
    orderBy: [
      { submittedAt: "desc" },
      { campaign: { openAt: "desc" } },
      { campaignId: "desc" },
      { id: "desc" },
    ],
    take: MAX_REPORT_COMPARISON_INSPECTED,
  });
  const winners = new Map<string, ComparisonSubmission>();
  for (const row of [...rows].sort(compareNewest)) {
    if (isEarlierSamePerson(row, focusSubmission, new Set(ids)) && !winners.has(row.campaignId)) {
      winners.set(row.campaignId, row);
    }
  }
  const authorized: ComparisonSubmission[] = [];
  for (const row of winners.values()) {
    if (await operatorCanRead(db, viewer, row.campaignId)) authorized.push(row);
  }
  const bounded =
    identity.bounded ||
    rows.length >= MAX_REPORT_COMPARISON_INSPECTED ||
    authorized.length > MAX_REPORT_COMPARISON_CANDIDATES;
  return {
    kind: "ok",
    candidates: authorized.slice(0, MAX_REPORT_COMPARISON_CANDIDATES).map(candidateFor),
    bounded,
  };
}

/** Lists presentation-safe candidates only; it never grants access to a report. */
export async function listReportComparisonCandidates(
  db: ReportComparisonDb,
  viewer: ReportComparisonViewer,
  focus: ReportComparisonFocus,
): Promise<CandidateOutcome> {
  if (!isReportComparisonRolloutActive()) return { kind: "not-applicable" };
  const startedAt = Date.now();
  try {
    const outcome = viewer.kind === "ceo-self"
      ? await db.$transaction(
        (tx) => discoverReportComparisonCandidates(tx, viewer, focus),
        { isolationLevel: "Serializable" },
      )
      : await discoverReportComparisonCandidates(db, viewer, focus);
    if (outcome.kind === "ok") {
      emitReportComparisonMetric(outcome.candidates.length ? "candidate_ok" : "candidate_empty", {
        viewer: viewerMetric(viewer),
        count: outcome.candidates.length,
        bounded: outcome.bounded,
        latencyMs: Date.now() - startedAt,
      });
    }
    return outcome;
  } catch {
    emitReportComparisonMetric("candidate_failed", { viewer: viewerMetric(viewer), reason: "error", latencyMs: Date.now() - startedAt });
    return { kind: "unavailable" };
  }
}

/**
 * Summary Reporting owns rollout for this adapter. It skips only Wave RC's
 * rollout predicates; all identity, chronology, liveness, and access checks
 * remain in the shared discovery path.
 */
export async function listSummarySelfComparisonCandidates(
  db: ReportComparisonDb,
  viewer: Extract<ReportComparisonViewer, { kind: "operator" }>,
  focus: ReportComparisonFocus,
): Promise<CandidateOutcome> {
  try {
    return await discoverReportComparisonCandidates(db, viewer, focus, false);
  } catch {
    return { kind: "unavailable" };
  }
}

function snapshot(submission: ComparisonSubmission): ComparisonSnapshot {
  const rawMeta = buildQuestionMetaByKey(submission.campaign.version.questions);
  const questionMetaByKey: Record<string, ComparisonQuestionMeta> = Object.create(null);
  for (const [key, meta] of Object.entries(rawMeta)) {
    questionMetaByKey[key] = {
      type: meta.type ?? null,
      min: Number.isFinite(meta.min) ? meta.min! : null,
      max: Number.isFinite(meta.max) ? meta.max! : null,
    };
  }
  return { ...candidateFor(submission), result: submission.result, questionMetaByKey };
}

const SUMMARY_SELF_COMPARISON_QUESTION_KEYS = Array.from(
  { length: 61 },
  (_, index) => `Q${String(index + 1).padStart(2, "0")}`,
);

function isStrictSummarySnapshot(value: ComparisonSnapshot): boolean {
  const keys = Object.keys(value.questionMetaByKey);
  return keys.length === SUMMARY_SELF_COMPARISON_QUESTION_KEYS.length
    && SUMMARY_SELF_COMPARISON_QUESTION_KEYS.every((key) => {
      const meta = value.questionMetaByKey[key];
      return meta?.type === "SLIDER_LIKERT" && meta.min === 0 && meta.max === 10;
    });
}

/** Rechecks authorization and every live eligibility fact atomically with the baseline read. */
export async function loadReportComparison(
  db: ReportComparisonDb,
  viewer: ReportComparisonViewer,
  focus: ReportComparisonFocus,
  baselineSubmissionId: string,
): Promise<ComparisonOutcome> {
  if (!isReportComparisonRolloutActive()) return { kind: "invalid" };
  return loadReportComparisonWithPolicy(db, viewer, focus, baselineSubmissionId, true);
}

async function loadReportComparisonWithPolicy(
  db: ReportComparisonDb,
  viewer: ReportComparisonViewer,
  focus: ReportComparisonFocus,
  baselineSubmissionId: string,
  requireWaveRcEligibility: boolean,
): Promise<ComparisonOutcome> {
  const startedAt = Date.now();
  try {
    const outcome = await db.$transaction(async (tx) => {
      if (!await liveCeoGrantMatchesFocus(tx, viewer, focus)) {
        return { kind: "invalid" } as const;
      }
      const [focusSubmission, baseline] = await Promise.all([
        loadFocus(tx, focus),
        tx.assessmentSubmission.findFirst({ where: { id: baselineSubmissionId }, include: submissionInclude }),
      ]);
      if (!isApplicableFocus(focusSubmission, focus, requireWaveRcEligibility) || !baseline || !ceoFocusMatches(viewer, focus)) return { kind: "invalid" } as const;
      if (viewer.kind === "operator") {
        const [focusAllowed, baselineAllowed] = await Promise.all([
          operatorCanRead(tx, viewer, focus.campaignId),
          operatorCanRead(tx, viewer, baseline.campaignId),
        ]);
        if (!focusAllowed || !baselineAllowed) return { kind: "invalid" } as const;
      }
      const ids = new Set((await identityIds(tx, focusSubmission)).ids);
      if (!isEarlierSamePerson(baseline, focusSubmission, ids)) return { kind: "invalid" } as const;
      const focusSnapshot = snapshot(focusSubmission);
      const baselineSnapshot = snapshot(baseline);
      if (!requireWaveRcEligibility && (!isStrictSummarySnapshot(focusSnapshot) || !isStrictSummarySnapshot(baselineSnapshot))) {
        return { kind: "invalid" } as const;
      }
      return { kind: "ok", model: buildReportComparisonModel({ focus: focusSnapshot, baseline: baselineSnapshot }) } as const;
    }, { isolationLevel: "Serializable" });
    if (outcome.kind === "ok") {
      emitReportComparisonMetric("comparison_ok", {
        viewer: viewerMetric(viewer), sameVersion: outcome.model.sameVersion,
        matchedQuestions: outcome.model.coverage.matchedQuestionCount,
        unmatchedQuestions: outcome.model.coverage.unmatchedCurrentCount,
        latencyMs: Date.now() - startedAt,
      });
    } else {
      emitReportComparisonMetric("comparison_invalid", { viewer: viewerMetric(viewer), reason: "incompatible", latencyMs: Date.now() - startedAt });
    }
    return outcome;
  } catch {
    emitReportComparisonMetric("comparison_invalid", { viewer: viewerMetric(viewer), reason: "error", latencyMs: Date.now() - startedAt });
    return { kind: "invalid" };
  }
}

/** Summary-owned counterpart to loadReportComparison; operator-only by design. */
export async function loadSummarySelfComparison(
  db: ReportComparisonDb,
  viewer: Extract<ReportComparisonViewer, { kind: "operator" }>,
  focus: ReportComparisonFocus,
  earlierSubmissionId: string,
): Promise<ComparisonOutcome> {
  return loadReportComparisonWithPolicy(db, viewer, focus, earlierSubmissionId, false);
}

/** Bridge a Prisma client or transaction to the intentionally narrow service DB. */
export function asReportComparisonDb(prisma: unknown): ReportComparisonDb {
  return prisma as ReportComparisonDb;
}
