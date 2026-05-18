/**
 * Assessment v7.6 — Admin AccessGroup detail + PATCH.
 *
 * Spec refs:
 *  - docs/wireframes-phase2/wave5/22-admin-access-group-detail.md
 *
 * Admin/staff only. Returns the full membership graph. Excludes soft-deleted
 * groups unless ?includeArchived=true.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { logAudit } from "@/lib/audit";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2000).optional().nullable(),
  })
  .refine(
    (v) => v.name !== undefined || v.description !== undefined,
    "at least one field is required",
  );

export async function GET(request: NextRequest, context: RouteContext) {
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

    const { id } = await context.params;
    const includeArchived =
      request.nextUrl.searchParams.get("includeArchived") === "true";

    const group = await db.accessGroup.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        accessPolicyVersion: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        creator: { select: { id: true, email: true, name: true } },
        coachMembers: {
          select: {
            id: true,
            accessGroupId: true,
            coachId: true,
            addedAt: true,
            addedBy: true,
            coach: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                certificationStatus: true,
              },
            },
          },
          orderBy: { addedAt: "desc" },
        },
        templateAccess: {
          select: {
            id: true,
            accessGroupId: true,
            templateId: true,
            addedAt: true,
            addedBy: true,
            template: {
              select: {
                id: true,
                name: true,
                alias: true,
                aggregationMode: true,
                deletedAt: true,
              },
            },
          },
          orderBy: { addedAt: "desc" },
        },
      },
    });

    if (!group) {
      return NextResponse.json(
        { success: false, error: "Access group not found" },
        { status: 404 },
      );
    }

    if (group.deletedAt && !includeArchived) {
      return NextResponse.json(
        { success: false, error: "Access group not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: group });
  } catch (error) {
    console.error("Error fetching access group:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch access group" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
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

    const { id } = await context.params;
    const rawBody = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(rawBody);
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

    const existing = await db.accessGroup.findUnique({
      where: { id },
      select: { id: true, deletedAt: true, name: true, description: true },
    });
    if (!existing || existing.deletedAt) {
      return NextResponse.json(
        { success: false, error: "Access group not found" },
        { status: 404 },
      );
    }

    try {
      const updated = await db.accessGroup.update({
        where: { id },
        data: {
          ...(parsed.data.name !== undefined && { name: parsed.data.name }),
          ...(parsed.data.description !== undefined && {
            description: parsed.data.description,
          }),
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
        entityId: id,
        action: "UPDATE",
        performedBy: actor.userId,
        changes: {
          before: { name: existing.name, description: existing.description },
          after: { name: updated.name, description: updated.description },
        },
      });

      return NextResponse.json({ success: true, data: updated });
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
    console.error("Error updating access group:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update access group" },
      { status: 500 },
    );
  }
}
