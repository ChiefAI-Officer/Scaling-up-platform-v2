import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/authorization";
import { getCircleProfileByEmail } from "@/services/circle";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    if (!isPrivilegedRole(actor.role)) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const coach = await db.coach.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        company: true,
        bio: true,
        profileImage: true,
        circleId: true,
      },
    });

    if (!coach) {
      return NextResponse.json(
        { success: false, error: "Coach not found" },
        { status: 404 }
      );
    }

    const circleProfile = await getCircleProfileByEmail(coach.email);
    if (!circleProfile) {
      return NextResponse.json(
        {
          success: false,
          error: "No matching Circle profile found for this coach email",
        },
        { status: 404 }
      );
    }

    const mapped = {
      firstName: circleProfile.firstName || coach.firstName,
      lastName: circleProfile.lastName || coach.lastName,
      titleCredentials: circleProfile.title || coach.company || "",
      biography: circleProfile.bio || coach.bio || "",
      profileImageUrl: circleProfile.avatarUrl || coach.profileImage || "",
      circleId: circleProfile.memberId || coach.circleId || "",
      matchedEmail: circleProfile.email || coach.email,
    };

    return NextResponse.json({
      success: true,
      data: mapped,
      message: "Circle profile imported and mapped. Save to apply changes.",
    });
  } catch (error) {
    console.error("Error importing Circle coach profile:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to import profile from Circle",
      },
      { status: 500 }
    );
  }
}
