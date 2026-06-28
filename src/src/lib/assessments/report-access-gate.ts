/**
 * Report access gate — adapters + wiring (PR1).
 *
 * Pre-binds the per-surface policy for the pure `viewReport` core
 * (report-gate-core.ts) and owns the Next/Prisma-coupled wiring (getApiActor,
 * headers, the narrow-Db bridge cast, the loaders, the flags). The pages call an
 * adapter with only ids (+ generatedAt for group) + `defaultReportGateDeps()`;
 * they never see `ReportDb`/casts or the rate-limit/audit protocol.
 *
 * PR1 shipped the GROUP adapter (a no-op migration — group already matched the
 * gate's target shape). PR2 adds the RESPONDENT adapter, which carries the
 * always-on surface's intentional fold-ins: fail-closed audit + IP/UA, the
 * strengthened rate-limit key, and structured `assessment.respondent_report.*`
 * metrics (retiring the ad-hoc console.info).
 */

import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { checkRateLimitAsync, RateLimits } from "@/lib/rate-limit";
import {
  viewReport,
  type ReportGateDeps,
} from "@/lib/assessments/report-gate-core";
import { emitReportMetric } from "@/lib/assessments/report-metrics";
import {
  getCampaignGroupReport,
  type GroupReportResult,
} from "@/lib/assessments/group-report";
import {
  getRespondentReport,
  type RespondentReportOutcome,
} from "@/lib/assessments/respondent-report";
import { reportConfigFor } from "@/lib/assessments/report-config";
import {
  REPORT_FILTERS,
  REPORT_FILTER_VERSION,
} from "@/lib/assessments/qualitative-report-model";

/** First-hop client IP, mirroring the current report routes' extraction byte-for-byte. */
export function ipFromHeaders(h: Headers): string {
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "localhost"
  );
}

/**
 * Production deps for the gate. The single point where `db.auditLog` is bridged
 * to the core's structural `auditSink` (the read-db / write-db split is
 * intentional — see ADR-0012). `checkRateLimitAsync` / `emitReportMetric` are
 * standalone functions (no `this` binding concern).
 */
export function defaultReportGateDeps(): ReportGateDeps {
  return {
    auditSink: db.auditLog as unknown as ReportGateDeps["auditSink"],
    rateLimiter: checkRateLimitAsync,
    emitMetric: emitReportMetric,
  };
}

/**
 * Campaign group (Aggregate) report adapter. Tolerates a null actor (the flag
 * gate + the loader's `canViewGroupReport` handle authorization). Rate-limit key
 * preserved verbatim from the current route. Audit = fail-closed
 * `GROUP_REPORT_VIEW`.
 */
export async function viewGroupReport(
  deps: ReportGateDeps,
  args: { campaignId: string; generatedAt: Date },
): Promise<{ outcome: GroupReportResult; metricRole: string | null }> {
  const actor = await getApiActor();
  const h = await headers();
  const ip = ipFromHeaders(h);
  const userAgent = h.get("user-agent");
  const actorKey = actor?.coachId ?? actor?.userId ?? "anon";
  const metricRole = actor?.role ?? null;
  const reportDb = db as unknown as Parameters<typeof getCampaignGroupReport>[0];

  // The gate may throw Next control-flow (notFound for forbidden/rate-limit, the
  // disposition 404s) — which propagates straight through to the page's frame.
  // For ok / empty / notApplicable it returns the outcome, which we surface
  // alongside metricRole so the PAGE can attribute its success-render metrics
  // (view / empty / degraded / orphan_submission) without re-resolving the actor.
  const outcome = await viewReport<GroupReportResult>(deps, {
    surface: "group",
    actor,
    noActorPolicy: "tolerate",
    // Wave J (J-3): NO pre-rate-limit flagGate. The enablement decision moved
    // INTO the loader (the single source of truth) so the rate limiter runs
    // FIRST and the alias-aware flag check can see template.alias without an
    // unauthenticated pre-rate-limit DB lookup. The loader returns `notEnabled`
    // when off, which classify → "not-found" → a SILENT dark 404 (identical
    // observable semantics to the old flagGate, enumeration-safe, no audit).
    flagGate: undefined,
    ip,
    userAgent,
    rateLimitKey: `group-report:${actorKey}:${args.campaignId}:${ip}`,
    rateLimitConfig: RateLimits.standard,
    load: () => getCampaignGroupReport(reportDb, actor, args.campaignId, args.generatedAt),
    classify: (o) =>
      o.kind === "ok"
        ? "ok"
        : o.kind === "forbidden"
          ? "forbidden"
          : o.kind === "notEnabled"
            ? "not-found"
            : "passthrough",
    auditOf: (o) => {
      if (o.kind !== "ok") throw new Error("unreachable: auditOf on non-ok group outcome");
      return {
        entityType: "AssessmentCampaign",
        action: "GROUP_REPORT_VIEW",
        entityId: args.campaignId,
        changes: {
          kind: "group-report",
          generatedAt: args.generatedAt.toISOString(),
          versionId: o.provenance.versionId,
          templateAlias: o.provenance.templateAlias,
          contentHash: o.provenance.contentHash,
          ceoParticipantId: o.provenance.ceoParticipantId,
          completedCount: o.provenance.completedCount,
          invitedCount: o.provenance.invitedCount,
          submissionIds: o.provenance.submissionIds,
        },
      };
    },
    auditFailureFields: (o) => (o.kind === "ok" ? { template: o.provenance.templateAlias } : {}),
    metricRole,
  });

  return { outcome, metricRole };
}

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
