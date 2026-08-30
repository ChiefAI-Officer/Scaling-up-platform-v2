import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { removeReferredResult } from "@/lib/assessments/referred-results-removal";
import { isReferredResultsEnabled } from "@/lib/assessments/wave-83-flags";
import { getApiActor } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { checkRateLimitStrict } from "@/lib/rate-limit";

const submissionIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(191)
  .regex(/^[A-Za-z0-9_-]+$/);

const privateHeaders = {
  "Cache-Control": "no-store, private",
};

function rateHeaders(rate: {
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}) {
  return {
    "X-RateLimit-Limit": "10",
    "X-RateLimit-Remaining": String(rate.remaining),
    "X-RateLimit-Reset": String(rate.resetAt),
    ...(rate.retryAfter ? { "Retry-After": String(rate.retryAfter) } : {}),
  };
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  const actor = await getApiActor();
  if (!actor) {
    return NextResponse.json(
      { success: false, error: "Authentication required" },
      { status: 401, headers: privateHeaders },
    );
  }
  if (!isReferredResultsEnabled()) {
    return NextResponse.json(
      { success: false, error: "Not found" },
      { status: 404, headers: privateHeaders },
    );
  }
  if (actor.role !== "COACH" || !actor.coachId) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403, headers: privateHeaders },
    );
  }

  const parsedId = submissionIdSchema.safeParse(
    (await params).submissionId,
  );
  if (!parsedId.success) {
    return NextResponse.json(
      { success: false, error: "Invalid submission ID" },
      { status: 400, headers: privateHeaders },
    );
  }

  let rate;
  try {
    rate = await checkRateLimitStrict(
      `referred-results-delete:${actor.coachId}`,
      { interval: 60_000, maxRequests: 10 },
    );
  } catch (error) {
    console.error("Referred-results removal limiter unavailable:", error);
    return NextResponse.json(
      { success: false, error: "Removal temporarily unavailable" },
      { status: 503, headers: privateHeaders },
    );
  }
  const limitedHeaders = { ...privateHeaders, ...rateHeaders(rate) };
  if (!rate.success) {
    return NextResponse.json(
      { success: false, error: "Too many removal requests" },
      { status: 429, headers: limitedHeaders },
    );
  }

  const requestId = request.headers.get("x-request-id")?.trim() || randomUUID();
  try {
    const outcome = await removeReferredResult(
      db as never,
      actor,
      parsedId.data,
      {
        now: new Date(),
        requestId,
        ipAddress:
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          undefined,
        userAgent: request.headers.get("user-agent") ?? undefined,
      },
    );
    if (outcome === "not-found") {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404, headers: limitedHeaders },
      );
    }
    if (outcome === "forbidden") {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403, headers: limitedHeaders },
      );
    }

    return NextResponse.json(
      { success: true },
      {
        headers: {
          ...limitedHeaders,
          "X-Request-Id": requestId,
        },
      },
    );
  } catch (error) {
    console.error("Failed to remove referred result:", error);
    return NextResponse.json(
      { success: false, error: "Removal temporarily unavailable" },
      { status: 503, headers: limitedHeaders },
    );
  }
}
