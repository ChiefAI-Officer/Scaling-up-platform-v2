/**
 * Assessment v7.6 — Admin duplicate an AssessmentTemplateVersion as a new draft.
 *
 * Copies content from the source version (questions / sections / scoringConfig /
 * reportConfig) into a new draft (`publishedAt=null`). versionNumber is bumped
 * to `max(existing for this template+language) + 1`. Used by the admin
 * "Duplicate as new draft" flow when evolving published templates.
 *
 * Body: none (POST with no body).
 *
 * Status outcomes:
 *   - 401 unauthenticated
 *   - 403 non-admin
 *   - 404 source version missing or on a different template
 *   - 200 { newVersionId, versionNumber }
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { logAudit } from "@/lib/audit";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  try {
    const rate = await withRateLimit(request, RateLimits.standard);
    if (!rate.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429, headers: rate.headers },
      );
    }

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

    const { id: templateId, versionId: sourceVersionId } = await params;

    const source = await db.assessmentTemplateVersion.findUnique({
      where: { id: sourceVersionId },
      select: {
        id: true,
        templateId: true,
        language: true,
        questions: true,
        sections: true,
        scoringConfig: true,
        reportConfig: true,
        contentHash: true,
      },
    });
    if (!source || source.templateId !== templateId) {
      return NextResponse.json(
        { success: false, error: "Source version not found" },
        { status: 404 },
      );
    }

    const maxRow = await db.assessmentTemplateVersion.findFirst({
      where: { templateId, language: source.language },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });
    const nextVersionNumber = (maxRow?.versionNumber ?? 0) + 1;

    const created = await db.assessmentTemplateVersion.create({
      data: {
        templateId,
        versionNumber: nextVersionNumber,
        language: source.language,
        questions: source.questions as Prisma.InputJsonValue,
        sections: source.sections as Prisma.InputJsonValue,
        scoringConfig: source.scoringConfig as Prisma.InputJsonValue,
        reportConfig:
          source.reportConfig === null
            ? Prisma.JsonNull
            : (source.reportConfig as Prisma.InputJsonValue),
        contentHash: source.contentHash,
        publishedAt: null,
        publishedBy: null,
      },
      select: { id: true, versionNumber: true },
    });

    await logAudit({
      entityType: "AssessmentTemplateVersion",
      entityId: created.id,
      action: "CREATE",
      performedBy: actor.email ?? actor.userId,
      changes: {
        duplicatedFromVersionId: sourceVersionId,
        templateId,
        versionNumber: created.versionNumber,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        newVersionId: created.id,
        versionNumber: created.versionNumber,
      },
    });
  } catch (error) {
    console.error("Error duplicating template version:", error);
    return NextResponse.json(
      { success: false, error: "Failed to duplicate version" },
      { status: 500 },
    );
  }
}
