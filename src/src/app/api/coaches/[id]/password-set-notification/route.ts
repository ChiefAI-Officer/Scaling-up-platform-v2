import { NextResponse } from "next/server";
import { getApiActor } from "@/lib/auth/authorization";
import { isCoachPasswordActionsEnabled } from "@/lib/auth/coach-password-actions-flags";
import { db } from "@/lib/db";
import { sendCoachPasswordSetByAdminEmail } from "@/services/notifications";

export async function POST(
  _request: Request,
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
    if (!coach.user || coach.user.deletedAt || coach.user.role !== "COACH") {
      return NextResponse.json(
        {
          success: false,
          error: "This coach does not have an active coach login account",
        },
        { status: 409 },
      );
    }

    await sendCoachPasswordSetByAdminEmail({
      coachEmail: coach.email,
      coachName: `${coach.firstName} ${coach.lastName}`.trim(),
    });

    return NextResponse.json({ success: true, notificationSent: true });
  } catch (error) {
    console.error("Error retrying coach password notification:", error);
    return NextResponse.json(
      { success: false, error: "Failed to send coach notification" },
      { status: 500 },
    );
  }
}
