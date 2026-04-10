/**
 * POST /api/workflows/[id]/assign — Assign workflow to a workshop
 * DELETE /api/workflows/[id]/assign — Unassign workflow from a workshop
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import {
  assignWorkflowToWorkshop,
  unassignWorkflow,
} from "@/lib/workflows/workflow-service";
import { inngest } from "@/inngest/client";
import { z } from "zod";

const workflowAssignParamsSchema = z.object({
  id: z.string().min(1, "Workflow id is required"),
});

const createWorkflowAssignmentSchema = z.object({
  workshopId: z.string().min(1, "workshopId is required"),
});

const deleteWorkflowAssignmentSchema = z.object({
  assignmentId: z.string().min(1, "assignmentId is required"),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const paramsValidation = workflowAssignParamsSchema.safeParse(await params);
  if (!paramsValidation.success) {
    return NextResponse.json(
      { error: "Invalid workflow id", details: paramsValidation.error.issues },
      { status: 400 }
    );
  }

  const bodyValidation = createWorkflowAssignmentSchema.safeParse(await request.json());
  if (!bodyValidation.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: bodyValidation.error.issues },
      { status: 400 }
    );
  }

  const { id: workflowId } = paramsValidation.data;
  const { workshopId } = bodyValidation.data;

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
    console.error("Workflow assign POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
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

  const paramsValidation = workflowAssignParamsSchema.safeParse(await params);
  if (!paramsValidation.success) {
    return NextResponse.json(
      { error: "Invalid workflow id", details: paramsValidation.error.issues },
      { status: 400 }
    );
  }

  const bodyValidation = deleteWorkflowAssignmentSchema.safeParse(await request.json());
  if (!bodyValidation.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: bodyValidation.error.issues },
      { status: 400 }
    );
  }

  const { assignmentId } = bodyValidation.data;

  try {
    await unassignWorkflow(assignmentId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Workflow assign DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
