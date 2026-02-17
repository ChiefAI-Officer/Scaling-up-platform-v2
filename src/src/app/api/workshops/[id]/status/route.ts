import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getApiActor, isPrivilegedRole } from "@/lib/authorization";
import { createPostWorkshopSurveys, sendSurveyEmail } from "@/lib/survey-automation";

// JV-02: Jeff Verdun's 6 workshop stages
const WORKSHOP_STATUSES = [
  "REQUESTED",
  "AWAITING_APPROVAL",
  "PRE_EVENT",
  "POST_EVENT",
  "COMPLETED",
  "CANCELED",
] as const;

type WorkshopStatus = typeof WORKSHOP_STATUSES[number];

const validTransitions: Record<WorkshopStatus, WorkshopStatus[]> = {
  REQUESTED: ["AWAITING_APPROVAL", "CANCELED"],
  AWAITING_APPROVAL: ["PRE_EVENT", "REQUESTED", "CANCELED"],
  PRE_EVENT: ["POST_EVENT", "CANCELED"],
  POST_EVENT: ["COMPLETED"],
  COMPLETED: [],
  CANCELED: ["REQUESTED"],
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }
    if (!isPrivilegedRole(actor.role)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const { status: newStatus } = await request.json();

    if (!newStatus || !WORKSHOP_STATUSES.includes(newStatus)) {
      return NextResponse.json(
        { success: false, error: "Invalid status" },
        { status: 400 }
      );
    }

    const workshop = await db.workshop.findUnique({
      where: { id },
    });

    if (!workshop) {
      return NextResponse.json(
        { success: false, error: "Workshop not found" },
        { status: 404 }
      );
    }

    // Check if transition is valid
    const currentStatus = workshop.status as WorkshopStatus;
    const allowedTransitions = validTransitions[currentStatus];
    if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot transition from ${workshop.status} to ${newStatus}`,
        },
        { status: 400 }
      );
    }

    // Update workshop status
    const updated = await db.workshop.update({
      where: { id },
      data: { status: newStatus },
      include: {
        coach: true,
        workshopType: true,
      },
    });

    // Create automation task for tracking
    await db.automationTask.create({
      data: {
        workshopId: id,
        taskType: `status_change_to_${newStatus}`,
        status: "COMPLETED",
        inputData: JSON.stringify({ previousStatus: workshop.status, newStatus }),
        completedAt: new Date(),
      },
    });

    // JV-13: Auto-create post-workshop surveys when transitioning to POST_EVENT
    if (newStatus === "POST_EVENT") {
      createPostWorkshopSurveys(id)
        .then(async (result) => {
          if (result.created > 0) {
            // Fetch registrations to get names for emails
            const registrations = await db.registration.findMany({
              where: { workshopId: id, status: "REGISTERED" },
              select: { email: true, firstName: true, lastName: true },
            });

            const regMap = new Map(registrations.map((r) => [r.email, r]));

            for (const { email, surveyUrl } of result.surveyUrls) {
              const reg = regMap.get(email);
              if (reg) {
                sendSurveyEmail({
                  to: email,
                  registrantName: `${reg.firstName} ${reg.lastName}`,
                  workshopTitle: updated.title,
                  surveyUrl,
                  surveyType: "POST_WORKSHOP",
                }).catch((err) => console.error("Post-workshop survey email failed:", err));
              }
            }

            console.log(`[Survey] Created ${result.created} post-workshop surveys for workshop ${id} (${result.skipped} skipped)`);
          }
        })
        .catch((err) => console.error("Post-workshop survey creation failed:", err));
    }

    return NextResponse.json({
      success: true,
      data: updated,
      message: `Workshop status updated to ${newStatus}`,
    });
  } catch (error) {
    console.error("Error updating workshop status:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update workshop status" },
      { status: 500 }
    );
  }
}
