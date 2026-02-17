/**
 * GET /api/workflows — List all workflows (admin) or templates (coaches)
 * POST /api/workflows — Create a new workflow
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createWorkflow, listWorkflows, duplicateWorkflow } from "@/lib/workflow-service";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const templatesOnly = searchParams.get("templates") === "true";

  const workflows = await listWorkflows({
    templatesOnly,
    createdBy: session.user.role === "ADMIN" ? undefined : session.user.id,
  });

  return NextResponse.json({ success: true, data: workflows });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, description, isTemplate, duplicateFromId } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Workflow name is required" }, { status: 400 });
  }

  // Duplicate existing workflow if requested
  if (duplicateFromId) {
    const workflow = await duplicateWorkflow(duplicateFromId, session.user.id, name);
    return NextResponse.json({ success: true, data: workflow }, { status: 201 });
  }

  // Only admins can create templates
  if (isTemplate && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Only admins can create workflow templates" }, { status: 403 });
  }

  const workflow = await createWorkflow({
    name: name.trim(),
    description: description?.trim(),
    isTemplate: isTemplate ?? false,
    createdBy: session.user.id,
  });

  return NextResponse.json({ success: true, data: workflow }, { status: 201 });
}
