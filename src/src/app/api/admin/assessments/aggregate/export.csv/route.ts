/**
 * Assessment v7.6 — Task J — Admin aggregate summary CSV export.
 *
 * GET /api/admin/assessments/aggregate/export.csv?templateId=...&versionId=...
 *
 * Two CSV blocks separated by a blank line:
 *   1) Summary stats — header "Metric, Value"
 *      Rows: totalSubmissions, distinctOrgs, avgCountAchieved,
 *            avgOverallTotal, avgOverallAverage, and one row per tier in
 *            the histogram ("Tier: <label>" → count).
 *   2) Per-section means — header
 *      "Section Stable Key, Section Name, Avg Total Points, Avg Per-Question"
 *
 * Admin-only. 401 unauth, 403 coach, 400 missing required query params.
 * Filename: <template-alias>-v<versionNumber>-aggregate-summary-YYYY-MM-DD.csv.
 * Audit: entityType="AssessmentTemplate", action="EXPORT",
 *        changes={ kind: "aggregate-summary", versionId }.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { getAggregateReport } from "@/lib/assessments/aggregate-report";
import { rowsToCsv, type CsvCellInput } from "@/lib/utils/csv";
import { generateSlug } from "@/lib/utils";
import { withRateLimit, RateLimits } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

function formatNumber(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(4));
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
  const startDateParam = request.nextUrl.searchParams.get("startDate");
  const endDateParam = request.nextUrl.searchParams.get("endDate");
  const organizationId = request.nextUrl.searchParams.get("organizationId");

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

  const startDate = startDateParam ? new Date(startDateParam) : null;
  const endDate = endDateParam ? new Date(endDateParam) : null;

  const [template, version, report] = await Promise.all([
    db.assessmentTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, alias: true },
    }),
    db.assessmentTemplateVersion.findUnique({
      where: { id: versionId },
      select: { id: true, versionNumber: true },
    }),
    getAggregateReport(db, templateId, versionId, {
      startDate: startDate && !Number.isNaN(startDate.getTime()) ? startDate : null,
      endDate: endDate && !Number.isNaN(endDate.getTime()) ? endDate : null,
      organizationId: organizationId || null,
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

  // ─── Block 1 — summary stats ────────────────────────────────────────
  const summaryRows: Array<Array<CsvCellInput>> = [
    ["totalSubmissions", report.totalSubmissions],
    ["distinctOrgs", report.distinctOrgs],
    ["avgCountAchieved", formatNumber(report.avgCountAchieved)],
    ["avgOverallTotal", formatNumber(report.avgOverallTotal)],
    ["avgOverallAverage", formatNumber(report.avgOverallAverage)],
    ...report.tierHistogram.map((t): Array<CsvCellInput> => [
      `Tier: ${t.label}`,
      t.count,
    ]),
  ];
  const summaryCsv = rowsToCsv(["Metric", "Value"], summaryRows);

  // ─── Block 2 — per-section means ────────────────────────────────────
  const sectionRows: Array<Array<CsvCellInput>> = report.perSectionMeans.map(
    (s) => [
      s.stableKey,
      s.name,
      formatNumber(s.totalPointsAvg),
      formatNumber(s.averagePointsAvg),
    ],
  );
  const sectionCsv = rowsToCsv(
    ["Section Stable Key", "Section Name", "Avg Total Points", "Avg Per-Question"],
    sectionRows,
  );

  // Blank line (CRLF) between blocks, matching the surrounding RFC 4180
  // line-terminator policy from csv.ts.
  const csv = `${summaryCsv}\r\n${sectionCsv}`;

  const today = new Date().toISOString().slice(0, 10);
  const aliasSlug = generateSlug(template.alias) || "export";
  const filename = `${aliasSlug}-v${version.versionNumber}-aggregate-summary-${today}.csv`;

  await logAudit({
    entityType: "AssessmentTemplate",
    entityId: templateId,
    action: "EXPORT",
    performedBy: actor.email,
    changes: { kind: "aggregate-summary", versionId },
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
