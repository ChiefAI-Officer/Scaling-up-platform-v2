import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor } from "@/lib/auth/authorization";
import { z } from "zod";

const submitFollowUpSchema = z.object({
  workshopId: z.string().min(1, "Workshop selection required"),
  implementedTools: z.array(z.string()).optional(),
  challenges: z.string().optional(),
  successes: z.string().optional(),
  recommendationScore: z.coerce.number().min(0).max(10).optional(),
  additionalComments: z.string().optional(),
});

export async function GET() {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }
    if (!actor.coachId) {
      return NextResponse.json({ success: false, error: "Coach not found" }, { status: 404 });
    }

    // Get completed/post-event workshops for this coach
    const workshops = await db.workshop.findMany({
      where: {
        coachId: actor.coachId,
        status: { in: ["POST_EVENT", "COMPLETED"] },
      },
      select: {
        id: true,
        title: true,
        workshopCode: true,
        eventDate: true,
      },
      orderBy: { eventDate: "desc" },
    });

    // Get existing follow-up reports for this coach
    const existingReports = await db.followUpReport.findMany({
      where: { coachId: actor.coachId },
      select: { workshopId: true, status: true },
    });

    const reportsByWorkshop = Object.fromEntries(
      existingReports.map((r) => [r.workshopId, r.status])
    );

    return NextResponse.json({
      success: true,
      data: workshops.map((w) => ({
        ...w,
        followUpStatus: reportsByWorkshop[w.id] || null,
      })),
    });
  } catch (error) {
    console.error("Error fetching follow-up workshops:", error);
    return NextResponse.json({ success: false, error: "Failed to load workshops" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }
    if (!actor.coachId) {
      return NextResponse.json({ success: false, error: "Coach not found" }, { status: 404 });
    }

    const bodyValidation = submitFollowUpSchema.safeParse(await request.json());
    if (!bodyValidation.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request body", details: bodyValidation.error.issues },
        { status: 400 }
      );
    }

    const { workshopId, implementedTools, challenges, successes, recommendationScore, additionalComments } =
      bodyValidation.data;

    // Verify the workshop belongs to this coach
    const workshop = await db.workshop.findFirst({
      where: { id: workshopId, coachId: actor.coachId },
    });

    if (!workshop) {
      return NextResponse.json({ success: false, error: "Workshop not found" }, { status: 404 });
    }

    // Upsert the follow-up report
    const existing = await db.followUpReport.findFirst({
      where: { workshopId, coachId: actor.coachId },
    });

    const reportData = JSON.stringify({
      implementedTools: implementedTools || [],
      challenges: challenges || "",
      successes: successes || "",
      recommendationScore: recommendationScore ?? 0,
      additionalComments: additionalComments || "",
    });

    if (existing) {
      await db.followUpReport.update({
        where: { id: existing.id },
        data: {
          reportData,
          submittedAt: new Date(),
          status: "SUBMITTED",
        },
      });
    } else {
      await db.followUpReport.create({
        data: {
          workshopId,
          coachId: actor.coachId,
          dueDate: new Date(workshop.eventDate.getTime() + 90 * 24 * 60 * 60 * 1000),
          reportData,
          submittedAt: new Date(),
          status: "SUBMITTED",
        },
      });
    }

    return NextResponse.json({ success: true, message: "Follow-up report submitted successfully" });
  } catch (error) {
    console.error("Error submitting follow-up:", error);
    return NextResponse.json({ success: false, error: "Failed to submit follow-up" }, { status: 500 });
  }
}
