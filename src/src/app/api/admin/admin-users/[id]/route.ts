import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { isCanonicalAdminEmail } from "@/lib/auth/auth";
import { isWaveQAdminControlsEnabled } from "@/lib/assessments/wave-q-flags";

/**
 * Wave Q (#7, ADR-0018) — DELETE /api/admin/admin-users/[id]
 *
 * The REMOVE capability (the ONLY flag-gated piece of admin offboarding —
 * enforcement of an already-set deletedAt is unconditional elsewhere).
 * Soft-removes an ADMIN/STAFF user: sets `deletedAt`, deletes their
 * AdminInvite row (aligns the login invite guard AND frees the email for
 * re-invite), and audit-logs ADMIN_USER_REMOVED — in ONE transaction.
 *
 * Hybrid accounts (coach profile present) ARE removable: "left the company"
 * locks the whole account; the coach profile row and its data stay untouched.
 */
export async function DELETE(
  _request: NextRequest,
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
    if (actor.role !== "ADMIN") {
      return NextResponse.json(
        { success: false, error: "Admin access required" },
        { status: 403 }
      );
    }

    if (!isWaveQAdminControlsEnabled()) {
      return NextResponse.json(
        { success: false, error: "Admin removal is not enabled" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const target = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        deletedAt: true,
        coachProfile: { select: { id: true } },
      },
    });

    if (!target || target.deletedAt) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    if (target.role !== "ADMIN" && target.role !== "STAFF") {
      return NextResponse.json(
        { success: false, error: "Only admin or staff accounts can be removed here" },
        { status: 400 }
      );
    }

    if (target.id === actor.userId) {
      return NextResponse.json(
        { success: false, error: "You cannot remove your own account" },
        { status: 400 }
      );
    }

    if (isCanonicalAdminEmail(target.email)) {
      return NextResponse.json(
        { success: false, error: "The canonical admin account cannot be removed" },
        { status: 400 }
      );
    }

    const hadCoachProfile = target.coachProfile !== null;

    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: target.id },
        data: { deletedAt: new Date() },
      });

      // Aligns the auth.ts invite guard and frees the email for re-invite
      // (revive-on-accept, ADR-0018).
      await tx.adminInvite.deleteMany({
        where: { email: target.email.toLowerCase() },
      });

      await tx.auditLog.create({
        data: {
          entityType: "User",
          entityId: target.id,
          action: "ADMIN_USER_REMOVED",
          performedBy: actor.email,
          changes: JSON.stringify({
            removedEmail: target.email,
            removedRole: target.role,
            hadCoachProfile,
          }),
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing admin user:", error);
    return NextResponse.json(
      { success: false, error: "Failed to remove admin user" },
      { status: 500 }
    );
  }
}
