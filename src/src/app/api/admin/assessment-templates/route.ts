/**
 * Assessment v7.6 — Admin assessment template list + create.
 *
 * GET — Admin-only list of all non-deleted templates (bypasses INTERSECTION RBAC).
 * POST — Admin-only create: metadata + first AssessmentTemplateVersion (draft, publishedAt=null).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { logAudit } from "@/lib/audit";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import { computeTemplateContentHash } from "@/lib/assessments/template-content-hash";

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

const CreateTemplateBodySchema = z.object({
  name: z.string().min(1).max(200).trim(),
  alias: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "alias must be lowercase alphanumeric with dashes"),
  description: z.string().max(2000).trim().nullable().optional(),
  invitationSubject: z.string().min(1).max(200).trim(),
  invitationBodyMarkdown: z.string().min(1).max(5000),
  aggregationMode: z.enum(["FULL_VISIBILITY", "CEO_ONLY"]).default("FULL_VISIBILITY"),
  language: z.string().min(2).max(8).default("en"),
  // Content blobs — server validates only that they parse as JSON. Deeper
  // shape validation lives in the runtime scoring engine; we accept any
  // object shape here because the MVP admin paste-flow surfaces validation
  // errors at first-campaign-submit time.
  questions: z.array(z.unknown()),
  sections: z.array(z.unknown()),
  scoringConfig: z.unknown(),
  reportConfig: z.unknown().optional().nullable(),
});

export async function POST(request: NextRequest) {
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

    const body = await request.json().catch(() => ({}));
    const parsed = CreateTemplateBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const data = parsed.data;

    const contentHash = computeTemplateContentHash({
      questions: data.questions,
      sections: data.sections,
      scoringConfig: data.scoringConfig,
      reportConfig: data.reportConfig ?? null,
      invitationSubject: data.invitationSubject,
      invitationBodyMarkdown: data.invitationBodyMarkdown,
    });

    try {
      const template = await db.$transaction(async (tx) => {
        const tpl = await tx.assessmentTemplate.create({
          data: {
            name: data.name,
            alias: data.alias,
            description: data.description ?? null,
            invitationSubject: data.invitationSubject,
            invitationBodyMarkdown: data.invitationBodyMarkdown,
            aggregationMode: data.aggregationMode,
            createdBy: actor.userId,
          },
          select: { id: true, alias: true },
        });
        await tx.assessmentTemplateVersion.create({
          data: {
            templateId: tpl.id,
            versionNumber: 1,
            language: data.language,
            questions: data.questions as Prisma.InputJsonValue,
            sections: data.sections as Prisma.InputJsonValue,
            scoringConfig: data.scoringConfig as Prisma.InputJsonValue,
            reportConfig:
              data.reportConfig === null || data.reportConfig === undefined
                ? Prisma.JsonNull
                : (data.reportConfig as Prisma.InputJsonValue),
            contentHash,
            publishedAt: null,
            publishedBy: null,
          },
        });
        return tpl;
      });

      await logAudit({
        entityType: "AssessmentTemplate",
        entityId: template.id,
        action: "CREATE",
        performedBy: actor.email ?? actor.userId,
        changes: { alias: template.alias, contentHash, language: data.language },
      });

      return NextResponse.json(
        { success: true, data: { id: template.id, alias: template.alias } },
        { status: 201 },
      );
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: string }).code === "P2002"
      ) {
        return NextResponse.json(
          { success: false, error: "alias already in use" },
          { status: 409 },
        );
      }
      throw error;
    }
  } catch (error) {
    console.error("Error creating template:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create template" },
      { status: 500 },
    );
  }
}
