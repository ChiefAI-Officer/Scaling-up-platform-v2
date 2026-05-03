import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { generatePasswordResetToken } from "@/lib/auth/password-reset";
import { sendCoachWelcomeEmail } from "@/services/notifications";

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

    const passwordHash = coach.user?.passwordHash ?? null;
    const token = generatePasswordResetToken(coach.email, passwordHash, 24 * 60 * 60);
    const baseUrl = process.env.NEXTAUTH_URL || "https://scaling-up-platform-v2.vercel.app";
    const passwordSetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(coach.email)}`;

    await sendCoachWelcomeEmail({
      coachEmail: coach.email,
      coachName: `${coach.firstName} ${coach.lastName}`,
      passwordSetUrl,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error sending password reset:", error);
    return NextResponse.json({ success: false, error: "Failed to send email" }, { status: 500 });
  }
}
