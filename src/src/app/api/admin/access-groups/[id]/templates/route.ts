/**
 * Assessment v7.6 — Admin AccessGroup template-add route.
 *
 * POST grants a template to all coaches in the group via INTERSECTION
 * (combined with their other groups). Wrapped in $transaction with
 * evaluateAccessChange (ADD_TEMPLATE_TO_GROUP).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import {
  evaluateAccessChange,
  type AccessChangeTx,
} from "@/lib/assessments/evaluate-access-change";
import { AccessChangeError } from "@/lib/assessments/errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const bodySchema = z.object({
  templateId: z.string().trim().min(1, "templateId required"),
  force: z.boolean().optional(),
  forceReason: z.string().trim().max(500).optional(),
});

export async function POST(request: NextRequest, context: RouteContext) {
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

    const { id: accessGroupId } = await context.params;
    const rawBody = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(rawBody);
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

    const dup = await db.accessGroupTemplate.findUnique({
      where: {
        accessGroupId_templateId: {
          accessGroupId,
          templateId: parsed.data.templateId,
        },
      },
      select: { id: true },
    });
    if (dup) {
      return NextResponse.json(
        {
          success: false,
          error: "Template is already granted to this group",
          code: "DUPLICATE_GRANT",
        },
        { status: 409 },
      );
    }

    try {
      const result = await db.$transaction(async (tx) => {
        await evaluateAccessChange(tx as unknown as AccessChangeTx, {
          kind: "ADD_TEMPLATE_TO_GROUP",
          accessGroupId,
          templateId: parsed.data.templateId,
          performedByUserId: actor.userId,
          force: parsed.data.force,
          forceReason: parsed.data.forceReason,
        });

        return tx.accessGroupTemplate.create({
          data: {
            accessGroupId,
            templateId: parsed.data.templateId,
            addedBy: actor.userId,
          },
          select: {
            id: true,
            accessGroupId: true,
            templateId: true,
            addedAt: true,
            template: {
              select: {
                id: true,
                name: true,
                alias: true,
                aggregationMode: true,
              },
            },
          },
        });
      });

      return NextResponse.json({ success: true, data: result });
    } catch (err) {
      if (err instanceof AccessChangeError) {
        if (err.code === "BLOCKED_ZERO_ACCESS") {
          return NextResponse.json(
            {
              success: false,
              error: "Change would drop coaches to zero access",
              code: err.code,
              details: err.details,
            },
            { status: 409 },
          );
        }
        if (err.code === "INVALID_FORCE_REASON") {
          return NextResponse.json(
            {
              success: false,
              error: "force=true requires a non-empty forceReason",
              code: err.code,
            },
            { status: 400 },
          );
        }
      }
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Template is already granted to this group",
            code: "DUPLICATE_GRANT",
          },
          { status: 409 },
        );
      }
      throw err;
    }
  } catch (error) {
    console.error("Error adding template to access group:", error);
    return NextResponse.json(
      { success: false, error: "Failed to add template" },
      { status: 500 },
    );
  }
}
