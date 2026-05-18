/**
 * Assessment v7.6 — GET /api/admin/assessment-templates/[id]/versions.
 *
 * Admin-only. Lists published versions for a template id. Used by the
 * version selector on the admin aggregate dashboard. Unpublished
 * (draft) versions are filtered out — they have no submissions to
 * aggregate yet by definition.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";

interface AdminVersionSummary {
  id: string;
  versionNumber: number;
  language: string;
  publishedAt: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

    const { id } = await params;

    const versions = await db.assessmentTemplateVersion.findMany({
      where: { templateId: id, publishedAt: { not: null } },
      select: {
        id: true,
        versionNumber: true,
        language: true,
        publishedAt: true,
      },
      orderBy: { publishedAt: "desc" },
    });

    const data: AdminVersionSummary[] = versions.map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      language: v.language,
      // findMany with `publishedAt: { not: null }` guarantees non-null at runtime;
      // narrowing the type assertively avoids `Date | null` in the JSON contract.
      publishedAt: (v.publishedAt as Date).toISOString(),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error listing admin assessment template versions:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list versions" },
      { status: 500 },
    );
  }
}
