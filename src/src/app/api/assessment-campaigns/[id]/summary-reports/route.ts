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

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function notFound(): Response {
  return json({ error: "Not found" }, 404);
}

function safelyLogFailure(event: Record<string, unknown>): void {
  try {
    console.error(JSON.stringify(event));
  } catch {
    // Observability must not change the safe route result.
  }
}

function errorClass(error: unknown): string {
  if (!(error instanceof Error)) return typeof error;
  const candidate = error.constructor?.name;
  return typeof candidate === "string" &&
    /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(candidate)
    ? candidate
    : "Error";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: campaignId } = await params;
  const state = resolveSummaryReportingState(process.env, campaignId);
  const actor = await getApiActor();
  if (!actor || !state.enabled || state.killed) return notFound();

  try {
    const result = await listAuthorizedSummaryReports(
      createPrismaSummaryReportReadDb(db),
      actor,
      campaignId,
    );
    if (result.kind === "not-found") return notFound();
    return json({ reports: result.reports }, 200);
  } catch (error) {
    safelyLogFailure({
      event: "summary-report-list-failed",
      campaignId,
      errorClass: errorClass(error),
    });
    return json({ error: "Summary reports are temporarily unavailable." }, 503);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: campaignId } = await params;
  const state = resolveSummaryReportingState(process.env, campaignId);
  const actor = await getApiActor();
  if (!actor || !state.enabled || state.killed) return notFound();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Invalid request body." }, 400);
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

    if (result.kind === "not-found") return notFound();
    if (result.kind === "invalid") {
      return json({ errors: result.errors }, 422);
    }
    if (result.kind === "render-failed") {
      return json(
        { error: "Summary report could not be created. Try again." },
        503,
      );
    }
    return json(
      { report: result.report },
      result.kind === "created" ? 201 : 200,
    );
  } catch (error) {
    safelyLogFailure({
      event: "summary-report-route-create-failed",
      campaignId,
      creationRequestId: parsed.data.creationRequestId,
      reportType: parsed.data.reportType,
      errorClass: errorClass(error),
    });
    return json(
      { error: "Summary report could not be created. Try again." },
      503,
    );
  }
}
