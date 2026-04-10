import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { syncCoachFromCircle } from "@/services/circle-sync";
import { z } from "zod";

const circleImportParamsSchema = z.object({
  id: z.string().min(1, "Coach id is required"),
});

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

    const paramsValidation = circleImportParamsSchema.safeParse(await params);
    if (!paramsValidation.success) {
      return NextResponse.json(
        { success: false, error: "Invalid coach id", details: paramsValidation.error.issues },
        { status: 400 }
      );
    }

    const { id } = paramsValidation.data;

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
      const status =
        result.error === "Coach not found"
          ? 404
          : result.error === "No Circle profile found for this email"
          ? 404
          : result.error === "Circle not configured"
          ? 503
          : 500;
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

    const responseData = updatedCoach
      ? {
          ...updatedCoach,
          // Backward-compatible aliases for older consumers.
          titleCredentials: updatedCoach.company ?? "",
          biography: updatedCoach.bio ?? "",
          profileImageUrl: updatedCoach.profileImage ?? "",
        }
      : null;

    return NextResponse.json({
      success: true,
      data: responseData,
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
