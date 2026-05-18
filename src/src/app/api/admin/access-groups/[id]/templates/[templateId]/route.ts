/**
 * Assessment v7.6 — Admin AccessGroup template-remove route.
 *
 * DELETE revokes a template grant from the group. Wrapped in $transaction
 * with evaluateAccessChange (REMOVE_TEMPLATE_FROM_GROUP). 409
 * BLOCKED_ZERO_ACCESS if any coach in the group would drop to zero
 * effective templates and owns DRAFT/ACTIVE campaigns.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import {
  evaluateAccessChange,
  type AccessChangeTx,
} from "@/lib/assessments/evaluate-access-change";
import { AccessChangeError } from "@/lib/assessments/errors";

interface RouteContext {
  params: Promise<{ id: string; templateId: string }>;
}

export async function DELETE(request: NextRequest, context: RouteContext) {
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

    const { id: accessGroupId, templateId } = await context.params;
    const params = request.nextUrl.searchParams;
    const force = params.get("force") === "true";
    const forceReason = params.get("forceReason") ?? undefined;

    const link = await db.accessGroupTemplate.findUnique({
      where: {
        accessGroupId_templateId: { accessGroupId, templateId },
      },
      select: { id: true },
    });
    if (!link) {
      return NextResponse.json(
        { success: false, error: "Template is not in this group" },
        { status: 404 },
      );
    }

    try {
      await db.$transaction(async (tx) => {
        await evaluateAccessChange(tx as unknown as AccessChangeTx, {
          kind: "REMOVE_TEMPLATE_FROM_GROUP",
          accessGroupId,
          templateId,
          performedByUserId: actor.userId,
          force,
          forceReason: force ? forceReason : undefined,
        });

        await tx.accessGroupTemplate.delete({
          where: {
            accessGroupId_templateId: { accessGroupId, templateId },
          },
        });
      });

      return NextResponse.json({
        success: true,
        data: { accessGroupId, templateId },
      });
    } catch (err) {
      if (err instanceof AccessChangeError) {
        if (err.code === "BLOCKED_ZERO_ACCESS") {
          return NextResponse.json(
            {
              success: false,
              error:
                "Removing this template would drop one or more coaches to zero access while they hold active campaigns",
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
      throw err;
    }
  } catch (error) {
    console.error("Error removing template from access group:", error);
    return NextResponse.json(
      { success: false, error: "Failed to remove template" },
      { status: 500 },
    );
  }
}
