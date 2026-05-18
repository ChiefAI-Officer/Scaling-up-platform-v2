/**
 * Assessment v7.6 — Team collection routes.
 * Tree-shaped GET response, recursive parent validation on POST.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createTeamSchema } from "@/lib/validations";
import { getApiActor } from "@/lib/auth/authorization";
import {
  canAccessOrganization,
  asAccessDb,
} from "@/lib/assessments/access-control";
import { logAudit } from "@/lib/audit";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";

interface TeamRow {
  id: string;
  organizationId: string;
  parentTeamId: string | null;
  name: string;
  type: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface TeamNode extends TeamRow {
  children: TeamNode[];
}

/**
 * Build a forest (array of root nodes) from a flat list of teams.
 * Teams with parentTeamId pointing at a soft-deleted/missing parent
 * are surfaced as roots so they don't disappear.
 */
export function buildTeamTree(rows: TeamRow[]): TeamNode[] {
  const nodeById = new Map<string, TeamNode>();
  for (const r of rows) {
    nodeById.set(r.id, { ...r, children: [] });
  }
  const roots: TeamNode[] = [];
  for (const node of nodeById.values()) {
    if (node.parentTeamId && nodeById.has(node.parentTeamId)) {
      nodeById.get(node.parentTeamId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  // Stable ordering by name.
  const sortRec = (nodes: TeamNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

export async function GET(
  request: NextRequest,
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

    const { id: organizationId } = await params;
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

    const teams = (await db.orgTeam.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { name: "asc" },
    })) as TeamRow[];

    return NextResponse.json({
      success: true,
      data: buildTeamTree(teams),
    });
  } catch (error) {
    console.error("Error listing teams:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list teams" },
      { status: 500 }
    );
  }
}

export async function POST(
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

    const { id: organizationId } = await params;
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const validation = createTeamSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Validate parentTeamId belongs to this org and is not soft-deleted.
    if (data.parentTeamId) {
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
    }

    const team = await db.orgTeam.create({
      data: {
        organizationId,
        name: data.name,
        type: data.type ?? null,
        description: data.description ?? null,
        parentTeamId: data.parentTeamId ?? null,
      },
    });

    await logAudit({
      entityType: "OrgTeam",
      entityId: team.id,
      action: "CREATE",
      performedBy: actor.email,
      changes: {
        organizationId,
        name: team.name,
        parentTeamId: team.parentTeamId,
      },
    });

    return NextResponse.json(
      { success: true, data: team },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating team:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create team" },
      { status: 500 }
    );
  }
}
