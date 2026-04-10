import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { z } from "zod";

const bioProfilesQuerySchema = z.object({
  coachId: z.string().min(1).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const queryValidation = bioProfilesQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams.entries())
    );

    if (!queryValidation.success) {
      return NextResponse.json(
        { success: false, error: "Invalid query parameters", details: queryValidation.error.issues },
        { status: 400 }
      );
    }

    const coaches = await db.coach.findMany({
      where: queryValidation.data.coachId ? { id: queryValidation.data.coachId } : undefined,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        company: true,
        profileImage: true,
        createdAt: true,
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    const profiles = coaches.map((coach) => ({
      id: coach.id,
      name: `${coach.firstName} ${coach.lastName}`.trim(),
      title: coach.company || "Scaling Up Certified Coach",
      photoUrl: coach.profileImage || "",
      createdAt: coach.createdAt.toISOString(),
      editUrl: `/bio/${coach.id}`,
    }));

    return NextResponse.json({ success: true, data: profiles });
  } catch (error) {
    console.error("Failed to load coach bio profiles:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load coach bio profiles" },
      { status: 500 }
    );
  }
}
