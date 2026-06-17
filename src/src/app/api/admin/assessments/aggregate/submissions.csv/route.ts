/**
 * Assessment v7.6 — Task J — Admin per-submission CSV export.
 *
 * GET /api/admin/assessments/aggregate/submissions.csv?templateId=...&versionId=...
 *
 * One row per submission across ALL campaigns for the given (template,
 * version). PUBLIC submissions (respondentId === null) are included and
 * fall back to the publicTaker JSON for name/email.
 *
 * Base columns:
 *   Submitted At | Organization | Coach (Campaign Creator) | Campaign Name |
 *   Respondent Name | Respondent Email | Is CEO | Count Achieved |
 *   Tier Label | Overall Total | Overall Average
 * Dynamic columns:
 *   Section_<stableKey>_Total  (one per section in version.sections sortOrder)
 *
 * Admin-only. 401 unauth, 403 coach, 400 missing required query params.
 * Filename: <template-alias>-v<versionNumber>-submissions-YYYY-MM-DD.csv.
 * Audit: entityType="AssessmentTemplate", action="EXPORT",
 *        changes={ kind: "aggregate-submissions", versionId }.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { rowsToCsv, type CsvCellInput } from "@/lib/utils/csv";
import { generateSlug } from "@/lib/utils";
import { withRateLimit, RateLimits } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import type { ScoreResult, PerSectionResult } from "@/lib/assessments/scoring";

interface SectionDef {
  stableKey: string;
  name: string;
  sortOrder: number;
}

function safeSections(value: unknown): SectionDef[] {
  if (!Array.isArray(value)) return [];
  const out: SectionDef[] = [];
  for (const s of value) {
    if (
      s &&
      typeof s === "object" &&
      typeof (s as { stableKey?: unknown }).stableKey === "string" &&
      typeof (s as { name?: unknown }).name === "string"
    ) {
      const row = s as { stableKey: string; name: string; sortOrder?: unknown };
      out.push({
        stableKey: row.stableKey,
        name: row.name,
        sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : 0,
      });
    }
  }
  return out.sort((a, b) => a.sortOrder - b.sortOrder);
}

function isScoreResult(value: unknown): value is ScoreResult {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.countAchieved === "number" &&
    typeof v.overallTotal === "number" &&
    typeof v.overallAverage === "number"
  );
}

function formatNumber(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(4));
}

interface PublicTakerShape {
  firstName?: string;
  lastName?: string;
  email?: string;
}

function publicTakerName(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const v = value as PublicTakerShape;
  return `${v.firstName ?? ""} ${v.lastName ?? ""}`.trim();
}

function publicTakerEmail(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  return (value as PublicTakerShape).email ?? "";
}

export async function GET(request: NextRequest): Promise<Response> {
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
  if (!isPrivilegedRole(actor.role)) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403, headers: rate.headers },
    );
  }

  const templateId = request.nextUrl.searchParams.get("templateId");
  const versionId = request.nextUrl.searchParams.get("versionId");

  if (!templateId) {
    return NextResponse.json(
      { success: false, error: "templateId is required" },
      { status: 400, headers: rate.headers },
    );
  }
  if (!versionId) {
    return NextResponse.json(
      { success: false, error: "versionId is required" },
      { status: 400, headers: rate.headers },
    );
  }

  const [template, version, submissions] = await Promise.all([
    db.assessmentTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, alias: true },
    }),
    db.assessmentTemplateVersion.findUnique({
      where: { id: versionId },
      select: { id: true, versionNumber: true, sections: true },
    }),
    db.assessmentSubmission.findMany({
      where: {
        // SEC-M6: exclude submissions whose campaign was soft-deleted.
        campaign: { templateId, versionId, deletedAt: null },
      },
      select: {
        id: true,
        campaignId: true,
        respondentId: true,
        submittedAt: true,
        result: true,
        publicTaker: true,
        respondent: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            jobTitle: true,
          },
        },
        campaign: {
          select: {
            name: true,
            organization: { select: { name: true } },
            creatorCoach: {
              select: { firstName: true, lastName: true, email: true },
            },
          },
        },
      },
      orderBy: { submittedAt: "asc" },
    }),
  ]);

  if (!template) {
    return NextResponse.json(
      { success: false, error: "Template not found" },
      { status: 404, headers: rate.headers },
    );
  }
  if (!version) {
    return NextResponse.json(
      { success: false, error: "Version not found" },
      { status: 404, headers: rate.headers },
    );
  }

  const sections = safeSections(version.sections);
  const sectionColumns = sections.map(
    (s) => `Section_${s.stableKey}_Total`,
  );

  // Lookup CEO flag per (campaignId, respondentId) for the "Is CEO" column.
  // PUBLIC submissions (respondentId === null) have no participant row → "No".
  const campaignIds = new Set<string>();
  for (const sub of submissions) campaignIds.add(sub.campaignId);
  const participants =
    campaignIds.size === 0
      ? []
      : await db.assessmentCampaignParticipant.findMany({
          where: { campaignId: { in: Array.from(campaignIds) } },
          select: { campaignId: true, respondentId: true, isCEO: true },
        });
  const ceoFlag = new Map<string, boolean>();
  for (const p of participants) {
    ceoFlag.set(`${p.campaignId}:${p.respondentId}`, p.isCEO);
  }

  const headers = [
    "Submitted At",
    "Organization",
    "Coach (Campaign Creator)",
    "Campaign Name",
    "Respondent Name",
    "Respondent Email",
    "Is CEO",
    "Count Achieved",
    "Tier Label",
    "Overall Total",
    "Overall Average",
    ...sectionColumns,
  ];

  const rows: Array<Array<CsvCellInput>> = submissions.map((sub) => {
    const result = isScoreResult(sub.result) ? (sub.result as ScoreResult) : null;

    const respondentName = sub.respondent
      ? `${sub.respondent.firstName ?? ""} ${sub.respondent.lastName ?? ""}`.trim()
      : publicTakerName(sub.publicTaker);
    const respondentEmail =
      sub.respondent?.email ?? publicTakerEmail(sub.publicTaker);

    const coach = sub.campaign.creatorCoach;
    const coachLabel = coach
      ? `${coach.firstName ?? ""} ${coach.lastName ?? ""}`.trim() ||
        coach.email
      : "";

    const isCEO =
      sub.respondentId !== null
        ? (ceoFlag.get(`${sub.campaignId}:${sub.respondentId}`) ?? false)
        : false;

    const perSectionByKey = new Map<string, PerSectionResult>();
    if (result) {
      for (const ps of result.perSection ?? []) {
        perSectionByKey.set(ps.stableKey, ps);
      }
    }

    const sectionCells = sections.map((s): CsvCellInput => {
      const ps = perSectionByKey.get(s.stableKey);
      return ps ? formatNumber(ps.totalPoints) : "";
    });

    return [
      sub.submittedAt.toISOString(),
      sub.campaign.organization?.name ?? "",
      coachLabel,
      sub.campaign.name,
      respondentName,
      respondentEmail,
      isCEO ? "Yes" : "No",
      result ? result.countAchieved : "",
      result?.tier?.label ?? "",
      result ? result.overallTotal : "",
      result ? formatNumber(result.overallAverage) : "",
      ...sectionCells,
    ];
  });

  const csv = rowsToCsv(headers, rows);
  const today = new Date().toISOString().slice(0, 10);
  const aliasSlug = generateSlug(template.alias) || "export";
  const filename = `${aliasSlug}-v${version.versionNumber}-submissions-${today}.csv`;

  await logAudit({
    entityType: "AssessmentTemplate",
    entityId: templateId,
    action: "EXPORT",
    performedBy: actor.email,
    changes: { kind: "aggregate-submissions", versionId },
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
