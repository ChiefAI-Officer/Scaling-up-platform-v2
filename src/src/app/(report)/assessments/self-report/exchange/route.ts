import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAuditStrict } from "@/lib/audit";
import { authorizeCeoReportAccess } from "@/lib/assessments/ceo-report-access";
import {
  getCeoReportAccessSession,
  type CeoReportSessionPayload,
} from "@/lib/assessments/ceo-report-access-cookie";
import { verifyCeoReportAccessToken } from "@/lib/assessments/ceo-report-access-token";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";

const exchangeRequest = z.object({ token: z.string().min(1).max(4096) });

const NO_STORE = {
  "Cache-Control": "no-store, private",
  "Referrer-Policy": "no-referrer",
} as const;

function unavailable(
  status = 410,
  headers: Record<string, string> = {},
): NextResponse {
  return NextResponse.json(
    { error: "This report link is no longer available." },
    { status, headers: { ...headers, ...NO_STORE } },
  );
}

function reportHref(payload: CeoReportSessionPayload): string {
  return `/assessments/${encodeURIComponent(payload.focusCampaignId)}` +
    `/respondents/${encodeURIComponent(payload.respondentId)}/report`;
}

export async function POST(request: Request): Promise<NextResponse> {
  let rateLimit: Awaited<ReturnType<typeof withRateLimit>>;
  try {
    rateLimit = await withRateLimit(request, RateLimits.standard);
  } catch {
    return unavailable();
  }
  if (!rateLimit.allowed) return unavailable(429, rateLimit.headers);

  let parsed: z.ZodSafeParseResult<{ token: string }>;
  try {
    parsed = exchangeRequest.safeParse(await request.json());
  } catch {
    return unavailable();
  }
  if (!parsed.success) return unavailable();

  const claims = verifyCeoReportAccessToken(parsed.data.token);
  if (!claims) return unavailable();

  const payload = await authorizeCeoReportAccess(
    db as unknown as Parameters<typeof authorizeCeoReportAccess>[0],
    claims,
  );
  if (!payload) return unavailable();

  try {
    const session = await getCeoReportAccessSession(
      payload.focusCampaignId,
      payload.respondentId,
    );
    Object.assign(session, payload);
    await logAuditStrict({
      entityType: "AssessmentSubmission",
      entityId: payload.focusSubmissionId,
      action: "CEO_REPORT_ACCESS_EXCHANGED",
      performedBy: "CEO_SELF",
      changes: {
        kind: "ceo-report-access-exchange",
        focusCampaignId: payload.focusCampaignId,
        invitationId: payload.invitationId,
        respondentId: payload.respondentId,
      },
    });
    await session.save();
  } catch {
    return unavailable();
  }

  return NextResponse.json(
    { href: reportHref(payload) },
    { headers: { ...rateLimit.headers, ...NO_STORE } },
  );
}
