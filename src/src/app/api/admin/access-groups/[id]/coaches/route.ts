/**
 * Assessment v7.6 — Admin AccessGroup coach-add route.
 *
 * POST adds a coach to the access group. Wrapped in $transaction, runs
 * evaluateAccessChange first (advisory lock + audit trail). For ADD the
 * BLOCKED_ZERO_ACCESS path should not fire, but we surface the typed
 * code if the service ever returns it (safety net).
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
  coachId: z.string().trim().min(1, "coachId required"),
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

    // Pre-check duplicate membership outside the tx for a clean 409.
    const dup = await db.accessGroupCoach.findUnique({
      where: {
        accessGroupId_coachId: {
          accessGroupId,
          coachId: parsed.data.coachId,
        },
      },
      select: { id: true },
    });
    if (dup) {
      return NextResponse.json(
        {
          success: false,
          error: "Coach is already in this group",
          code: "DUPLICATE_MEMBERSHIP",
        },
        { status: 409 },
      );
    }

    try {
      const result = await db.$transaction(async (tx) => {
        await evaluateAccessChange(tx as unknown as AccessChangeTx, {
          kind: "ADD_COACH_TO_GROUP",
          accessGroupId,
          coachId: parsed.data.coachId,
          performedByUserId: actor.userId,
          force: parsed.data.force,
          forceReason: parsed.data.forceReason,
        });

        return tx.accessGroupCoach.create({
          data: {
            accessGroupId,
            coachId: parsed.data.coachId,
            addedBy: actor.userId,
          },
          select: {
            id: true,
            accessGroupId: true,
            coachId: true,
            addedAt: true,
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
            error: "Coach is already in this group",
            code: "DUPLICATE_MEMBERSHIP",
          },
          { status: 409 },
        );
      }
      throw err;
    }
  } catch (error) {
    console.error("Error adding coach to access group:", error);
    return NextResponse.json(
      { success: false, error: "Failed to add coach to access group" },
      { status: 500 },
    );
  }
}
