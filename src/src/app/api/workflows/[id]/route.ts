/**
 * GET /api/workflows/[id] — Get workflow with steps and assignments
 * PATCH /api/workflows/[id] — Update workflow name/description
 * DELETE /api/workflows/[id] — Delete workflow
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getWorkflow, updateWorkflow, deleteWorkflow } from "@/lib/workflow-service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
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

  const { id } = await params;
  const body = await request.json();
  const { name, description, isTemplate } = body;

  const workflow = await updateWorkflow(id, {
    ...(name !== undefined ? { name: name.trim() } : {}),
    ...(description !== undefined ? { description: description?.trim() } : {}),
    ...(isTemplate !== undefined ? { isTemplate } : {}),
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

  const { id } = await params;
  await deleteWorkflow(id);

  return NextResponse.json({ success: true });
}
