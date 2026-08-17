import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { generatePasswordResetToken } from "@/lib/auth/password-reset";
import { isCoachPasswordActionsEnabled } from "@/lib/auth/coach-password-actions-flags";
import {
  sendCoachPasswordResetEmail,
  sendCoachWelcomeEmail,
} from "@/services/notifications";

export async function POST(
  _request: Request,
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

    const { id } = await params;

    const coach = await db.coach.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!coach) {
      return NextResponse.json({ success: false, error: "Coach not found" }, { status: 404 });
    }

    const enhanced = isCoachPasswordActionsEnabled();
    if (
      enhanced &&
      (!coach.user || coach.user.deletedAt || coach.user.role !== "COACH")
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "This coach does not have an active coach login account",
        },
        { status: 409 },
      );
    }

    const passwordHash = coach.user?.passwordHash ?? null;
    const token = generatePasswordResetToken(
      coach.email,
      passwordHash,
      enhanced ? 15 * 60 : 24 * 60 * 60,
    );
    const baseUrl = process.env.NEXTAUTH_URL || "https://scaling-up-platform-v2.vercel.app";
    const passwordSetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(coach.email)}`;

    const coachName = `${coach.firstName} ${coach.lastName}`.trim();
    if (enhanced) {
      await sendCoachPasswordResetEmail({
        coachEmail: coach.email,
        coachName,
        resetUrl: passwordSetUrl,
        expiresInMinutes: 15,
      });
    } else {
      await sendCoachWelcomeEmail({
        coachEmail: coach.email,
        coachName,
        passwordSetUrl,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error sending password reset:", error);
    return NextResponse.json({ success: false, error: "Failed to send email" }, { status: 500 });
  }
}
