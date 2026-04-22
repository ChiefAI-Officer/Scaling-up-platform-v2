import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { forgotPasswordSchema } from "@/lib/validations";
import { generatePasswordResetToken } from "@/lib/auth/password-reset";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import { sendEmailViaSMTP } from "@/lib/smtp-transport";

const GENERIC_SUCCESS_MESSAGE =
  "If an account exists for this email, password reset instructions have been sent.";

async function sendPasswordResetEmail(email: string, resetUrl: string) {
  if (process.env.NODE_ENV === "development") {
    console.log(`[PASSWORD RESET] ${email} -> ${resetUrl}`);
    return;
  }

  await sendEmailViaSMTP({
    to: email,
    subject: "Reset your Scaling Up password",
    html: `
      <p>You requested a password reset for your Scaling Up account.</p>
      <p><a href="${resetUrl}">Reset your password</a></p>
      <p>This link expires in 30 minutes.</p>
      <p>If you did not request this, you can ignore this email.</p>
    `,
  });
}

export async function POST(request: NextRequest) {
  const rateLimit = await withRateLimit(request, RateLimits.auth);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Please try again shortly." },
      { status: 429, headers: rateLimit.headers }
    );
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Malformed JSON in request body" },
        { status: 400, headers: rateLimit.headers }
      );
    }
    const parsed = forgotPasswordSchema.safeParse(body);

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

    if (user) {
      const token = generatePasswordResetToken(user.email, user.passwordHash);
      const appUrl = process.env.APP_URL || "http://localhost:3000";
      const resetUrl = `${appUrl}/reset-password?email=${encodeURIComponent(user.email)}&token=${encodeURIComponent(token)}`;

      try {
        await sendPasswordResetEmail(user.email, resetUrl);
      } catch (emailError) {
        console.error("Failed to send password reset email:", emailError);
      }
    }

    return NextResponse.json(
      { success: true, message: GENERIC_SUCCESS_MESSAGE },
      { headers: rateLimit.headers }
    );
  } catch (error) {
    console.error("Forgot password request failed:", error);
    return NextResponse.json(
      { success: false, error: "Unable to process password reset request" },
      { status: 500, headers: rateLimit.headers }
    );
  }
}
