/**
 * Assessment v7.6 — Admin draft AssessmentTemplateVersion fetch + edit.
 *
 * GET — returns the full version row (content + metadata). Used by the
 *       version editor page (both draft + published, but only drafts are
 *       editable).
 * PATCH — edit content on a DRAFT version. 409 ALREADY_PUBLISHED on a
 *         published version (content is immutable post-publish). Recomputes
 *         contentHash so the audit trail stays valid across edits.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { logAudit } from "@/lib/audit";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import { computeTemplateContentHash } from "@/lib/assessments/template-content-hash";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
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

    const { id: templateId, versionId } = await params;
    const [version, template] = await Promise.all([
      db.assessmentTemplateVersion.findUnique({
        where: { id: versionId },
        select: {
          id: true,
          templateId: true,
          versionNumber: true,
          language: true,
          questions: true,
          sections: true,
          scoringConfig: true,
          reportConfig: true,
          publishedAt: true,
          contentHash: true,
        },
      }),
      db.assessmentTemplate.findUnique({
        where: { id: templateId },
        select: {
          id: true,
          name: true,
          alias: true,
          invitationSubject: true,
          invitationBodyMarkdown: true,
        },
      }),
    ]);
    if (!version || version.templateId !== templateId || !template) {
      return NextResponse.json(
        { success: false, error: "Version not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({
      success: true,
      data: { version, template },
    });
  } catch (error) {
    console.error("Error fetching template version:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch version" },
      { status: 500 },
    );
  }
}

const PatchVersionBodySchema = z.object({
  questions: z.array(z.unknown()),
  sections: z.array(z.unknown()),
  scoringConfig: z.unknown(),
  reportConfig: z.unknown().optional().nullable(),
  // F2 (Checkpoint 1b) — language edits originate from the Metadata tab
  // (per WF16 — labelled "Language (this version)"). Optional so existing
  // callers that only patch content stay byte-compatible.
  language: z.string().min(2).max(20).optional(),
});

export async function PATCH(
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
    const body = await request.json().catch(() => ({}));
    const parsed = PatchVersionBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const [version, template] = await Promise.all([
      db.assessmentTemplateVersion.findUnique({
        where: { id: versionId },
        select: { templateId: true, publishedAt: true },
      }),
      db.assessmentTemplate.findUnique({
        where: { id: templateId },
        select: {
          invitationSubject: true,
          invitationBodyMarkdown: true,
        },
      }),
    ]);
    if (!version || version.templateId !== templateId || !template) {
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

    const data = parsed.data;
    const contentHash = computeTemplateContentHash({
      questions: data.questions,
      sections: data.sections,
      scoringConfig: data.scoringConfig,
      reportConfig: data.reportConfig ?? null,
      invitationSubject: template.invitationSubject,
      invitationBodyMarkdown: template.invitationBodyMarkdown,
    });

    const updatePayload: {
      questions: Prisma.InputJsonValue;
      sections: Prisma.InputJsonValue;
      scoringConfig: Prisma.InputJsonValue;
      reportConfig: Prisma.InputJsonValue | typeof Prisma.JsonNull;
      contentHash: string;
      language?: string;
    } = {
      questions: data.questions as Prisma.InputJsonValue,
      sections: data.sections as Prisma.InputJsonValue,
      scoringConfig: data.scoringConfig as Prisma.InputJsonValue,
      reportConfig:
        data.reportConfig === null || data.reportConfig === undefined
          ? Prisma.JsonNull
          : (data.reportConfig as Prisma.InputJsonValue),
      contentHash,
    };
    if (data.language !== undefined) {
      updatePayload.language = data.language;
    }

    await db.assessmentTemplateVersion.update({
      where: { id: versionId },
      data: updatePayload,
    });

    await logAudit({
      entityType: "AssessmentTemplateVersion",
      entityId: versionId,
      action: "UPDATE",
      performedBy: actor.email ?? actor.userId,
      changes: { contentEdited: true, contentHash },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating template version:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update version" },
      { status: 500 },
    );
  }
}
