/**
 * Assessment v7.6 — Admin assessment template detail + edit + soft-delete.
 *
 * GET — full template + version list (includes drafts).
 * PATCH — edit metadata only (name, description, invitation email, aggregationMode).
 *         alias is intentionally immutable; content is version-locked.
 * DELETE — soft-delete (sets deletedAt). 409 if any non-DRAFT campaign references this template.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { logAudit } from "@/lib/audit";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";

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
    const template = await db.assessmentTemplate.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        name: true,
        alias: true,
        description: true,
        invitationSubject: true,
        invitationBodyMarkdown: true,
        aggregationMode: true,
        createdAt: true,
        updatedAt: true,
        versions: {
          select: {
            id: true,
            versionNumber: true,
            language: true,
            publishedAt: true,
            publishedBy: true,
            contentHash: true,
            createdAt: true,
          },
          orderBy: [{ versionNumber: "desc" }, { language: "asc" }],
        },
      },
    });
    if (!template) {
      return NextResponse.json(
        { success: false, error: "Template not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: template });
  } catch (error) {
    console.error("Error fetching template:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch template" },
      { status: 500 },
    );
  }
}

const PatchTemplateBodySchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  description: z.string().max(2000).trim().nullable().optional(),
  invitationSubject: z.string().min(1).max(200).trim().optional(),
  invitationBodyMarkdown: z.string().min(1).max(5000).optional(),
  aggregationMode: z.enum(["FULL_VISIBILITY", "CEO_ONLY"]).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = PatchTemplateBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const existing = await db.assessmentTemplate.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Template not found" },
        { status: 404 },
      );
    }

    const data = parsed.data;
    const updateData: {
      name?: string;
      description?: string | null;
      invitationSubject?: string;
      invitationBodyMarkdown?: string;
      aggregationMode?: "FULL_VISIBILITY" | "CEO_ONLY";
    } = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.invitationSubject !== undefined)
      updateData.invitationSubject = data.invitationSubject;
    if (data.invitationBodyMarkdown !== undefined)
      updateData.invitationBodyMarkdown = data.invitationBodyMarkdown;
    if (data.aggregationMode !== undefined)
      updateData.aggregationMode = data.aggregationMode;

    await db.assessmentTemplate.update({ where: { id }, data: updateData });

    await logAudit({
      entityType: "AssessmentTemplate",
      entityId: id,
      action: "UPDATE",
      performedBy: actor.email ?? actor.userId,
      changes: updateData,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating template:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update template" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

    const { id } = await params;

    const existing = await db.assessmentTemplate.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Template not found" },
        { status: 404 },
      );
    }

    // Block soft-delete if any non-CLOSED campaign references this template.
    const activeCampaign = await db.assessmentCampaign.findFirst({
      where: { templateId: id, status: { in: ["DRAFT", "ACTIVE"] } },
      select: { id: true },
    });
    if (activeCampaign) {
      return NextResponse.json(
        {
          success: false,
          error: "TEMPLATE_HAS_ACTIVE_CAMPAIGNS",
        },
        { status: 409 },
      );
    }

    await db.assessmentTemplate.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await logAudit({
      entityType: "AssessmentTemplate",
      entityId: id,
      action: "DELETE",
      performedBy: actor.email ?? actor.userId,
      changes: { softDelete: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error soft-deleting template:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete template" },
      { status: 500 },
    );
  }
}
