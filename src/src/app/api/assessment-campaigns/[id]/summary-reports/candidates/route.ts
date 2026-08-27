import { z } from "zod";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { resolveSummaryReportingState } from "@/lib/assessments/summary-reports/flags";
import {
  createPrismaSummaryReportCandidateDb,
  listSummaryReportCandidates,
} from "@/lib/assessments/summary-reports/candidates";

const querySchema = z
  .object({
    type: z.literal("SCALING_CEO_FULL"),
    scope: z.enum(["current", "all"]),
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

function errorClass(error: unknown): string {
  if (!(error instanceof Error)) return typeof error;
  const candidate = error.constructor?.name;
  return typeof candidate === "string" &&
    /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(candidate)
    ? candidate
    : "Error";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: campaignId } = await params;
  const state = resolveSummaryReportingState(process.env, campaignId);
  const actor = await getApiActor();
  if (!actor || !state.enabled || state.killed) return notFound();

  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!parsed.success) return json({ error: "Invalid query." }, 400);

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
    if (result.kind === "not-found") return notFound();
    return json({ candidates: result.candidates }, 200);
  } catch (error) {
    try {
      console.error(
        JSON.stringify({
          event: "summary-report-candidates-failed",
          campaignId,
          reportType: parsed.data.type,
          errorClass: errorClass(error),
        }),
      );
    } catch {
      // Observability must not change the safe route result.
    }
    return json(
      { error: "Summary report candidates are temporarily unavailable." },
      503,
    );
  }
}
