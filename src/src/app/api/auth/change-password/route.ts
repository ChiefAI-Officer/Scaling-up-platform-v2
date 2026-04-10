import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { getApiActor } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import { changePasswordSchema } from "@/lib/validations";

export async function POST(request: NextRequest) {
  const rateLimit = await withRateLimit(request, RateLimits.auth);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many password change attempts. Please try again shortly." },
      { status: 429, headers: rateLimit.headers }
    );
  }

  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401, headers: rateLimit.headers }
      );
    }

    // JV-14: Any authenticated user can change their own password

    const body = await request.json();
    const validation = changePasswordSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400, headers: rateLimit.headers }
      );
    }

    const { currentPassword, newPassword } = validation.data;
    if (currentPassword === newPassword) {
      return NextResponse.json(
        { success: false, error: "New password must be different from current password" },
        { status: 400, headers: rateLimit.headers }
      );
    }

    const user = await db.user.findUnique({
      where: { id: actor.userId },
      select: {
        id: true,
        email: true,
        passwordHash: true,
      },
    });

    if (!user?.passwordHash) {
      return NextResponse.json(
        { success: false, error: "Password is not configured for this account" },
        { status: 400, headers: rateLimit.headers }
      );
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash
    );
    if (!isCurrentPasswordValid) {
      return NextResponse.json(
        { success: false, error: "Current password is incorrect" },
        { status: 400, headers: rateLimit.headers }
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await db.$transaction([
      db.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      db.auditLog.create({
        data: {
          entityType: "User",
          entityId: user.id,
          action: "PASSWORD_CHANGE",
          performedBy: actor.email,
          changes: JSON.stringify({
            role: actor.role,
          }),
        },
      }),
    ]);

    return NextResponse.json(
      { success: true, message: "Password updated successfully" },
      { status: 200, headers: rateLimit.headers }
    );
  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update password" },
      { status: 500, headers: rateLimit.headers }
    );
  }
}
