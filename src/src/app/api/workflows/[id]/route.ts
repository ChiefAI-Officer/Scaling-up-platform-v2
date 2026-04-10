/**
 * GET /api/workflows/[id] — Get workflow with steps and assignments
 * PATCH /api/workflows/[id] — Update workflow name/description
 * DELETE /api/workflows/[id] — Delete workflow
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { getWorkflow, updateWorkflow, deleteWorkflow } from "@/lib/workflows/workflow-service";
import { z } from "zod";

const workflowRouteParamsSchema = z.object({
  id: z.string().min(1, "Workflow id is required"),
});

const updateWorkflowSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().optional().nullable(),
  isTemplate: z.boolean().optional(),
  categoryId: z.string().nullable().optional(),
  workshopFormat: z.enum(["IN_PERSON", "VIRTUAL"]).nullable().optional(),
  workflowPhase: z.enum(["PRE_EVENT", "POST_EVENT"]).nullable().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const paramsValidation = workflowRouteParamsSchema.safeParse(await params);
  if (!paramsValidation.success) {
    return NextResponse.json(
      { error: "Invalid workflow id", details: paramsValidation.error.issues },
      { status: 400 }
    );
  }

  const { id } = paramsValidation.data;
  const workflow = await getWorkflow(id);

  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: workflow });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const paramsValidation = workflowRouteParamsSchema.safeParse(await params);
  if (!paramsValidation.success) {
    return NextResponse.json(
      { error: "Invalid workflow id", details: paramsValidation.error.issues },
      { status: 400 }
    );
  }

  const bodyValidation = updateWorkflowSchema.safeParse(await request.json());
  if (!bodyValidation.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: bodyValidation.error.issues },
      { status: 400 }
    );
  }

  const { id } = paramsValidation.data;
  const { name, description, isTemplate, categoryId, workshopFormat, workflowPhase } = bodyValidation.data;

  const workflow = await updateWorkflow(id, {
    ...(name !== undefined ? { name: name.trim() } : {}),
    ...(description !== undefined ? { description: description?.trim() } : {}),
    ...(isTemplate !== undefined ? { isTemplate } : {}),
    ...(categoryId !== undefined ? { categoryId } : {}),
    ...(workshopFormat !== undefined ? { workshopFormat } : {}),
    ...(workflowPhase !== undefined ? { workflowPhase } : {}),
  });

  return NextResponse.json({ success: true, data: workflow });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const paramsValidation = workflowRouteParamsSchema.safeParse(await params);
  if (!paramsValidation.success) {
    return NextResponse.json(
      { error: "Invalid workflow id", details: paramsValidation.error.issues },
      { status: 400 }
    );
  }

  const { id } = paramsValidation.data;
  await deleteWorkflow(id);

  return NextResponse.json({ success: true });
}
