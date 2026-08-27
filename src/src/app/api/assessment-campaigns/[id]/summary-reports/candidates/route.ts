import { z } from "zod";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { resolveSummaryReportingState } from "@/lib/assessments/summary-reports/flags";
import {
  createPrismaSummaryReportCandidateDb,
  listSummaryReportCandidates,
} from "@/lib/assessments/summary-reports/candidates";
import {
  checkSummaryReportRateLimit,
  summaryReportErrorClass,
  summaryReportJson,
  summaryReportNotFound,
} from "@/lib/assessments/summary-reports/http";
import { RateLimits } from "@/lib/rate-limit";

const querySchema = z
  .object({
    type: z.literal("SCALING_CEO_FULL"),
    scope: z.enum(["current", "all"]),
  })
  .strict();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: campaignId } = await params;
  const state = resolveSummaryReportingState(process.env, campaignId);
  if (!state.enabled || state.killed) return summaryReportNotFound();
  const actor = await getApiActor();
  if (!actor) return summaryReportNotFound();
  const limiter = await checkSummaryReportRateLimit({
    actorUserId: actor.userId,
    campaignId,
    operation: "candidates",
    config: RateLimits.search,
  });
  if ("response" in limiter) return limiter.response;

  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!parsed.success) {
    return summaryReportJson({ error: "Invalid query." }, 400, limiter.headers);
  }

  try {
    const result = await listSummaryReportCandidates(
      createPrismaSummaryReportCandidateDb(db),
      actor,
      {
        destinationCampaignId: campaignId,
        reportType: parsed.data.type,
        scope: parsed.data.scope,
      },
    );
    if (result.kind === "not-found")
      return summaryReportNotFound(limiter.headers);
    return summaryReportJson(
      { candidates: result.candidates },
      200,
      limiter.headers,
    );
  } catch (error) {
    try {
      console.error(
        JSON.stringify({
          event: "summary-report-candidates-failed",
          campaignId,
          reportType: parsed.data.type,
          errorClass: summaryReportErrorClass(error),
        }),
      );
    } catch {
      // Observability must not change the safe route result.
    }
    return summaryReportJson(
      { error: "Summary report candidates are temporarily unavailable." },
      503,
      limiter.headers,
    );
  }
}
