import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { inviteAdminSchema } from "@/lib/validations";
import { sendAdminInviteEmail } from "@/services/notifications";

const INVITE_TTL_DAYS = 7;

export async function GET() {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }
    if (actor.role !== "ADMIN") {
      return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    }

    const invites = await db.adminInvite.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: invites });
  } catch (error) {
    console.error("Error fetching admin invites:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch invites" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }
    if (actor.role !== "ADMIN") {
      return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const validation = inviteAdminSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues },
        { status: 400 }
      );
    }

    const { email, name } = validation.data;
    const normalizedEmail = email.toLowerCase();

    // Check if user already exists with ADMIN role
    const existingUser = await db.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingUser?.role === "ADMIN") {
      return NextResponse.json(
        { success: false, error: "A user with this email already has admin access" },
        { status: 400 }
      );
    }
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: "A user with this email already exists. Remove their existing account first." },
        { status: 400 }
      );
    }

    // Check for existing pending invite — allow re-sending
    const existingInvite = await db.adminInvite.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingInvite?.acceptedAt) {
      return NextResponse.json(
        { success: false, error: "This email has already accepted an admin invite" },
        { status: 400 }
      );
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const invite = await db.adminInvite.upsert({
      where: { email: normalizedEmail },
      update: {
        token,
        expiresAt,
        name: name || existingInvite?.name,
        invitedBy: actor.userId,
      },
      create: {
        email: normalizedEmail,
        name,
        invitedBy: actor.userId,
        token,
        expiresAt,
      },
    });

    // Send invite email
    const appUrl = process.env.APP_URL || "https://scaling-up-platform-v2.vercel.app";
    const inviteUrl = `${appUrl}/accept-invite?token=${token}&email=${encodeURIComponent(normalizedEmail)}`;

    await sendAdminInviteEmail({
      recipientEmail: normalizedEmail,
      recipientName: name,
      invitedByName: actor.email,
      inviteUrl,
    });

    await db.auditLog.create({
      data: {
        entityType: "User",
        entityId: invite.id,
        action: "ADMIN_INVITE_SENT",
        performedBy: actor.email,
        changes: JSON.stringify({
          invitedEmail: normalizedEmail,
          invitedName: name,
          expiresAt: expiresAt.toISOString(),
        }),
      },
    });

    return NextResponse.json({
      success: true,
      data: invite,
      message: `Invite sent to ${normalizedEmail}`,
    });
  } catch (error) {
    console.error("Error creating admin invite:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create invite" },
      { status: 500 }
    );
  }
}
