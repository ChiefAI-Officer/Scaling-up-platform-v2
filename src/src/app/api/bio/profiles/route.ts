import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/authorization";

export async function GET() {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const coaches = await db.coach.findMany({
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
