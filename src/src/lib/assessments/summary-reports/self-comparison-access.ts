import type { ApiActor } from "@/lib/auth/access-control";
import { asAccessDb, canViewGroupReport } from "@/lib/assessments/access-control";
import {
  asReportComparisonDb,
  listSummarySelfComparisonCandidates,
  loadSummarySelfComparison,
  type ReportComparisonFocus,
} from "@/lib/assessments/report-comparison";
import type { ReportComparisonCandidate, ReportComparisonModel } from "@/lib/assessments/report-comparison-model";
import { resolveSummaryReportingCapability } from "@/lib/assessments/summary-reports/capability";
import { isSuFullSelfComparisonShapeCompatible } from "@/lib/assessments/su-full-self-comparison";

interface AccessCampaign {
  id: string;
  name: string;
  accessMode: string;
  template: { alias: string | null; name: string } | null;
  version: { publishedAt: Date | null } | null;
}

interface FocusSubmission {
  id: string;
  campaignId: string;
  respondentId: string | null;
  submittedAt: Date;
}

interface SelfComparisonAccessDb {
  assessmentCampaign: { findFirst(args: object): Promise<AccessCampaign | null> };
  assessmentSubmission: { findFirst(args: object): Promise<FocusSubmission | null> };
  assessmentCampaignParticipant: { findFirst(args: object): Promise<{ id: string } | null> };
}

export type SelfComparisonFocus = ReportComparisonFocus & Readonly<{ submittedAt: Date }>;
export type SelfComparisonCandidateAccessOutcome =
  | Readonly<{ kind: "ok"; focus: SelfComparisonFocus; candidates: readonly ReportComparisonCandidate[]; bounded: boolean }>
  | Readonly<{ kind: "not-found" | "unavailable" }>;
export type SelfComparisonLoadAccessOutcome =
  | Readonly<{ kind: "ok"; focus: SelfComparisonFocus; comparison: ReportComparisonModel }>
  | Readonly<{ kind: "not-found" }>;

export async function authorizeSelfComparisonFocus(
  rawDb: unknown,
  actor: ApiActor,
  input: { destinationCampaignId: string; focusSubmissionId: string },
): Promise<SelfComparisonFocus | null> {
  if (actor.role !== "COACH" || !actor.coachId) return null;
  const db = rawDb as SelfComparisonAccessDb;
  const campaign = await db.assessmentCampaign.findFirst({
    where: { id: input.destinationCampaignId, deletedAt: null },
    select: {
      id: true, name: true, accessMode: true,
      template: { select: { alias: true, name: true } },
      version: { select: { publishedAt: true } },
    },
  });
  const capability = resolveSummaryReportingCapability(
    process.env,
    campaign,
    campaign?.name ?? "",
    campaign?.template?.name ?? "",
  );
  if (!capability?.implementedTypes.some((entry) => entry.type === "SCALING_SELF_COMPARISON")) return null;
  if (!await canViewGroupReport(asAccessDb(rawDb), actor, input.destinationCampaignId)) return null;

  const submission = await db.assessmentSubmission.findFirst({
    where: {
      id: input.focusSubmissionId,
      campaignId: input.destinationCampaignId,
      submittedAt: { not: null },
      respondentId: { not: null },
      invitation: { revokedAt: null, status: "SUBMITTED" },
    },
    select: { id: true, campaignId: true, respondentId: true, submittedAt: true },
  });
  if (!submission?.respondentId) return null;
  const ceo = await db.assessmentCampaignParticipant.findFirst({
    where: {
      campaignId: input.destinationCampaignId,
      respondentId: submission.respondentId,
      isCEO: true,
    },
    select: { id: true },
  });
  return ceo ? {
    campaignId: input.destinationCampaignId,
    submissionId: submission.id,
    respondentId: submission.respondentId,
    submittedAt: submission.submittedAt,
  } : null;
}

export async function listAuthorizedSelfComparisonCandidates(
  rawDb: unknown,
  actor: ApiActor,
  input: { destinationCampaignId: string; focusSubmissionId: string },
): Promise<SelfComparisonCandidateAccessOutcome> {
  const focus = await authorizeSelfComparisonFocus(rawDb, actor, input);
  if (!focus) return { kind: "not-found" };
  const viewer = { kind: "operator" as const, actor };
  const comparisonDb = asReportComparisonDb(rawDb);
  const discovered = await listSummarySelfComparisonCandidates(comparisonDb, viewer, focus);
  if (discovered.kind === "unavailable") return { kind: "unavailable" };
  if (discovered.kind !== "ok") return { kind: "not-found" };
  return { kind: "ok", focus, candidates: discovered.candidates, bounded: discovered.bounded };
}

export async function loadAuthorizedSelfComparison(
  rawDb: unknown,
  actor: ApiActor,
  input: { destinationCampaignId: string; focusSubmissionId: string; earlierSubmissionId: string },
): Promise<SelfComparisonLoadAccessOutcome> {
  const focus = await authorizeSelfComparisonFocus(rawDb, actor, input);
  if (!focus) return { kind: "not-found" };
  const loaded = await loadSummarySelfComparison(
    asReportComparisonDb(rawDb),
    { kind: "operator", actor },
    focus,
    input.earlierSubmissionId,
  );
  return loaded.kind === "ok" && isSuFullSelfComparisonShapeCompatible(loaded.model)
    ? { kind: "ok", focus, comparison: loaded.model }
    : { kind: "not-found" };
}
