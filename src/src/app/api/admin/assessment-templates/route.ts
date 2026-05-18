/**
 * Assessment v7.6 — GET /api/admin/assessment-templates.
 *
 * Admin-only. Lists ALL non-deleted assessment templates (bypasses the
 * INTERSECTION RBAC that the coach-facing /api/assessment-templates uses).
 * Used by the admin aggregate dashboard selector.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";

interface AdminTemplateSummary {
  id: string;
  name: string;
  alias: string;
  aggregationMode: "FULL_VISIBILITY" | "CEO_ONLY";
}

export async function GET(request: NextRequest) {
  try {
    void request.url;
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

    const templates = await db.assessmentTemplate.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        alias: true,
        aggregationMode: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: templates satisfies AdminTemplateSummary[],
    });
  } catch (error) {
    console.error("Error listing admin assessment templates:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list templates" },
      { status: 500 },
    );
  }
}
