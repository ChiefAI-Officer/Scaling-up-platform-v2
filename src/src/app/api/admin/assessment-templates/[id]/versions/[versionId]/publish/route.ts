/**
 * Assessment v7.6 — Admin publish a draft AssessmentTemplateVersion.
 *
 * Sets publishedAt + publishedBy. Idempotent: 409 if already published.
 * Published versions are immutable by design (no edit route).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { logAudit } from "@/lib/audit";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import { TemplateVersionForPublishSchema } from "@/lib/assessments/scoring";

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

    const { id: templateId, versionId } = await params;

    const version = await db.assessmentTemplateVersion.findUnique({
      where: { id: versionId },
      select: {
        id: true,
        templateId: true,
        publishedAt: true,
        versionNumber: true,
        questions: true,
        sections: true,
        scoringConfig: true,
      },
    });
    if (!version || version.templateId !== templateId) {
      return NextResponse.json(
        { success: false, error: "Version not found" },
        { status: 404 },
      );
    }
    if (version.publishedAt !== null) {
      return NextResponse.json(
        { success: false, error: "ALREADY_PUBLISHED" },
        { status: 409 },
      );
    }

    // D2.1 strict publish-time validation: bands fully cover the scale,
    // sentinel text rejected, domain assignment complete. Existing
    // Rockefeller/QSP templates pass because they don't opt into the new
    // fields; new D2 templates (SU Full) must pass before publishedAt flips.
    const publishParse = TemplateVersionForPublishSchema.safeParse({
      questions: version.questions,
      sections: version.sections,
      scoringConfig: version.scoringConfig,
    });
    if (!publishParse.success) {
      return NextResponse.json(
        {
          success: false,
          error: "PUBLISH_VALIDATION_FAILED",
          issues: publishParse.error.issues,
        },
        { status: 422 },
      );
    }

    const now = new Date();
    await db.assessmentTemplateVersion.update({
      where: { id: versionId },
      data: { publishedAt: now, publishedBy: actor.userId },
    });

    await logAudit({
      entityType: "AssessmentTemplateVersion",
      entityId: versionId,
      action: "UPDATE",
      performedBy: actor.email ?? actor.userId,
      changes: {
        publishedAt: now.toISOString(),
        versionNumber: version.versionNumber,
      },
    });

    return NextResponse.json({
      success: true,
      data: { publishedAt: now.toISOString() },
    });
  } catch (error) {
    console.error("Error publishing template version:", error);
    return NextResponse.json(
      { success: false, error: "Failed to publish version" },
      { status: 500 },
    );
  }
}
