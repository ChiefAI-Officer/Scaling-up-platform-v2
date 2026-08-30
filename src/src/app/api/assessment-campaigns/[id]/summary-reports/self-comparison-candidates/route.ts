import { z } from "zod";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { resolveSummaryReportingState } from "@/lib/assessments/summary-reports/flags";
import { listAuthorizedSelfComparisonCandidates } from "@/lib/assessments/summary-reports/self-comparison-access";
import {
  checkSummaryReportRateLimit,
  summaryReportErrorClass,
  summaryReportJson,
  summaryReportNotFound,
} from "@/lib/assessments/summary-reports/http";
import { RateLimits } from "@/lib/rate-limit";

const querySchema = z.object({ focusSubmissionId: z.string().min(1).max(191) }).strict();

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id: campaignId } = await params;
  const state = resolveSummaryReportingState(process.env, campaignId);
  if (!state.enabled || state.killed) return summaryReportNotFound();
  const actor = await getApiActor();
  if (!actor || actor.role !== "COACH") return summaryReportNotFound();
  const limiter = await checkSummaryReportRateLimit({ actorUserId: actor.userId, campaignId, operation: "candidates", config: RateLimits.search });
  if ("response" in limiter) return limiter.response;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!parsed.success) return summaryReportJson({ error: "Invalid query." }, 400, limiter.headers);
  try {
    const result = await listAuthorizedSelfComparisonCandidates(db, actor, {
      destinationCampaignId: campaignId,
      focusSubmissionId: parsed.data.focusSubmissionId,
    });
    if (result.kind === "not-found") return summaryReportNotFound(limiter.headers);
    if (result.kind === "unavailable") {
      return summaryReportJson({ error: "Self Comparison candidates are temporarily unavailable." }, 503, limiter.headers);
    }
    return summaryReportJson({ candidates: result.candidates, bounded: result.bounded }, 200, limiter.headers);
  } catch (error) {
    try {
      console.error(JSON.stringify({
        event: "self-comparison-candidates-failed",
        campaignId,
        errorClass: summaryReportErrorClass(error),
      }));
    } catch {
      // Observability must not change the enumeration-safe response.
    }
    return summaryReportJson({ error: "Self Comparison candidates are temporarily unavailable." }, 503, limiter.headers);
  }
}
