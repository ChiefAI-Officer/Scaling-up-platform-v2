/**
 * Assessment v7.6 — Task J — GET /api/assessment-campaigns/[id]/respondents/export.csv.
 *
 * Coach-facing CSV export of the campaign respondent table: one row per
 * participant, score columns blank when no submission yet.
 *
 * Auth:
 *   - 401 unauthenticated.
 *   - 404 if canManageCampaign(actor, id, "read") === false (matches the
 *     JSON respondents route — coach probing other coaches' campaign IDs
 *     can't distinguish "not yours" from "doesn't exist").
 *
 * Columns:
 *   Respondent Name | Respondent Email | Job Title | Is CEO |
 *   Invitation Status | Sent At | Submitted At | Count Achieved |
 *   Tier Label | Overall Total | Overall Average
 *
 * Filename: <campaign-alias>-respondents-YYYY-MM-DD.csv
 * (alias falls through to "export" if missing; lowercase + hyphens via
 *  generateSlug for URL/filename safety).
 *
 * Audit log: entityType="AssessmentCampaign", action="EXPORT",
 *            changes={ kind: "respondents", rows: <count> }.
 * Rate-limited: withRateLimit(req, RateLimits.standard).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import {
  asAccessDb,
  canManageCampaign,
} from "@/lib/assessments/access-control";
import {
  asCampaignDetailDb,
  getCampaignRespondents,
} from "@/lib/assessments/campaign-detail";
import { rowsToCsv, type CsvCellInput } from "@/lib/utils/csv";
import { generateSlug } from "@/lib/utils";
import { withRateLimit, RateLimits } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import type { ScoreResult } from "@/lib/assessments/scoring";

function isScoreResult(value: unknown): value is ScoreResult {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.countAchieved === "number" &&
    typeof v.overallTotal === "number" &&
    typeof v.overallAverage === "number"
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const rate = await withRateLimit(request, RateLimits.standard);
  if (!rate.allowed) {
    return NextResponse.json(
      { success: false, error: "Rate limit exceeded" },
      { status: 429, headers: rate.headers },
    );
  }

  const actor = await getApiActor();
  if (!actor) {
    return NextResponse.json(
      { success: false, error: "Authentication required" },
      { status: 401, headers: rate.headers },
    );
  }

  const { id: campaignId } = await params;

  const allowed = await canManageCampaign(
    asAccessDb(db),
    actor,
    campaignId,
    "read",
  );
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: "Campaign not found" },
      { status: 404, headers: rate.headers },
    );
  }

  // Pull campaign meta (alias for filename) + the respondent rows.
  const [campaignMeta, respondents, submissions] = await Promise.all([
    db.assessmentCampaign.findUnique({
      where: { id: campaignId },
      select: { id: true, alias: true },
    }),
    getCampaignRespondents(asCampaignDetailDb(db), campaignId),
    db.assessmentSubmission.findMany({
      where: { campaignId },
      select: { respondentId: true, result: true },
    }),
  ]);

  if (!campaignMeta) {
    return NextResponse.json(
      { success: false, error: "Campaign not found" },
      { status: 404, headers: rate.headers },
    );
  }

  // Index frozen ScoreResult per respondentId for O(1) lookup. PUBLIC
  // submissions (respondentId === null) are ignored — the respondent table
  // is INVITED-only.
  const resultByRespondent = new Map<string, ScoreResult>();
  for (const sub of submissions) {
    if (sub.respondentId === null) continue;
    if (isScoreResult(sub.result)) {
      resultByRespondent.set(sub.respondentId, sub.result);
    }
  }

  const headers = [
    "Respondent Name",
    "Respondent Email",
    "Job Title",
    "Is CEO",
    "Invitation Status",
    "Sent At",
    "Submitted At",
    "Count Achieved",
    "Tier Label",
    "Overall Total",
    "Overall Average",
  ];

  const rows: Array<Array<CsvCellInput>> = respondents.map((row) => {
    const result = resultByRespondent.get(row.respondent.id) ?? null;
    const name =
      `${row.respondent.firstName ?? ""} ${row.respondent.lastName ?? ""}`.trim();
    return [
      name,
      row.respondent.email,
      row.respondent.jobTitle ?? "",
      row.isCEO ? "Yes" : "No",
      row.invitation?.status ?? "PENDING",
      row.invitation?.sentAt ? row.invitation.sentAt.toISOString() : "",
      row.submittedAt ? row.submittedAt.toISOString() : "",
      result ? result.countAchieved : "",
      result?.tier?.label ?? "",
      result ? result.overallTotal : "",
      result ? Number(result.overallAverage.toFixed(4)) : "",
    ];
  });

  const csv = rowsToCsv(headers, rows);
  const today = new Date().toISOString().slice(0, 10);
  const slug = generateSlug(campaignMeta.alias) || "export";
  const filename = `${slug}-respondents-${today}.csv`;

  // Fire-and-forget audit. logAudit swallows DB errors internally.
  await logAudit({
    entityType: "AssessmentCampaign",
    entityId: campaignId,
    action: "EXPORT",
    performedBy: actor.email,
    changes: { kind: "respondents", rows: rows.length },
  });

  return new Response(csv, {
    status: 200,
    headers: {
      ...rate.headers,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
