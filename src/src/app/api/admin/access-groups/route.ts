/**
 * Assessment v7.6 — Admin AccessGroup list + create routes.
 *
 * Spec refs:
 *  - docs/specs/v7.6/02-service-layer-rules.md — INTERSECTION semantics
 *  - docs/wireframes-phase2/wave5/21-admin-access-groups-list.md
 *
 * Admin/staff only on every method. Coach actors → 403.
 *
 * Partial unique on (name) WHERE deletedAt IS NULL is enforced at the DB
 * via raw SQL migration; we map P2002 → 409 on create.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { logAudit } from "@/lib/audit";

const createSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(120),
  description: z.string().trim().max(2000).optional().nullable(),
});

interface AccessGroupListRow {
  id: string;
  name: string;
  description: string | null;
  deletedAt: Date | null;
  coachCount: number;
  templateCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export async function GET(request: NextRequest) {
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

    const includeArchived =
      request.nextUrl.searchParams.get("includeArchived") === "true";

    const rows = await db.accessGroup.findMany({
      where: includeArchived ? {} : { deletedAt: null },
      select: {
        id: true,
        name: true,
        description: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            coachMembers: true,
            templateAccess: true,
          },
        },
      },
      orderBy: [{ deletedAt: "asc" }, { name: "asc" }],
    });

    const data: AccessGroupListRow[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      deletedAt: r.deletedAt,
      coachCount: r._count.coachMembers,
      templateCount: r._count.templateAccess,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error listing access groups:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list access groups" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
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

    const rawBody = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    // Pre-check active duplicates to surface a clean 409 before relying on
    // the raw SQL partial unique index (which would also catch it).
    const existing = await db.accessGroup.findFirst({
      where: { name: parsed.data.name, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: "An active access group with this name already exists",
          code: "DUPLICATE_NAME",
        },
        { status: 409 },
      );
    }

    try {
      const created = await db.accessGroup.create({
        data: {
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          createdBy: actor.userId,
        },
        select: {
          id: true,
          name: true,
          description: true,
          deletedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await logAudit({
        entityType: "AccessGroup",
        entityId: created.id,
        action: "CREATE",
        performedBy: actor.userId,
        changes: { name: created.name, description: created.description },
      });

      return NextResponse.json(
        { success: true, data: created },
        { status: 201 },
      );
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "An active access group with this name already exists",
            code: "DUPLICATE_NAME",
          },
          { status: 409 },
        );
      }
      throw err;
    }
  } catch (error) {
    console.error("Error creating access group:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create access group" },
      { status: 500 },
    );
  }
}
