/**
 * Assessment v7.6 — Respondent detail routes.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateRespondentSchema } from "@/lib/validations";
// Reuse the SAME normalizeEmail the create/bulk paths use so an email edit
// computes normalizedEmail / dedupe identically (#60). Already the established
// cross-route import convention (bulk/route.ts, assessment-campaigns/route.ts).
import { normalizeEmail } from "@/app/api/organizations/[id]/respondents/route";
import { getApiActor } from "@/lib/auth/authorization";
import {
  canAccessOrganization,
  asAccessDb,
} from "@/lib/assessments/access-control";
import { logAudit } from "@/lib/audit";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; respondentId: string }> }
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

    const { id: organizationId, respondentId } = await params;
    const allowed = await canAccessOrganization(
      asAccessDb(db),
      actor,
      organizationId
    );
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 }
      );
    }

    const existing = await db.orgRespondent.findUnique({
      where: { id: respondentId },
    });
    if (
      !existing ||
      existing.organizationId !== organizationId ||
      existing.deletedAt !== null
    ) {
      return NextResponse.json(
        { success: false, error: "Respondent not found" },
        { status: 404 }
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

    const validation = updateRespondentSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Validate teamId if changed.
    if (data.teamId !== undefined && data.teamId !== null) {
      const team = await db.orgTeam.findUnique({
        where: { id: data.teamId },
      });
      if (
        !team ||
        team.organizationId !== organizationId ||
        team.deletedAt !== null
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "teamId does not belong to this organization",
          },
          { status: 400 }
        );
      }
    }

    const updateData: {
      email?: string;
      normalizedEmail?: string;
      dedupeValue?: string;
      firstName?: string;
      lastName?: string;
      jobTitle?: string | null;
      teamId?: string | null;
      roleType?: string | null;
    } = {};
    if (data.email !== undefined) {
      const normalizedEmail = normalizeEmail(data.email);
      updateData.email = data.email;
      updateData.normalizedEmail = normalizedEmail;
      // The dedupe key is email-derived ONLY for email-sourced members
      // (dedupeSource === "email"). For externalId-sourced members it stays
      // externalId-based, so an email edit must NOT shift the dedupe key (#60).
      if (existing.dedupeSource === "email") {
        updateData.dedupeValue = normalizedEmail;
      }
    }
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.jobTitle !== undefined)
      updateData.jobTitle = data.jobTitle ?? null;
    if (data.teamId !== undefined) updateData.teamId = data.teamId ?? null;
    if (data.roleType !== undefined) updateData.roleType = data.roleType;

    let respondent;
    try {
      respondent = await db.orgRespondent.update({
        where: { id: respondentId },
        data: updateData,
      });
    } catch (error) {
      // A changed email can collide with another member's dedupe key in the
      // same org (@@unique([organizationId, dedupeSource, dedupeValue])) — mirror
      // the create route: surface a 409 rather than a raw 500 (#60).
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: string }).code === "P2002"
      ) {
        const conflict = await db.orgRespondent.findFirst({
          where: {
            organizationId,
            dedupeSource: existing.dedupeSource,
            dedupeValue: updateData.dedupeValue ?? existing.dedupeValue,
          },
        });
        return NextResponse.json(
          {
            success: false,
            error:
              "A member with this email already exists for this organization.",
            existingId: conflict?.id ?? null,
          },
          { status: 409 }
        );
      }
      throw error;
    }

    await logAudit({
      entityType: "OrgRespondent",
      entityId: respondentId,
      action: "UPDATE",
      performedBy: actor.email,
      changes: updateData as Record<string, unknown>,
    });

    return NextResponse.json({ success: true, data: respondent });
  } catch (error) {
    console.error("Error updating respondent:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update respondent" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; respondentId: string }> }
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

    const { id: organizationId, respondentId } = await params;
    const allowed = await canAccessOrganization(
      asAccessDb(db),
      actor,
      organizationId
    );
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 }
      );
    }

    const existing = await db.orgRespondent.findUnique({
      where: { id: respondentId },
    });
    if (
      !existing ||
      existing.organizationId !== organizationId ||
      existing.deletedAt !== null
    ) {
      return NextResponse.json(
        { success: false, error: "Respondent not found" },
        { status: 404 }
      );
    }

    await db.orgRespondent.update({
      where: { id: respondentId },
      data: { deletedAt: new Date() },
    });

    await logAudit({
      entityType: "OrgRespondent",
      entityId: respondentId,
      action: "DELETE",
      performedBy: actor.email,
    });

    return NextResponse.json({ success: true, message: "Respondent deleted" });
  } catch (error) {
    console.error("Error deleting respondent:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete respondent" },
      { status: 500 }
    );
  }
}
