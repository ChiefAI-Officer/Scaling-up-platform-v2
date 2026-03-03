import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { acceptInviteSchema } from "@/lib/validations";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = acceptInviteSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400 }
      );
    }

    const { email, token, name, password } = validation.data;
    const normalizedEmail = email.toLowerCase();

    const invite = await db.adminInvite.findUnique({
      where: { email: normalizedEmail },
    });

    if (!invite) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired invitation" },
        { status: 400 }
      );
    }

    if (invite.token !== token) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired invitation" },
        { status: 400 }
      );
    }

    if (invite.acceptedAt) {
      return NextResponse.json(
        { success: false, error: "This invitation has already been accepted" },
        { status: 400 }
      );
    }

    if (new Date() > invite.expiresAt) {
      return NextResponse.json(
        { success: false, error: "This invitation has expired. Please request a new one." },
        { status: 400 }
      );
    }

    // Check no existing user with this email
    const existingUser = await db.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: "An account with this email already exists" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await db.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          email: normalizedEmail,
          name,
          role: "ADMIN",
          passwordHash,
        },
      });

      await tx.adminInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          entityType: "User",
          entityId: invite.id,
          action: "ADMIN_INVITE_ACCEPTED",
          performedBy: normalizedEmail,
          changes: JSON.stringify({
            email: normalizedEmail,
            name,
            invitedBy: invite.invitedBy,
          }),
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: "Admin account created. You can now log in.",
    });
  } catch (error) {
    console.error("Error accepting admin invite:", error);
    return NextResponse.json(
      { success: false, error: "Failed to accept invitation" },
      { status: 500 }
    );
  }
}
