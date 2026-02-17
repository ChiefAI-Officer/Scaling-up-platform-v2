/**
 * POST /api/workflows/[id]/steps — Add a step to a workflow
 * PATCH /api/workflows/[id]/steps — Reorder steps
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { addWorkflowStep, reorderWorkflowSteps } from "@/lib/workflow-service";
import { STEP_TYPES, TRIGGER_TYPES } from "@/lib/workflow-types";
import type { StepType, TriggerType } from "@/lib/workflow-types";

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

  const { stepType, triggerType, sortOrder, subject, body: emailBody, emailTemplateId, customRecipients, offsetDays, offsetHours, sendTimeOfDay } = body;

  if (!stepType || !Object.values(STEP_TYPES).includes(stepType as StepType)) {
    return NextResponse.json({ error: "Invalid stepType" }, { status: 400 });
  }

  if (!triggerType || !Object.values(TRIGGER_TYPES).includes(triggerType as TriggerType)) {
    return NextResponse.json({ error: "Invalid triggerType" }, { status: 400 });
  }

  const step = await addWorkflowStep({
    workflowId,
    sortOrder: sortOrder ?? 0,
    stepType: stepType as StepType,
    triggerType: triggerType as TriggerType,
    emailTemplateId,
    subject,
    body: emailBody,
    customRecipients,
    offsetDays,
    offsetHours,
    sendTimeOfDay,
  });

  return NextResponse.json({ success: true, data: step }, { status: 201 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: workflowId } = await params;
  const body = await request.json();
  const { stepIds } = body;

  if (!Array.isArray(stepIds)) {
    return NextResponse.json({ error: "stepIds must be an array" }, { status: 400 });
  }

  await reorderWorkflowSteps(workflowId, stepIds);

  return NextResponse.json({ success: true });
}
