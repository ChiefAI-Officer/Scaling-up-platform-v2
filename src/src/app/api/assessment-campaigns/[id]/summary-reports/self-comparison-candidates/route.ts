import { z } from "zod";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { resolveSummaryReportingState } from "@/lib/assessments/summary-reports/flags";
import { listAuthorizedSelfComparisonCandidates } from "@/lib/assessments/summary-reports/self-comparison-access";
import { checkSummaryReportRateLimit, summaryReportJson, summaryReportNotFound } from "@/lib/assessments/summary-reports/http";
import { RateLimits } from "@/lib/rate-limit";

const querySchema = z.object({ focus: z.string().min(1).max(191) }).strict();

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
  const result = await listAuthorizedSelfComparisonCandidates(db, actor, {
    destinationCampaignId: campaignId,
    focusSubmissionId: parsed.data.focus,
  });
  return result.kind === "ok"
    ? summaryReportJson({ candidates: result.candidates, bounded: result.bounded }, 200, limiter.headers)
    : summaryReportNotFound(limiter.headers);
}
