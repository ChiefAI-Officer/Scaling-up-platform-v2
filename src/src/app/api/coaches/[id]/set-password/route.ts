import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getApiActor } from "@/lib/auth/authorization";
import { isCoachPasswordActionsEnabled } from "@/lib/auth/coach-password-actions-flags";
import { rotateUserPassword } from "@/lib/auth/password-credentials";
import { db } from "@/lib/db";
import { adminSetCoachPasswordSchema } from "@/lib/validations";
import { sendCoachPasswordSetByAdminEmail } from "@/services/notifications";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isCoachPasswordActionsEnabled()) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }
    if (actor.role !== "ADMIN") {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const coach = await db.coach.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!coach) {
      return NextResponse.json(
        { success: false, error: "Coach not found" },
        { status: 404 },
      );
    }
    const targetUser = coach.user;
    if (!targetUser || targetUser.deletedAt || targetUser.role !== "COACH") {
      return NextResponse.json(
        {
          success: false,
          error: "This coach does not have an active coach login account",
        },
        { status: 409 },
      );
    }

    const validation = adminSetCoachPasswordSchema.safeParse(await request.json());
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(validation.data.newPassword, 12);
    await db.$transaction((tx) =>
      rotateUserPassword(tx, {
        userId: targetUser.id,
        passwordHash,
        action: "ADMIN_PASSWORD_SET",
        performedBy: actor.email,
        changes: { coachId: coach.id, role: "COACH" },
      }),
    );

    try {
      await sendCoachPasswordSetByAdminEmail({
        coachEmail: coach.email,
        coachName: `${coach.firstName} ${coach.lastName}`.trim(),
      });
    } catch (notificationError) {
      console.error("Coach password was updated but notification failed:", notificationError);
      return NextResponse.json({
        success: true,
        passwordUpdated: true,
        notificationSent: false,
        warning: "Password updated, but the coach notification could not be sent. Retry the notification.",
      });
    }

    return NextResponse.json({
      success: true,
      passwordUpdated: true,
      notificationSent: true,
    });
  } catch (error) {
    console.error("Error setting coach password:", error);
    return NextResponse.json(
      { success: false, error: "Failed to set coach password" },
      { status: 500 },
    );
  }
}
