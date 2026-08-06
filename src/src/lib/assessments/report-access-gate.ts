/**
 * Report access gate — adapters + wiring (PR1).
 *
 * Pre-binds the per-surface policy for the pure `viewReport` core
 * (report-gate-core.ts) and owns the Next/Prisma-coupled wiring (getApiActor,
 * headers, the narrow-Db bridge cast, the loaders, the flags). The pages call an
 * adapter with only ids + `defaultReportGateDeps()`;
 * they never see `ReportDb`/casts or the rate-limit/audit protocol.
 *
 * The GROUP adapter now lives in `group-report-access-gate.ts` so its runtime
 * graph stays isolated from individual appearance dependencies. PR2 adds the
 * RESPONDENT adapter, which carries the
 * always-on surface's intentional fold-ins: fail-closed audit + IP/UA, the
 * strengthened rate-limit key, and structured `assessment.respondent_report.*`
 * metrics (retiring the ad-hoc console.info).
 */

import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { RateLimits } from "@/lib/rate-limit";
import {
  viewReport,
  type ReportGateDeps,
} from "@/lib/assessments/report-gate-core";
import {
  getRespondentReport,
  getCeoSelfRespondentReport,
  type RespondentReportOutcome,
} from "@/lib/assessments/respondent-report";
import type { CeoReportSessionPayload } from "@/lib/assessments/ceo-report-access-cookie";
import {
  getPublicReferralReport,
  type PublicReferralReportOutcome,
} from "@/lib/assessments/public-referrals";
import { reportConfigFor } from "@/lib/assessments/report-config";
import {
  REPORT_FILTERS,
  REPORT_FILTER_VERSION,
} from "@/lib/assessments/qualitative-report-model";
import { isReferredResultsEnabled } from "@/lib/assessments/wave-83-flags";
import { ipFromHeaders } from "@/lib/assessments/report-access-gate-deps";

export {
  defaultReportGateDeps,
  ipFromHeaders,
} from "@/lib/assessments/report-access-gate-deps";
export { viewGroupReport } from "@/lib/assessments/group-report-access-gate";

/**
 * Per-respondent Results report adapter (PR2). Requires a signed-in actor
 * (redirect-login). Strengthened rate-limit key — actor + campaign + respondent
 * + IP (the old route keyed on IP only; ADR-0012 fix #2). Audit = fail-closed
 * VIEW_REPORT (+ IP/UA). Returns { outcome, metricRole } so the page attributes
 * its page-owned `view` metric.
 */
export async function viewRespondentReport(
  deps: ReportGateDeps,
  args: { campaignId: string; respondentId: string },
): Promise<{ outcome: RespondentReportOutcome; metricRole: string | null }> {
  const actor = await getApiActor();
  const h = await headers();
  const ip = ipFromHeaders(h);
  const userAgent = h.get("user-agent");
  const actorKey = actor?.coachId ?? actor?.userId ?? "anon";
  const metricRole = actor?.role ?? null;
  const reportDb = db as unknown as Parameters<typeof getRespondentReport>[0];

  const outcome = await viewReport<RespondentReportOutcome>(deps, {
    surface: "respondent",
    actor,
    noActorPolicy: "redirect-login",
    flagGate: undefined,
    ip,
    userAgent,
    // fix #2: was IP-only `report:${ip}` — now actor+campaign+respondent+IP.
    rateLimitKey: `report:${actorKey}:${args.campaignId}:${args.respondentId}:${ip}`,
    rateLimitConfig: RateLimits.standard,
    // actor is non-null on the load path (redirect-login throws above for null).
    load: () => getRespondentReport(reportDb, actor!, args.campaignId, args.respondentId),
    classify: (o) => (o.status === "ok" ? "ok" : o.status === "forbidden" ? "forbidden" : "not-found"),
    auditOf: (o) => {
      if (o.status !== "ok") throw new Error("unreachable: auditOf on non-ok respondent outcome");
      return {
        entityType: "AssessmentSubmission",
        action: "VIEW_REPORT",
        entityId: o.report.provenance.submissionId,
        changes: {
          kind: "respondent-report",
          templateAlias: o.report.templateAlias ?? null,
          reportType: reportConfigFor(o.report.templateAlias).reportType,
          versionId: o.report.provenance.versionId,
          contentHash: o.report.provenance.contentHash,
          // R2-M4 — when the alias has a code-only report filter (REPORT_FILTERS),
          // record WHICH filter governed this view. The filter mutates the
          // rendered body WITHOUT bumping versionId/contentHash, so this id is
          // the audit link to the suppression/gating semantics. Counts are NOT
          // recorded here (they'd require recomputing the model at the loader) —
          // they live on the model's filterProvenance + the email outbox marker.
          ...(o.report.templateAlias && REPORT_FILTERS[o.report.templateAlias]
            ? { reportFilterId: REPORT_FILTER_VERSION }
            : {}),
        },
      };
    },
    metricRole,
  });

  return { outcome, metricRole };
}

/**
 * Exact-session CEO path. There is intentionally no actor: the sealed session
 * is the only capability and the loader revalidates it in the report-read tx.
 */
export async function viewCeoSelfRespondentReport(
  deps: ReportGateDeps,
  session: CeoReportSessionPayload,
): Promise<{ outcome: RespondentReportOutcome; metricRole: "CEO_SELF" }> {
  const h = await headers();
  const ip = ipFromHeaders(h);
  const userAgent = h.get("user-agent");
  const reportDb = db as unknown as Parameters<typeof getCeoSelfRespondentReport>[0];
  const outcome = await viewReport<RespondentReportOutcome>(deps, {
    surface: "respondent",
    actor: null,
    noActorPolicy: "tolerate",
    flagGate: undefined,
    ip,
    userAgent,
    rateLimitKey: `report:ceo-self:${session.focusCampaignId}:${session.respondentId}:${ip}`,
    rateLimitConfig: RateLimits.standard,
    load: () => getCeoSelfRespondentReport(reportDb, session),
    classify: (value) => value.status === "ok" ? "ok" : value.status === "forbidden" ? "forbidden" : "not-found",
    auditOf: (value) => {
      if (value.status !== "ok") throw new Error("unreachable: auditOf on non-ok CEO self outcome");
      return {
        entityType: "AssessmentSubmission",
        entityId: value.report.provenance.submissionId,
        action: "CEO_SELF_REPORT_VIEW",
        changes: {
          kind: "ceo-self-report",
          focusCampaignId: session.focusCampaignId,
          focusSubmissionId: session.focusSubmissionId,
          respondentId: session.respondentId,
          templateAlias: value.report.templateAlias,
          versionId: value.report.provenance.versionId,
          contentHash: value.report.provenance.contentHash,
        },
      };
    },
    metricRole: "CEO_SELF",
  });
  return { outcome, metricRole: "CEO_SELF" };
}

/**
 * Public Campaign referral Results report adapter. The shared report gate
 * enforces authentication, flag gating, actor/submission/IP rate limiting, an
 * enumeration-safe disposition, and a fail-closed VIEW_REPORT audit before the
 * page can render the canonical frozen report.
 */
export async function viewPublicReferralReport(
  deps: ReportGateDeps,
  args: { submissionId: string },
): Promise<{
  outcome: PublicReferralReportOutcome;
  metricRole: string | null;
}> {
  const actor = await getApiActor();
  const h = await headers();
  const ip = ipFromHeaders(h);
  const userAgent = h.get("user-agent");
  const actorKey = actor?.coachId ?? actor?.userId ?? "anon";
  const metricRole = actor?.role ?? null;
  const reportDb =
    db as unknown as Parameters<typeof getPublicReferralReport>[0];

  const outcome = await viewReport<PublicReferralReportOutcome>(deps, {
    surface: "respondent",
    actor,
    noActorPolicy: "redirect-login",
    flagGate: isReferredResultsEnabled,
    ip,
    userAgent,
    rateLimitKey:
      `public-referral-report:${actorKey}:${args.submissionId}:${ip}`,
    rateLimitConfig: RateLimits.standard,
    load: () =>
      getPublicReferralReport(reportDb, actor!, args.submissionId),
    classify: (o) =>
      o.status === "ok"
        ? "ok"
        : o.status === "forbidden"
          ? "forbidden"
          : "not-found",
    auditOf: (o) => {
      if (o.status !== "ok") {
        throw new Error(
          "unreachable: auditOf on non-ok public referral outcome",
        );
      }
      return {
        entityType: "AssessmentSubmission",
        action: "VIEW_REPORT",
        entityId: o.report.provenance.submissionId,
        changes: {
          kind: "public-referral-report",
          templateAlias: o.report.templateAlias,
          reportType: reportConfigFor(o.report.templateAlias).reportType,
          versionId: o.report.provenance.versionId,
          contentHash: o.report.provenance.contentHash,
        },
      };
    },
    metricRole,
  });

  return { outcome, metricRole };
}
