/**
 * Assessment v7.6 — Campaign detail routes.
 * GET: canManageCampaign mode="read" (creator coach OR admin).
 * PATCH: canManageCampaign mode="write" (creator coach with current
 * template+org access OR admin) AND status === DRAFT.
 * DELETE (Wave D, #1): soft-delete (sets deletedAt). Authorization is a
 * DISTINCT ownership predicate — admin/privileged OR the campaign creator
 * coach (createdByCoachId === actor.coachId) — NOT canManageCampaign,
 * because delete is ownership cleanup that must survive a later loss of
 * template/org access. Deletable in ANY state (DRAFT/ACTIVE/CLOSED).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateAssessmentCampaignSchema } from "@/lib/validations";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import {
  asAccessDb,
  canManageCampaign,
} from "@/lib/assessments/access-control";
import { loadLiveCampaign } from "@/lib/assessments/campaign-live";
import { logAudit } from "@/lib/audit";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const allowed = await canManageCampaign(
      asAccessDb(db),
      actor,
      id,
      "read"
    );
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 }
      );
    }

    const campaign = await db.assessmentCampaign.findUnique({
      where: { id },
      include: {
        organization: { select: { id: true, name: true } },
        template: {
          select: { id: true, name: true, alias: true, aggregationMode: true },
        },
        participants: {
          include: {
            respondent: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                jobTitle: true,
              },
            },
          },
        },
      },
    });
    if (!campaign) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: campaign });
  } catch (error) {
    console.error("Error fetching campaign:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch campaign" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimit = await withRateLimit(request, RateLimits.standard);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429, headers: rateLimit.headers }
      );
    }

    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const allowed = await canManageCampaign(
      asAccessDb(db),
      actor,
      id,
      "write"
    );
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 }
      );
    }

    const campaign = await db.assessmentCampaign.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!campaign) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 }
      );
    }
    if (campaign.status === "CLOSED") {
      return NextResponse.json(
        { success: false, error: "Closed campaigns cannot be edited" },
        { status: 409 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const validation = updateAssessmentCampaignSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400 }
      );
    }
    const data = validation.data;

    const updateData: {
      name?: string;
      description?: string | null;
      openAt?: Date;
      endMode?: "OPEN_END" | "ENDS_AFTER";
      closeAt?: Date | null;
      invitationSubject?: string | null;
      invitationBodyMarkdown?: string | null;
    } = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.invitationSubject !== undefined)
      updateData.invitationSubject = data.invitationSubject;
    if (data.invitationBodyMarkdown !== undefined)
      updateData.invitationBodyMarkdown = data.invitationBodyMarkdown;
    if (data.openAt !== undefined) {
      const d = new Date(data.openAt);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json(
          { success: false, error: "openAt must be a valid ISO date" },
          { status: 400 }
        );
      }
      updateData.openAt = d;
    }
    if (data.endMode !== undefined) updateData.endMode = data.endMode;
    if (data.closeAt !== undefined) {
      if (data.closeAt === null) {
        updateData.closeAt = null;
      } else {
        const d = new Date(data.closeAt);
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json(
            { success: false, error: "closeAt must be a valid ISO date" },
            { status: 400 }
          );
        }
        updateData.closeAt = d;
      }
    }

    const updated = await db.assessmentCampaign.update({
      where: { id },
      data: updateData,
    });

    await logAudit({
      entityType: "AssessmentCampaign",
      entityId: id,
      action: "UPDATE",
      performedBy: actor.email,
      changes: updateData as Record<string, unknown>,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating campaign:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update campaign" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimit = await withRateLimit(request, RateLimits.standard);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429, headers: rateLimit.headers }
      );
    }

    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const { id } = await params;

    // Load the LIVE campaign (soft-deleted → null → 404). A deleted or
    // non-existent campaign is treated identically.
    const campaign = await loadLiveCampaign<{
      id: string;
      createdByCoachId: string | null;
      status: "DRAFT" | "ACTIVE" | "CLOSED";
    }>(db.assessmentCampaign, id, {
      select: { id: true, createdByCoachId: true, status: true },
    });
    if (!campaign) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Distinct OWNERSHIP predicate (not canManageCampaign): admin/privileged
    // OR the creator coach. This deliberately ignores current template/org
    // access — delete is ownership cleanup, so a creator coach who later lost
    // template access (H-8 path) can still delete their own campaign.
    const isOwner =
      campaign.createdByCoachId !== null &&
      actor.coachId !== null &&
      campaign.createdByCoachId === actor.coachId;
    if (!isPrivilegedRole(actor.role) && !isOwner) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    // Soft-delete only — responses/invitations are preserved. Deletable in
    // ANY state (DRAFT/ACTIVE/CLOSED).
    await db.assessmentCampaign.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await logAudit({
      entityType: "AssessmentCampaign",
      entityId: id,
      action: "DELETE",
      performedBy: actor.email,
      changes: { softDelete: true, status: campaign.status },
    });

    return NextResponse.json({ success: true, message: "Campaign deleted" });
  } catch (error) {
    console.error("Error deleting campaign:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete campaign" },
      { status: 500 }
    );
  }
}
