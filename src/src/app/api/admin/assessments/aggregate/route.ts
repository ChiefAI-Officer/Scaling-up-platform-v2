/**
 * Assessment v7.6 — GET /api/admin/assessments/aggregate.
 *
 * Spec refs:
 *  - docs/specs/v7.6/05-wireframes-wave5.md — Wireframe 23 dashboard.
 *  - docs/specs/v7.6/02-service-layer-rules.md — canAccessAggregateReport.
 *
 * Admin/staff only. Returns the AggregateReport for (templateId, versionId).
 * Coach actors NEVER access this route (operator-mode bypass on CEO_ONLY
 * is the whole point).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { getAggregateReport } from "@/lib/assessments/aggregate-report";

export async function GET(request: NextRequest) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    if (!isPrivilegedRole(actor.role)) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
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
        { status: 400 },
      );
    }
    if (!versionId) {
      return NextResponse.json(
        { success: false, error: "versionId is required" },
        { status: 400 },
      );
    }

    // Parse + validate optional date filters (YYYY-MM-DD or full ISO).
    function parseDate(raw: string | null): Date | null {
      if (!raw) return null;
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const startDate = parseDate(startDateParam);
    const endDate = parseDate(endDateParam);
    if (startDateParam && !startDate) {
      return NextResponse.json(
        { success: false, error: "startDate must be a valid ISO date" },
        { status: 400 },
      );
    }
    if (endDateParam && !endDate) {
      return NextResponse.json(
        { success: false, error: "endDate must be a valid ISO date" },
        { status: 400 },
      );
    }

    const report = await getAggregateReport(db, templateId, versionId, {
      startDate,
      endDate,
      organizationId: organizationId || null,
    });

    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    console.error("Error building aggregate report:", error);
    return NextResponse.json(
      { success: false, error: "Failed to build aggregate report" },
      { status: 500 },
    );
  }
}
