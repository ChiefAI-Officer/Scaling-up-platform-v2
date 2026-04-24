import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inngest } from "@/inngest/client";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { createPostWorkshopSurveys, sendSurveyEmail } from "@/lib/surveys/survey-automation";
import { cancelWorkflowExecutions } from "@/lib/workflows/workflow-service";
import { z } from "zod";

// JV-02: Jeff Verdun's 6 workshop stages
const WORKSHOP_STATUSES = [
  "INFO_REQUESTED",
  "AWAITING_APPROVAL",
  "PRE_EVENT",
  "POST_EVENT",
  "COMPLETED",
  "DENIED",
  "CANCELED",
] as const;

type WorkshopStatus = typeof WORKSHOP_STATUSES[number];

const workshopStatusParamsSchema = z.object({
  id: z.string().min(1, "Workshop id is required"),
});

const updateWorkshopStatusSchema = z.object({
  status: z.enum(WORKSHOP_STATUSES),
});

const validTransitions: Record<WorkshopStatus, WorkshopStatus[]> = {
  INFO_REQUESTED: ["CANCELED"], // AWAITING_APPROVAL only via approval queue (respond handler)
  AWAITING_APPROVAL: ["PRE_EVENT", "INFO_REQUESTED", "CANCELED"],
  PRE_EVENT: ["POST_EVENT", "CANCELED"],
  POST_EVENT: ["COMPLETED"],
  COMPLETED: [],
  DENIED: ["CANCELED"],
  CANCELED: ["INFO_REQUESTED"],
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

    const paramsValidation = workshopStatusParamsSchema.safeParse(await params);
    if (!paramsValidation.success) {
      return NextResponse.json(
        { success: false, error: "Invalid workshop id", details: paramsValidation.error.issues },
        { status: 400 }
      );
    }

    const bodyValidation = updateWorkshopStatusSchema.safeParse(await request.json());
    if (!bodyValidation.success) {
      return NextResponse.json(
        { success: false, error: "Invalid status", details: bodyValidation.error.issues },
        { status: 400 }
      );
    }

    const { id } = paramsValidation.data;
    const { status: newStatus } = bodyValidation.data;

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

    // Update workshop status (and cancel workflow executions if canceling)
    const updated = await db.$transaction(async (tx) => {
      const result = await tx.workshop.update({
        where: { id },
        data: { status: newStatus },
        include: {
          coach: true,
          workshopType: true,
        },
      });

      if (newStatus === "CANCELED") {
        await cancelWorkflowExecutions(id, tx);
      }

      return result;
    });

    // Audit task — fire-and-forget, does not need to be in the status transaction
    db.automationTask.create({
      data: {
        workshopId: id,
        taskType: `status_change_to_${newStatus}`,
        status: "COMPLETED",
        inputData: JSON.stringify({ previousStatus: workshop.status, newStatus }),
        completedAt: new Date(),
      },
    }).catch((err) => console.error("Failed to create automation task:", err));

    // Emit workshop/completed event for summary email
    if (newStatus === "COMPLETED") {
      inngest
        .send({ name: "workshop/completed", data: { workshopId: id } })
        .catch((err) => console.error("Failed to emit workshop/completed:", err));
    }

    // JV-13: Auto-create post-workshop surveys when transitioning to POST_EVENT
    if (newStatus === "POST_EVENT") {
      createPostWorkshopSurveys(id)
        .then(async (result) => {
          if (result.created > 0) {
            // Fetch registrations to get names for emails
            const registrations = await db.registration.findMany({
              where: { workshopId: id, status: { in: ["REGISTERED", "CONFIRMED"] } },
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
