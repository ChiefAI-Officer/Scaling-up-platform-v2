/**
 * Assessment v7.6 — Task J — Per-respondent result CSV export.
 *
 * GET /api/assessment-campaigns/[id]/respondents/[respondentId]/result/export.csv
 *
 * Coach-facing CSV: one row per question in the submission's frozen
 * ScoreResult.perQuestion[], joined to the version's sections + questions
 * for the human-readable labels. `Achieved` is recomputed from
 * `value >= scoringConfig.passThreshold` so it matches the per-question
 * result rather than relying on a possibly-stale flag.
 *
 * Auth:
 *   - 401 unauthenticated.
 *   - 404 if canManageCampaign(actor, id, "read") === false.
 *   - 404 if no submission exists for (campaign, respondent).
 *
 * Filename: <campaign-alias>-<respondent-lastname>-result-YYYY-MM-DD.csv
 * (both slugs fall through to "export"/"respondent" if missing).
 *
 * Audit: entityType="AssessmentSubmission", action="EXPORT",
 *        changes={ kind: "per-question-result" }.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import {
  asAccessDb,
  canManageCampaign,
} from "@/lib/assessments/access-control";
import { rowsToCsv, type CsvCellInput } from "@/lib/utils/csv";
import { generateSlug } from "@/lib/utils";
import { withRateLimit, RateLimits } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import type { ScoreResult } from "@/lib/assessments/scoring";

interface VersionSectionRow {
  stableKey: string;
  name: string;
  sortOrder?: number;
}

interface VersionQuestionRow {
  stableKey: string;
  label: string;
  sectionStableKey?: string;
  sortOrder?: number;
}

function safeArray<T>(value: unknown, isItem: (v: unknown) => v is T): T[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isItem);
}

function isSection(v: unknown): v is VersionSectionRow {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r.stableKey === "string" && typeof r.name === "string";
}

function isQuestion(v: unknown): v is VersionQuestionRow {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r.stableKey === "string" && typeof r.label === "string";
}

function isScoreResult(value: unknown): value is ScoreResult {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.perQuestion) &&
    typeof v.countAchieved === "number" &&
    typeof v.overallTotal === "number"
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; respondentId: string }> },
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

  const { id: campaignId, respondentId } = await params;

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

  const submission = await db.assessmentSubmission.findFirst({
    where: { campaignId, respondentId },
    select: {
      id: true,
      result: true,
      respondent: {
        select: { id: true, firstName: true, lastName: true },
      },
      campaign: {
        select: {
          alias: true,
          version: {
            select: {
              sections: true,
              questions: true,
              scoringConfig: true,
            },
          },
        },
      },
    },
  });

  if (!submission) {
    return NextResponse.json(
      { success: false, error: "Submission not found" },
      { status: 404, headers: rate.headers },
    );
  }

  if (!isScoreResult(submission.result)) {
    return NextResponse.json(
      { success: false, error: "Submission has no scoring result" },
      { status: 500, headers: rate.headers },
    );
  }

  const sections = safeArray(submission.campaign.version.sections, isSection);
  const questions = safeArray(
    submission.campaign.version.questions,
    isQuestion,
  );

  const sectionByKey = new Map<string, VersionSectionRow>();
  for (const s of sections) sectionByKey.set(s.stableKey, s);

  const questionByKey = new Map<string, VersionQuestionRow>();
  for (const q of questions) questionByKey.set(q.stableKey, q);

  // passThreshold: spec says "Achieved = value >= passThreshold".
  // Fall through to 0 if config is malformed — Achieved column then matches
  // the result's perQuestion[].achieved flag (rare; defence-in-depth).
  const scoringConfig = submission.campaign.version.scoringConfig as
    | { passThreshold?: number }
    | null;
  const passThreshold =
    typeof scoringConfig?.passThreshold === "number"
      ? scoringConfig.passThreshold
      : null;

  const headers = [
    "Section Stable Key",
    "Section Name",
    "Question Stable Key",
    "Question Label",
    "Value",
    "Achieved",
  ];

  const rows: Array<Array<CsvCellInput>> = submission.result.perQuestion.map(
    (pq) => {
      const q = questionByKey.get(pq.stableKey);
      const sectionKey = q?.sectionStableKey ?? "";
      const section = sectionKey ? sectionByKey.get(sectionKey) : undefined;
      const achieved =
        passThreshold === null ? pq.achieved : pq.value >= passThreshold;
      return [
        sectionKey,
        section?.name ?? "",
        pq.stableKey,
        q?.label ?? "",
        pq.value,
        achieved ? "Yes" : "No",
      ];
    },
  );

  const csv = rowsToCsv(headers, rows);
  const today = new Date().toISOString().slice(0, 10);
  const campaignSlug = generateSlug(submission.campaign.alias) || "export";
  const lastName = submission.respondent?.lastName ?? "respondent";
  const respondentSlug = generateSlug(lastName) || "respondent";
  const filename = `${campaignSlug}-${respondentSlug}-result-${today}.csv`;

  await logAudit({
    entityType: "AssessmentSubmission",
    entityId: submission.id,
    action: "EXPORT",
    performedBy: actor.email,
    changes: { kind: "per-question-result" },
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
