import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/authorization";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getApiActor();
    if (!actor || actor.role !== "ADMIN") {
      return NextResponse.json(
        { success: false, error: "Admin access required" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const invite = await db.adminInvite.findUnique({ where: { id } });
    if (!invite) {
      return NextResponse.json(
        { success: false, error: "Invite not found" },
        { status: 404 }
      );
    }

    if (invite.acceptedAt) {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot revoke an accepted invite. Remove the user from the admin settings instead.",
        },
        { status: 400 }
      );
    }

    await db.adminInvite.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        entityType: "User",
        entityId: id,
        action: "ADMIN_INVITE_REVOKED",
        performedBy: actor.email,
        changes: JSON.stringify({ revokedEmail: invite.email }),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Invite revoked",
    });
  } catch (error) {
    console.error("Error revoking admin invite:", error);
    return NextResponse.json(
      { success: false, error: "Failed to revoke invite" },
      { status: 500 }
    );
  }
}
