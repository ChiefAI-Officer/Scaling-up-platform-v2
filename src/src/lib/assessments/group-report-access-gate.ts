/**
 * Aggregate-report adapter for the shared report-access gate.
 *
 * Kept separate from the individual Results-report adapters so the Aggregate
 * route's runtime graph cannot inherit individual appearance dependencies.
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
  getCampaignGroupReport,
  type GroupReportResult,
} from "@/lib/assessments/group-report";
import { ipFromHeaders } from "@/lib/assessments/report-access-gate-deps";

/**
 * Campaign Aggregate-report adapter. Tolerates a null actor (the loader's
 * `canViewGroupReport` handles authorization). Audit is fail-closed.
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
  const reportDb = db as unknown as Parameters<
    typeof getCampaignGroupReport
  >[0];

  const outcome = await viewReport<GroupReportResult>(deps, {
    surface: "group",
    actor,
    noActorPolicy: "tolerate",
    // Enablement lives in the loader so rate limiting precedes alias hydration.
    flagGate: undefined,
    ip,
    userAgent,
    rateLimitKey: `group-report:${actorKey}:${args.campaignId}:${ip}`,
    rateLimitConfig: RateLimits.standard,
    load: () =>
      getCampaignGroupReport(
        reportDb,
        actor,
        args.campaignId,
        args.generatedAt,
      ),
    classify: (outcome) =>
      outcome.kind === "ok"
        ? "ok"
        : outcome.kind === "forbidden"
          ? "forbidden"
          : outcome.kind === "notEnabled"
            ? "not-found"
            : "passthrough",
    auditOf: (outcome) => {
      if (outcome.kind !== "ok") {
        throw new Error("unreachable: auditOf on non-ok group outcome");
      }
      return {
        entityType: "AssessmentCampaign",
        action: "GROUP_REPORT_VIEW",
        entityId: args.campaignId,
        changes: {
          kind: "group-report",
          generatedAt: args.generatedAt.toISOString(),
          versionId: outcome.provenance.versionId,
          templateAlias: outcome.provenance.templateAlias,
          contentHash: outcome.provenance.contentHash,
          ceoParticipantId: outcome.provenance.ceoParticipantId,
          completedCount: outcome.provenance.completedCount,
          invitedCount: outcome.provenance.invitedCount,
          submissionIds: outcome.provenance.submissionIds,
          benchmarkVersion: outcome.provenance.benchmarkVersion ?? null,
          benchmarkKeyMismatch:
            outcome.provenance.benchmarkKeyMismatch ?? false,
          groupRenderVersion:
            outcome.report.provenance.groupRenderVersion,
          scaleDegraded: outcome.report.provenance.scaleDegraded,
          ...(outcome.provenance.peerBenchmarks
            ? {
                peerBenchmarks: {
                  applied: outcome.provenance.peerBenchmarks.applied,
                  updatedAt:
                    outcome.provenance.peerBenchmarks.updatedAt.toISOString(),
                },
              }
            : {}),
        },
      };
    },
    auditFailureFields: (outcome) =>
      outcome.kind === "ok"
        ? { template: outcome.provenance.templateAlias }
        : {},
    metricRole,
  });

  return { outcome, metricRole };
}
