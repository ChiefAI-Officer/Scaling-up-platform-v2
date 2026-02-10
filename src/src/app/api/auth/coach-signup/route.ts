import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { RateLimits, withRateLimit } from "@/lib/rate-limit";
import { coachSignupSchema } from "@/lib/validations";

export async function POST(request: NextRequest) {
  const rateLimit = await withRateLimit(request, RateLimits.auth);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many signup attempts. Please try again shortly." },
      { status: 429, headers: rateLimit.headers }
    );
  }

  try {
    const body = await request.json();
    const validation = coachSignupSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400, headers: rateLimit.headers }
      );
    }

    const signupData = validation.data;
    const email = signupData.email.trim().toLowerCase();
    const firstName = signupData.firstName.trim();
    const lastName = signupData.lastName.trim();

    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: "An account with this email already exists" },
        { status: 409, headers: rateLimit.headers }
      );
    }

    const passwordHash = await bcrypt.hash(signupData.password, 12);

    const createdUser = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name: `${firstName} ${lastName}`.trim(),
          role: "COACH",
          passwordHash,
        },
      });

      const existingCoach = await tx.coach.findUnique({ where: { email } });
      if (existingCoach) {
        if (existingCoach.userId && existingCoach.userId !== user.id) {
          throw new Error("Coach profile is already linked to another account");
        }

        await tx.coach.update({
          where: { id: existingCoach.id },
          data: {
            userId: user.id,
            phone: existingCoach.phone || signupData.phone,
            company: existingCoach.company || signupData.company,
          },
        });
      } else {
        await tx.coach.create({
          data: {
            userId: user.id,
            email,
            firstName,
            lastName,
            phone: signupData.phone,
            company: signupData.company,
            certificationStatus: "PENDING",
            paymentStatus: "PENDING",
          },
        });
      }

      await tx.auditLog.create({
        data: {
          entityType: "User",
          entityId: user.id,
          action: "COACH_SIGNUP",
          performedBy: email,
          changes: JSON.stringify({
            role: "COACH",
            profileLinkedByEmail: true,
          }),
        },
      });

      return user;
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: createdUser.id,
          email: createdUser.email,
          role: createdUser.role,
        },
        message: "Coach account created successfully. Please sign in.",
      },
      { status: 201, headers: rateLimit.headers }
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { success: false, error: "An account with this email already exists" },
        { status: 409, headers: rateLimit.headers }
      );
    }

    console.error("Coach signup error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create coach account" },
      { status: 500, headers: rateLimit.headers }
    );
  }
}
