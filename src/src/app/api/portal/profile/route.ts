import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const coach = await db.coach.findUnique({
      where: { email: session.user.email },
    });

    if (!coach) {
      return NextResponse.json({ success: false, error: "Coach profile not found" }, { status: 404 });
    }

    const body = await request.json();
    const { firstName, lastName, bio } = body;

    const updated = await db.coach.update({
      where: { id: coach.id },
      data: {
        ...(typeof firstName === "string" && { firstName: firstName.trim() }),
        ...(typeof lastName === "string" && { lastName: lastName.trim() }),
        ...(typeof bio === "string" && { bio: bio.trim() }),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating coach profile:", error);
    return NextResponse.json({ success: false, error: "Failed to update profile" }, { status: 500 });
  }
}
