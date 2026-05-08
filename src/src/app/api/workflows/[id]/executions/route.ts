/**
 * GET /api/workflows/[id]/executions — Fetch execution status grouped by workshop
 */

import { NextRequest, NextResponse } from "next/server";
import { getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { z } from "zod";

const workflowExecutionsParamsSchema = z.object({
  id: z.string().min(1, "Workflow id is required"),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // ENH-MAY6-10: tighten to admin/staff only. Per-recipient child rows surface
  // attendee emails + per-recipient delivery status — coach role must not be
  // able to read this endpoint regardless of which workflow id they guess.
  const actor = await getApiActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isPrivilegedRole(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const paramsValidation = workflowExecutionsParamsSchema.safeParse(await params);
  if (!paramsValidation.success) {
    return NextResponse.json(
      { error: "Invalid workflow id", details: paramsValidation.error.issues },
      { status: 400 }
    );
  }

  const { id: workflowId } = paramsValidation.data;

  // Get all assignments for this workflow
  const assignments = await db.workflowAssignment.findMany({
    where: { workflowId },
    include: {
      workshop: {
        select: { id: true, title: true, workshopCode: true },
      },
    },
  });

  // Get all step IDs for this workflow
  const steps = await db.workflowStep.findMany({
    where: { workflowId },
    select: { id: true, sortOrder: true, stepType: true, subject: true, offsetDays: true, offsetHours: true },
    orderBy: { sortOrder: "asc" },
  });

  const stepIds = steps.map((s) => s.id);

  // Get all executions for these steps
  const executions = await db.workflowStepExecution.findMany({
    where: { stepId: { in: stepIds } },
    orderBy: { createdAt: "desc" },
  });

  // Group by workshop
  const groups = assignments.map((assignment) => ({
    workshopId: assignment.workshop.id,
    workshopTitle: assignment.workshop.title,
    workshopCode: assignment.workshopCode,
    executions: executions
      .filter((e) => e.workshopId === assignment.workshopId)
      .map((e) => ({
        ...e,
        scheduledFor: e.scheduledFor?.toISOString() ?? null,
        executedAt: e.executedAt?.toISOString() ?? null,
        createdAt: e.createdAt.toISOString(),
        step: steps.find((s) => s.id === e.stepId) || {
          sortOrder: 0,
          stepType: "UNKNOWN",
          subject: null,
          offsetDays: null,
          offsetHours: null,
        },
      })),
  }));

  return NextResponse.json({ success: true, data: groups });
}
