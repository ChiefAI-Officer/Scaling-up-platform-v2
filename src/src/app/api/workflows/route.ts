/**
 * GET /api/workflows — List all workflows (admin) or templates (coaches)
 * POST /api/workflows — Create a new workflow
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { requireAdminApiActor } from "@/lib/auth/api-actor-gate";
import { createWorkflow, listWorkflows, duplicateWorkflow } from "@/lib/workflows/workflow-service";
import { z } from "zod";

const workflowsQuerySchema = z.object({
  templates: z.enum(["true", "false"]).optional(),
});

const createWorkflowSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  isTemplate: z.boolean().optional(),
  duplicateFromId: z.string().min(1).optional(),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const queryValidation = workflowsQuerySchema.safeParse(
    Object.fromEntries(searchParams.entries())
  );
  if (!queryValidation.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: queryValidation.error.issues },
      { status: 400 }
    );
  }

  const templatesOnly = queryValidation.data.templates === "true";

  const workflows = await listWorkflows({
    templatesOnly,
    createdBy: session.user.role === "ADMIN" ? undefined : session.user.id,
  });

  return NextResponse.json({ success: true, data: workflows });
}

export async function POST(request: NextRequest) {
  // Workflows are an admin-domain resource (admin-only UI). Create + duplicate
  // require ADMIN — the prior code only gated `isTemplate`, leaving non-template
  // create and duplicate open to any authenticated user (co-validate find).
  const gate = await requireAdminApiActor();
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: gate.status }
    );
  }

  const bodyValidation = createWorkflowSchema.safeParse(await request.json());
  if (!bodyValidation.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: bodyValidation.error.issues },
      { status: 400 }
    );
  }

  const { name, description, isTemplate, duplicateFromId } = bodyValidation.data;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Workflow name is required" }, { status: 400 });
  }

  // Duplicate existing workflow if requested
  if (duplicateFromId) {
    const workflow = await duplicateWorkflow(duplicateFromId, gate.actor.userId, name);
    return NextResponse.json({ success: true, data: workflow }, { status: 201 });
  }

  const workflow = await createWorkflow({
    name: name.trim(),
    description: description?.trim(),
    isTemplate: isTemplate ?? false,
    createdBy: gate.actor.userId,
  });

  return NextResponse.json({ success: true, data: workflow }, { status: 201 });
}
