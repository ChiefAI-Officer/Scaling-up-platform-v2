import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canManageCoachData, getApiActor } from "@/lib/auth/authorization";
import { getCircleProfileByEmail } from "@/services/circle";
import { z } from "zod";

const workshopCircleProfileParamsSchema = z.object({
  id: z.string().min(1, "Workshop id is required"),
});

/**
 * GET /api/workshops/[id]/circle-profile
 * S3-09: Fetch Circle profile data for auto-populating landing pages.
 * Returns coach's Circle bio, avatar, and certification info.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const paramsValidation = workshopCircleProfileParamsSchema.safeParse(await params);
    if (!paramsValidation.success) {
      return NextResponse.json(
        { success: false, error: "Invalid workshop id", details: paramsValidation.error.issues },
        { status: 400 }
      );
    }

    const { id } = paramsValidation.data;

    const workshop = await db.workshop.findUnique({
      where: { id },
      select: {
        coachId: true,
        coach: {
          select: { email: true, firstName: true, lastName: true },
        },
      },
    });

    if (!workshop || !canManageCoachData(actor, workshop.coachId)) {
      return NextResponse.json({ success: false, error: "Workshop not found" }, { status: 404 });
    }

    const profile = await getCircleProfileByEmail(workshop.coach.email);

    if (!profile) {
      return NextResponse.json({
        success: true,
        data: null,
        message: "No Circle profile found for this coach",
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        fullName: profile.fullName,
        title: profile.title,
        bio: profile.bio,
        avatarUrl: profile.avatarUrl,
      },
    });
  } catch (error) {
    console.error("Circle profile fetch error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch Circle profile" },
      { status: 500 }
    );
  }
}
