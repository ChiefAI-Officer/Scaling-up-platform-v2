import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { resetPasswordSchema } from "@/lib/validations";
import { verifyPasswordResetToken } from "@/lib/auth/password-reset";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";

const INVALID_RESET_MESSAGE = "Reset link is invalid or has expired";

export async function POST(request: NextRequest) {
  const rateLimit = await withRateLimit(request, RateLimits.auth);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again shortly." },
      { status: 429, headers: rateLimit.headers }
    );
  }

  try {
    const body = await request.json();
    const parsed = resetPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues },
        { status: 400, headers: rateLimit.headers }
      );
    }

    const email = parsed.data.email.toLowerCase();
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: INVALID_RESET_MESSAGE },
        { status: 400, headers: rateLimit.headers }
      );
    }

    const isValidToken = verifyPasswordResetToken(
      parsed.data.token,
      user.email,
      user.passwordHash
    );

    if (!isValidToken) {
      return NextResponse.json(
        { success: false, error: INVALID_RESET_MESSAGE },
        { status: 400, headers: rateLimit.headers }
      );
    }

    const nextPasswordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: nextPasswordHash },
    });

    return NextResponse.json(
      { success: true, message: "Password has been reset successfully." },
      { headers: rateLimit.headers }
    );
  } catch (error) {
    console.error("Reset password request failed:", error);
    return NextResponse.json(
      { success: false, error: "Unable to reset password" },
      { status: 500, headers: rateLimit.headers }
    );
  }
}
