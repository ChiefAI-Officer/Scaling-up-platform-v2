/**
 * GET /api/files/[id] — Get file details
 * PATCH /api/files/[id] — Link/unlink file to workflow step
 * DELETE /api/files/[id] — Delete a file
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isPrivilegedRole } from "@/lib/authorization";
import {
  getFile,
  deleteFile,
  linkFileToWorkflowStep,
  unlinkFileFromWorkflowStep,
} from "@/lib/file-service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const file = await getFile(id);

  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: file });
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
  const { workflowStepId } = body;

  try {
    if (workflowStepId) {
      const updated = await linkFileToWorkflowStep(id, workflowStepId);
      return NextResponse.json({ success: true, data: updated });
    } else {
      const updated = await unlinkFileFromWorkflowStep(id);
      return NextResponse.json({ success: true, data: updated });
    }
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
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

  // Ownership check: only uploader or privileged roles can delete
  const file = await getFile(id);
  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  const userRole = (session.user as { role?: string }).role || "";
  if (file.uploadedBy !== session.user.id && !isPrivilegedRole(userRole as "ADMIN" | "STAFF" | "COACH")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await deleteFile(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof Error && err.message === "File not found") {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    throw err;
  }
}
