import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { exportPublicReferrals } from "@/lib/assessments/public-referrals";
import { isReferredResultsEnabled } from "@/lib/assessments/wave-83-flags";
import { logAuditStrict } from "@/lib/audit";
import { getApiActor } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { checkRateLimitStrict } from "@/lib/rate-limit";
import { rowsToCsv } from "@/lib/utils/csv";

const exportQuerySchema = z
  .object({
    query: z.string().trim().min(1).max(200).optional(),
    templateId: z.string().trim().min(1).max(191).optional(),
  })
  .strict();

const privateHeaders = {
  "Cache-Control": "no-store, private",
};

export async function GET(request: NextRequest) {
  if (!isReferredResultsEnabled()) {
    return NextResponse.json(
      { success: false, error: "Not found" },
      { status: 404, headers: privateHeaders },
    );
  }

  const actor = await getApiActor();
  if (!actor) {
    return NextResponse.json(
      { success: false, error: "Authentication required" },
      { status: 401, headers: privateHeaders },
    );
  }
  if (actor.role !== "COACH" || !actor.coachId) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403, headers: privateHeaders },
    );
  }

  const validation = exportQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!validation.success) {
    return NextResponse.json(
      { success: false, error: "Invalid query parameters" },
      { status: 400, headers: privateHeaders },
    );
  }

  let rate;
  try {
    rate = await checkRateLimitStrict(
      `referred-results-export:${actor.coachId}`,
      { interval: 60_000, maxRequests: 10 },
    );
  } catch (error) {
    console.error("Referred-results export limiter unavailable:", error);
    return NextResponse.json(
      { success: false, error: "Export temporarily unavailable" },
      { status: 503, headers: privateHeaders },
    );
  }
  const rateHeaders = {
    "X-RateLimit-Limit": "10",
    "X-RateLimit-Remaining": String(rate.remaining),
    "X-RateLimit-Reset": String(rate.resetAt),
    ...(rate.retryAfter ? { "Retry-After": String(rate.retryAfter) } : {}),
  };
  if (!rate.success) {
    return NextResponse.json(
      { success: false, error: "Too many export requests" },
      {
        status: 429,
        headers: { ...privateHeaders, ...rateHeaders },
      },
    );
  }

  try {
    const outcome = await exportPublicReferrals(
      db as never,
      actor,
      validation.data,
    );
    if (outcome.status === "forbidden") {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        {
          status: 403,
          headers: { ...privateHeaders, ...rateHeaders },
        },
      );
    }
    if (outcome.status === "too-many") {
      return NextResponse.json(
        {
          success: false,
          error: "too_many_results",
          totalCount: outcome.totalCount,
          maxAllowed: outcome.maxAllowed,
        },
        {
          status: 422,
          headers: { ...privateHeaders, ...rateHeaders },
        },
      );
    }

    const requestId =
      request.headers.get("x-request-id")?.trim() || randomUUID();
    await logAuditStrict({
      entityType: "CoachReferredResults",
      entityId: actor.coachId,
      action: "EXPORT",
      performedBy: actor.email,
      changes: {
        kind: "referred-results",
        requestId,
        rows: outcome.rows.length,
        queryApplied: Boolean(validation.data.query),
        templateFilterApplied: Boolean(validation.data.templateId),
      },
      ipAddress:
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        undefined,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    const csv = rowsToCsv(
      ["Taker Name", "Taker Email", "Assessment", "Result", "Submitted At"],
      outcome.rows.map((row) => [
        row.takerName,
        row.takerEmail,
        row.assessmentName,
        row.resultLabel,
        row.submittedAt.toISOString(),
      ]),
    );
    const filename = `referred-results-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        ...privateHeaders,
        ...rateHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Request-Id": requestId,
      },
    });
  } catch (error) {
    console.error("Failed to export referred results:", error);
    return NextResponse.json(
      { success: false, error: "Export temporarily unavailable" },
      {
        status: 503,
        headers: { ...privateHeaders, ...rateHeaders },
      },
    );
  }
}
