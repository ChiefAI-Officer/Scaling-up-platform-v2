/**
 * PATCH /api/workflows/[id]/steps/[stepId] — Update a workflow step
 * DELETE /api/workflows/[id]/steps/[stepId] — Delete a workflow step
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { updateWorkflowStep, deleteWorkflowStep } from "@/lib/workflow-service";
import { STEP_TYPES, TRIGGER_TYPES } from "@/lib/workflow-types";
import type { StepType, TriggerType } from "@/lib/workflow-types";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { stepId } = await params;
  const body = await request.json();

  const updateData: Record<string, unknown> = {};

  if (body.stepType !== undefined) {
    if (!Object.values(STEP_TYPES).includes(body.stepType as StepType)) {
      return NextResponse.json({ error: "Invalid stepType" }, { status: 400 });
    }
    updateData.stepType = body.stepType;
  }

  if (body.triggerType !== undefined) {
    if (!Object.values(TRIGGER_TYPES).includes(body.triggerType as TriggerType)) {
      return NextResponse.json({ error: "Invalid triggerType" }, { status: 400 });
    }
    updateData.triggerType = body.triggerType;
  }

  if (body.subject !== undefined) updateData.subject = body.subject;
  if (body.body !== undefined) updateData.body = body.body;
  if (body.emailTemplateId !== undefined) updateData.emailTemplateId = body.emailTemplateId;
  if (body.customRecipients !== undefined) updateData.customRecipients = body.customRecipients;
  if (body.offsetDays !== undefined) updateData.offsetDays = body.offsetDays;
  if (body.offsetHours !== undefined) updateData.offsetHours = body.offsetHours;
  if (body.sendTimeOfDay !== undefined) updateData.sendTimeOfDay = body.sendTimeOfDay;
  if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder;
  if (body.isActive !== undefined) updateData.isActive = body.isActive;

  const step = await updateWorkflowStep(stepId, updateData);

  return NextResponse.json({ success: true, data: step });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { stepId } = await params;
  await deleteWorkflowStep(stepId);

  return NextResponse.json({ success: true });
}
