import { headers } from "next/headers";

import { getApiActor } from "@/lib/auth/authorization";
import { ipFromHeaders } from "@/lib/assessments/report-access-gate-deps";
import {
  viewReport,
  type ReportGateDeps,
} from "@/lib/assessments/report-gate-core";
import {
  getScalingCondensedCeoSnapshot,
  type ScalingCondensedCeoResult,
} from "@/lib/assessments/summary-reports/scaling-condensed-ceo-snapshot";
import { db } from "@/lib/db";
import { RateLimits } from "@/lib/rate-limit";

/** One-click Condensed adapter using the shared bulk-report access protocol. */
export async function viewCondensedCeoReport(
  deps: ReportGateDeps,
  args: { campaignId: string; generatedAt: Date },
): Promise<{ outcome: ScalingCondensedCeoResult; metricRole: string | null }> {
  const actor = await getApiActor();
  const h = await headers();
  const ip = ipFromHeaders(h);
  const userAgent = h.get("user-agent");
  const actorKey = actor?.coachId ?? actor?.userId ?? "anon";
  const metricRole = actor?.role ?? null;
  const snapshotDb = db as unknown as Parameters<
    typeof getScalingCondensedCeoSnapshot
  >[0];

  const outcome = await viewReport<ScalingCondensedCeoResult>(deps, {
    surface: "group",
    actor,
    noActorPolicy: "tolerate",
    ip,
    userAgent,
    rateLimitKey: `condensed-ceo-report:${actorKey}:${args.campaignId}:${ip}`,
    rateLimitConfig: RateLimits.standard,
    load: () => actor
      ? getScalingCondensedCeoSnapshot(
          snapshotDb,
          actor,
          args.campaignId,
          args.generatedAt,
        )
      : Promise.resolve({ kind: "not-found" } as const),
    classify: (result) => result.kind === "ok"
      ? "ok"
      : result.kind === "not-found"
        ? "not-found"
        : "passthrough",
    auditOf: (result) => {
      if (result.kind !== "ok") {
        throw new Error("unreachable: auditOf on non-ok Condensed outcome");
      }
      return {
        entityType: "AssessmentCampaign",
        action: "GROUP_REPORT_VIEW",
        entityId: args.campaignId,
        changes: {
          kind: "condensed-ceo",
          generatedAt: args.generatedAt.toISOString(),
          submissionId: result.snapshot.source.submissionId,
          versionId: result.snapshot.destination.versionId,
          versionContentHash: result.snapshot.provenance.versionContentHash,
          peer: result.snapshot.provenance.peer,
        },
      };
    },
    auditFailureFields: () => ({ template: "scaling-up-full" }),
    metricRole,
  });

  return { outcome, metricRole };
}
