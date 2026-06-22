/**
 * Report access gate — adapters + wiring (PR1).
 *
 * Pre-binds the per-surface policy for the pure `viewReport` core
 * (report-gate-core.ts) and owns the Next/Prisma-coupled wiring (getApiActor,
 * headers, the narrow-Db bridge cast, the loaders, the flags). The pages call an
 * adapter with only ids (+ generatedAt for group) + `defaultReportGateDeps()`;
 * they never see `ReportDb`/casts or the rate-limit/audit protocol.
 *
 * PR1 ships the GROUP adapter (a no-op migration — group already matches the
 * gate's target shape). PR2 adds `viewRespondentReport`.
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
import { isGroupReportEnabled } from "@/lib/assessments/wave-f-flags";

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
    flagGate: () => isGroupReportEnabled(actor, { id: args.campaignId }),
    ip,
    userAgent,
    rateLimitKey: `group-report:${actorKey}:${args.campaignId}:${ip}`,
    rateLimitConfig: RateLimits.standard,
    load: () => getCampaignGroupReport(reportDb, actor, args.campaignId, args.generatedAt),
    classify: (o) => (o.kind === "ok" ? "ok" : o.kind === "forbidden" ? "forbidden" : "passthrough"),
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
