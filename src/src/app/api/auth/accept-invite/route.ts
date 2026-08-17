import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { acceptInviteSchema } from "@/lib/validations";
import { withRateLimit, RateLimits } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  // Unauthenticated, account-creating endpoint — rate-limit token guessing /
  // account-creation abuse (the only auth route previously without a limiter).
  const rateLimit = await withRateLimit(request, RateLimits.auth);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests" },
      { status: 429, headers: rateLimit.headers }
    );
  }

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

    // Timing-safe token comparison to prevent side-channel attacks
    const inviteTokenBuf = Buffer.from(invite.token, "hex");
    const providedTokenBuf = Buffer.from(token, "hex");
    if (
      inviteTokenBuf.length !== providedTokenBuf.length ||
      !crypto.timingSafeEqual(inviteTokenBuf, providedTokenBuf)
    ) {
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

    // Check existing user with this email. Wave Q (#7, ADR-0018): a
    // soft-removed ADMIN/STAFF tombstone is REVIVED IN PLACE (update, never a
    // second row — one identity per email forever, FK history and audit trail
    // stay attached to the same user id). A LIVE user, or a soft-deleted
    // COACH-role tombstone (never silently convert a coach to ADMIN), keeps
    // the existing rejection.
    const existingUser = await db.user.findUnique({
      where: { email: normalizedEmail },
    });
    const revivableTombstone =
      existingUser &&
      existingUser.deletedAt !== null &&
      (existingUser.role === "ADMIN" || existingUser.role === "STAFF")
        ? existingUser
        : null;
    if (existingUser && !revivableTombstone) {
      return NextResponse.json(
        { success: false, error: "An account with this email already exists" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await db.$transaction(async (tx) => {
      if (revivableTombstone) {
        await tx.user.update({
          where: { id: revivableTombstone.id },
          data: {
            deletedAt: null,
            passwordHash,
            authVersion: { increment: 1 },
            // Role on revival = the invite's role (always ADMIN today) — the
            // inviting admin's explicit decision; the audit below records the
            // transition so a former-STAFF promotion is visible, not drift.
            role: "ADMIN",
            name,
          },
        });
      } else {
        await tx.user.create({
          data: {
            email: normalizedEmail,
            name,
            role: "ADMIN",
            passwordHash,
          },
        });
      }

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
            ...(revivableTombstone
              ? {
                  revived: true,
                  previousRole: revivableTombstone.role,
                  newRole: "ADMIN",
                }
              : {}),
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
