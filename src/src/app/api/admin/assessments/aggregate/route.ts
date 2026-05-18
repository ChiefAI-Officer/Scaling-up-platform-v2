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

    const report = await getAggregateReport(db, templateId, versionId);

    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    console.error("Error building aggregate report:", error);
    return NextResponse.json(
      { success: false, error: "Failed to build aggregate report" },
      { status: 500 },
    );
  }
}
