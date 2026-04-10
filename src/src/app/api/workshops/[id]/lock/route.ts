import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { z } from "zod";

const lockWorkshopParamsSchema = z.object({
  id: z.string().min(1, "Workshop id is required"),
});

const lockWorkshopBodySchema = z.object({
  locked: z.boolean(),
});

/**
 * POST /api/workshops/[id]/lock
 * Lock or unlock a workshop. Admin-only.
 *
 * Body: { locked: boolean }
 *
 * S3-08: Workshop locking (48h before event).
 * Auto-lock happens via the check in workshop detail pages;
 * this endpoint allows manual lock/unlock by admins.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }
    if (!isPrivilegedRole(actor.role)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const paramsValidation = lockWorkshopParamsSchema.safeParse(await params);
    if (!paramsValidation.success) {
      return NextResponse.json(
        { success: false, error: "Invalid workshop id", details: paramsValidation.error.issues },
        { status: 400 }
      );
    }

    const bodyValidation = lockWorkshopBodySchema.safeParse(await request.json());
    if (!bodyValidation.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request body", details: bodyValidation.error.issues },
        { status: 400 }
      );
    }

    const { id } = paramsValidation.data;
    const { locked } = bodyValidation.data;

    const workshop = await db.workshop.findUnique({
      where: { id },
      select: { id: true, isLocked: true },
    });

    if (!workshop) {
      return NextResponse.json({ success: false, error: "Workshop not found" }, { status: 404 });
    }

    const updated = await db.workshop.update({
      where: { id },
      data: {
        isLocked: !!locked,
        lockedAt: locked ? new Date() : null,
        lockedBy: locked ? actor.userId : null,
      },
    });

    return NextResponse.json({
      success: true,
      data: { isLocked: updated.isLocked, lockedAt: updated.lockedAt },
    });
  } catch (error) {
    console.error("Workshop lock error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update lock status" },
      { status: 500 }
    );
  }
}
