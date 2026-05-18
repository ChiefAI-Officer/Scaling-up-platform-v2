/**
 * Assessment v7.6 — Admin AccessGroup coach-remove route.
 *
 * DELETE removes a coach from an access group. Wrapped in $transaction,
 * runs evaluateAccessChange first. Returns 409 BLOCKED_ZERO_ACCESS with
 * the diff payload if the change would drop a coach to zero effective
 * templates while they own DRAFT/ACTIVE campaigns.
 *
 * Query params:
 *   - force=true        — bypass BLOCKED_ZERO_ACCESS (requires forceReason)
 *   - forceReason=...   — non-empty reason; written to AuditLog.changes
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
  params: Promise<{ id: string; coachId: string }>;
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

    const { id: accessGroupId, coachId } = await context.params;
    const params = request.nextUrl.searchParams;
    const force = params.get("force") === "true";
    const forceReason = params.get("forceReason") ?? undefined;

    // Pre-check membership exists.
    const link = await db.accessGroupCoach.findUnique({
      where: { accessGroupId_coachId: { accessGroupId, coachId } },
      select: { id: true },
    });
    if (!link) {
      return NextResponse.json(
        { success: false, error: "Coach is not in this group" },
        { status: 404 },
      );
    }

    try {
      await db.$transaction(async (tx) => {
        await evaluateAccessChange(tx as unknown as AccessChangeTx, {
          kind: "REMOVE_COACH_FROM_GROUP",
          accessGroupId,
          coachId,
          performedByUserId: actor.userId,
          force,
          forceReason: force ? forceReason : undefined,
        });

        await tx.accessGroupCoach.delete({
          where: { accessGroupId_coachId: { accessGroupId, coachId } },
        });
      });

      return NextResponse.json({ success: true, data: { accessGroupId, coachId } });
    } catch (err) {
      if (err instanceof AccessChangeError) {
        if (err.code === "BLOCKED_ZERO_ACCESS") {
          return NextResponse.json(
            {
              success: false,
              error:
                "Removing this coach would drop them to zero template access while they hold active campaigns",
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
    console.error("Error removing coach from access group:", error);
    return NextResponse.json(
      { success: false, error: "Failed to remove coach" },
      { status: 500 },
    );
  }
}
