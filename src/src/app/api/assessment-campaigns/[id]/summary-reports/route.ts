import { z } from "zod";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { resolveSummaryReportingState } from "@/lib/assessments/summary-reports/flags";
import {
  createPrismaSummaryReportReadDb,
  listAuthorizedSummaryReports,
} from "@/lib/assessments/summary-reports/read";
import {
  createPrismaSummaryReportCreateDb,
  createSummaryReport,
} from "@/lib/assessments/summary-reports/create";
import {
  checkSummaryReportRateLimit,
  summaryReportErrorClass,
  summaryReportJson,
  summaryReportNotFound,
} from "@/lib/assessments/summary-reports/http";
import { RateLimits } from "@/lib/rate-limit";

const CREATE_RATE_LIMIT = { interval: 60_000, maxRequests: 5 };

const sourceSchema = z
  .object({
    submissionId: z.string().min(1),
    sourceCampaignId: z.string().min(1),
    role: z.enum(["CEO", "TEAM"]),
    position: z.number().int().nonnegative(),
  })
  .strict();

const createSchema = z
  .object({
    reportType: z.literal("SCALING_CEO_FULL"),
    creationRequestId: z.string().min(1),
    sources: z.array(sourceSchema),
  })
  .strict();

function safelyLogFailure(event: Record<string, unknown>): void {
  try {
    console.error(JSON.stringify(event));
  } catch {
    // Observability must not change the safe route result.
  }
}

export async function GET(
  _request: Request,
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
    operation: "list",
    config: RateLimits.search,
  });
  if ("response" in limiter) return limiter.response;

  try {
    const result = await listAuthorizedSummaryReports(
      createPrismaSummaryReportReadDb(db),
      actor,
      campaignId,
    );
    if (result.kind === "not-found")
      return summaryReportNotFound(limiter.headers);
    return summaryReportJson({ reports: result.reports }, 200, limiter.headers);
  } catch (error) {
    safelyLogFailure({
      event: "summary-report-list-failed",
      campaignId,
      errorClass: summaryReportErrorClass(error),
    });
    return summaryReportJson(
      { error: "Summary reports are temporarily unavailable." },
      503,
      limiter.headers,
    );
  }
}

export async function POST(
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
    operation: "create",
    config: CREATE_RATE_LIMIT,
  });
  if ("response" in limiter) return limiter.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return summaryReportJson(
      { error: "Invalid request body." },
      400,
      limiter.headers,
    );
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return summaryReportJson(
      { error: "Invalid request body." },
      400,
      limiter.headers,
    );
  }

  try {
    const result = await createSummaryReport(
      createPrismaSummaryReportCreateDb(db),
      actor,
      {
        destinationCampaignId: campaignId,
        ...parsed.data,
      },
    );

    if (result.kind === "not-found")
      return summaryReportNotFound(limiter.headers);
    if (result.kind === "invalid") {
      return summaryReportJson({ errors: result.errors }, 422, limiter.headers);
    }
    if (result.kind === "render-failed") {
      return summaryReportJson(
        { error: "Summary report could not be created. Try again." },
        503,
        limiter.headers,
      );
    }
    return summaryReportJson(
      { report: result.report },
      result.kind === "created" ? 201 : 200,
      limiter.headers,
    );
  } catch (error) {
    safelyLogFailure({
      event: "summary-report-route-create-failed",
      campaignId,
      creationRequestId: parsed.data.creationRequestId,
      reportType: parsed.data.reportType,
      errorClass: summaryReportErrorClass(error),
    });
    return summaryReportJson(
      { error: "Summary report could not be created. Try again." },
      503,
      limiter.headers,
    );
  }
}
