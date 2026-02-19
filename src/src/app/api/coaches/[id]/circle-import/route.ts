import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/authorization";
import { syncCoachFromCircle } from "@/services/circle-sync";

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

    // Verify coach exists
    const coach = await db.coach.findUnique({
      where: { id },
      select: { id: true, email: true },
    });

    if (!coach) {
      return NextResponse.json(
        { success: false, error: "Coach not found" },
        { status: 404 }
      );
    }

    // Sync from Circle with forceOverwrite (admin explicitly triggered)
    const result = await syncCoachFromCircle(id, { forceOverwrite: true });

    if (!result.success) {
      const status = result.error === "No Circle profile found for this email" ? 404 : 500;
      return NextResponse.json(
        { success: false, error: result.error },
        { status }
      );
    }

    // Fetch the updated coach to return
    const updatedCoach = await db.coach.findUnique({
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
        syncedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: updatedCoach,
      fieldsUpdated: result.fieldsUpdated,
      message: result.updated
        ? `Synced ${result.fieldsUpdated.length} field(s) from Circle.`
        : "Coach profile already up to date.",
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
