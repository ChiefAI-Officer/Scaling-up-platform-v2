/**
 * Assessment v7.6 — Team detail routes.
 * PATCH validates against cycles when changing parentTeamId.
 * DELETE refuses 409 if team has non-deleted children.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateTeamSchema } from "@/lib/validations";
import { getApiActor } from "@/lib/auth/authorization";
import {
  canAccessOrganization,
  asAccessDb,
} from "@/lib/assessments/access-control";
import { logAudit } from "@/lib/audit";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";

interface TeamFlat {
  id: string;
  organizationId: string;
  parentTeamId: string | null;
  deletedAt: Date | null;
}

/**
 * Walk DOWN from `rootId` and return all descendant ids (excluding root).
 * Soft-deleted teams are included in the walk for safety — we still must
 * not create a cycle through them.
 */
async function getDescendantIds(
  organizationId: string,
  rootId: string
): Promise<Set<string>> {
  const all = (await db.orgTeam.findMany({
    where: { organizationId },
    select: { id: true, parentTeamId: true },
  })) as Array<{ id: string; parentTeamId: string | null }>;
  const childrenByParent = new Map<string, string[]>();
  for (const t of all) {
    if (!t.parentTeamId) continue;
    const arr = childrenByParent.get(t.parentTeamId) ?? [];
    arr.push(t.id);
    childrenByParent.set(t.parentTeamId, arr);
  }
  const result = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const children = childrenByParent.get(current) ?? [];
    for (const childId of children) {
      if (!result.has(childId)) {
        result.add(childId);
        stack.push(childId);
      }
    }
  }
  return result;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; teamId: string }> }
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

    const { id: organizationId, teamId } = await params;
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

    const existing = (await db.orgTeam.findUnique({
      where: { id: teamId },
    })) as TeamFlat | null;
    if (
      !existing ||
      existing.organizationId !== organizationId ||
      existing.deletedAt !== null
    ) {
      return NextResponse.json(
        { success: false, error: "Team not found" },
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

    const validation = updateTeamSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Validate parentTeamId change.
    if (data.parentTeamId !== undefined) {
      if (data.parentTeamId !== null) {
        if (data.parentTeamId === teamId) {
          return NextResponse.json(
            {
              success: false,
              error: "A team cannot be its own parent",
            },
            { status: 400 }
          );
        }
        const parent = await db.orgTeam.findUnique({
          where: { id: data.parentTeamId },
        });
        if (
          !parent ||
          parent.organizationId !== organizationId ||
          parent.deletedAt !== null
        ) {
          return NextResponse.json(
            {
              success: false,
              error: "parentTeamId does not belong to this organization",
            },
            { status: 400 }
          );
        }
        // Cycle check: new parent must not be a descendant of this team.
        const descendants = await getDescendantIds(organizationId, teamId);
        if (descendants.has(data.parentTeamId)) {
          return NextResponse.json(
            {
              success: false,
              error: "parentTeamId would create a team-hierarchy cycle",
            },
            { status: 400 }
          );
        }
      }
    }

    const updateData: {
      name?: string;
      type?: string | null;
      description?: string | null;
      parentTeamId?: string | null;
    } = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.type !== undefined) updateData.type = data.type ?? null;
    if (data.description !== undefined)
      updateData.description = data.description ?? null;
    if (data.parentTeamId !== undefined)
      updateData.parentTeamId = data.parentTeamId ?? null;

    const team = await db.orgTeam.update({
      where: { id: teamId },
      data: updateData,
    });

    await logAudit({
      entityType: "OrgTeam",
      entityId: teamId,
      action: "UPDATE",
      performedBy: actor.email,
      changes: updateData as Record<string, unknown>,
    });

    return NextResponse.json({ success: true, data: team });
  } catch (error) {
    console.error("Error updating team:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update team" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; teamId: string }> }
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

    const { id: organizationId, teamId } = await params;
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

    const existing = (await db.orgTeam.findUnique({
      where: { id: teamId },
    })) as TeamFlat | null;
    if (
      !existing ||
      existing.organizationId !== organizationId ||
      existing.deletedAt !== null
    ) {
      return NextResponse.json(
        { success: false, error: "Team not found" },
        { status: 404 }
      );
    }

    const childCount = await db.orgTeam.count({
      where: {
        organizationId,
        parentTeamId: teamId,
        deletedAt: null,
      },
    });
    if (childCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Team has child teams. Soft-delete child teams first before deleting their parent.",
        },
        { status: 409 }
      );
    }

    await db.orgTeam.update({
      where: { id: teamId },
      data: { deletedAt: new Date() },
    });

    await logAudit({
      entityType: "OrgTeam",
      entityId: teamId,
      action: "DELETE",
      performedBy: actor.email,
    });

    return NextResponse.json({ success: true, message: "Team deleted" });
  } catch (error) {
    console.error("Error deleting team:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete team" },
      { status: 500 }
    );
  }
}
