import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Valid workshop statuses (since we're using SQLite with string fields)
const WORKSHOP_STATUSES = [
  "REQUESTED",
  "VALIDATING",
  "APPROVED",
  "SETUP_IN_PROGRESS",
  "MARKETING_ACTIVE",
  "REGISTRATION_OPEN",
  "REGISTRATION_CLOSED",
  "COMPLETED",
  "CANCELLED",
] as const;

type WorkshopStatus = typeof WORKSHOP_STATUSES[number];

const validTransitions: Record<WorkshopStatus, WorkshopStatus[]> = {
  REQUESTED: ["VALIDATING", "CANCELLED"],
  VALIDATING: ["APPROVED", "REQUESTED", "CANCELLED"],
  APPROVED: ["SETUP_IN_PROGRESS", "CANCELLED"],
  SETUP_IN_PROGRESS: ["MARKETING_ACTIVE", "APPROVED", "CANCELLED"],
  MARKETING_ACTIVE: ["REGISTRATION_OPEN", "SETUP_IN_PROGRESS", "CANCELLED"],
  REGISTRATION_OPEN: ["REGISTRATION_CLOSED", "MARKETING_ACTIVE", "CANCELLED"],
  REGISTRATION_CLOSED: ["COMPLETED", "REGISTRATION_OPEN", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: ["REQUESTED"],
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
