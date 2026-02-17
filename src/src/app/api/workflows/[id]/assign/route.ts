/**
 * POST /api/workflows/[id]/assign — Assign workflow to a workshop
 * DELETE /api/workflows/[id]/assign — Unassign workflow from a workshop
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  assignWorkflowToWorkshop,
  unassignWorkflow,
} from "@/lib/workflow-service";
import { inngest } from "@/inngest/client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: workflowId } = await params;
  const body = await request.json();
  const { workshopId } = body;

  if (!workshopId) {
    return NextResponse.json({ error: "workshopId is required" }, { status: 400 });
  }

  try {
    const assignment = await assignWorkflowToWorkshop({
      workflowId,
      workshopId,
      assignedBy: session.user.id,
    });

    // Fire Inngest event to schedule workflow execution
    await inngest.send({
      name: "workflow/schedule",
      data: {
        workshopId,
        workflowAssignmentId: assignment.id,
      },
    });

    return NextResponse.json({ success: true, data: assignment }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Workshop not found") {
      return NextResponse.json({ error: "Workshop not found" }, { status: 404 });
    }
    // Unique constraint violation — already assigned
    const prismaError = error as { code?: string };
    if (prismaError.code === "P2002") {
      return NextResponse.json(
        { error: "This workflow is already assigned to that workshop" },
        { status: 409 }
      );
    }
    throw error;
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { assignmentId } = body;

  if (!assignmentId) {
    return NextResponse.json({ error: "assignmentId is required" }, { status: 400 });
  }

  await unassignWorkflow(assignmentId);

  return NextResponse.json({ success: true });
}
