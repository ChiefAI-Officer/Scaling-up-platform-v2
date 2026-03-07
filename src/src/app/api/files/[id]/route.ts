/**
 * GET /api/files/[id] — Get file details
 * PATCH /api/files/[id] — Link/unlink file to workflow step
 * DELETE /api/files/[id] — Delete a file
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canManageCoachData, getApiActor, isPrivilegedRole } from "@/lib/authorization";
import { db } from "@/lib/db";
import {
  getFile,
  deleteFile,
  linkFileToWorkflowStep,
  unlinkFileFromWorkflowStep,
  mapFileForClient,
} from "@/lib/file-service";
import { z } from "zod";

const fileRouteParamsSchema = z.object({
  id: z.string().min(1, "File id is required"),
});

const updateFileSchema = z.object({
  workflowStepId: z.string().min(1).nullable().optional(),
  // MR-41: edit file metadata
  category: z.string().nullable().optional(),
  workshopId: z.string().nullable().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const paramsValidation = fileRouteParamsSchema.safeParse(await params);
  if (!paramsValidation.success) {
    return NextResponse.json(
      { error: "Invalid file id", details: paramsValidation.error.issues },
      { status: 400 }
    );
  }

  const { id } = paramsValidation.data;
  const file = await getFile(id);

  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: mapFileForClient(file) });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const paramsValidation = fileRouteParamsSchema.safeParse(await params);
  if (!paramsValidation.success) {
    return NextResponse.json(
      { error: "Invalid file id", details: paramsValidation.error.issues },
      { status: 400 }
    );
  }

  const bodyValidation = updateFileSchema.safeParse(await request.json());
  if (!bodyValidation.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: bodyValidation.error.issues },
      { status: 400 }
    );
  }

  const { id } = paramsValidation.data;
  const { workflowStepId, category, workshopId } = bodyValidation.data;
  const actor = await getApiActor();

  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const file = await getFile(id);
  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const actorIsPrivileged = isPrivilegedRole(actor.role);

  if (!actorIsPrivileged) {
    if (file.uploadedBy !== actor.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (file.workshop?.coachId && !canManageCoachData(actor, file.workshop.coachId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    if (workflowStepId !== undefined) {
      if (!actorIsPrivileged) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      if (workflowStepId) {
        const updated = await linkFileToWorkflowStep(id, workflowStepId);
        return NextResponse.json({ success: true, data: mapFileForClient(updated) });
      }

      const updated = await unlinkFileFromWorkflowStep(id);
      return NextResponse.json({ success: true, data: mapFileForClient(updated) });
    }

    // MR-41: Handle metadata-only updates
    if (category !== undefined || workshopId !== undefined) {
      if (workshopId && !actorIsPrivileged) {
        const targetWorkshop = await db.workshop.findUnique({
          where: { id: workshopId },
          select: { coachId: true },
        });

        if (!targetWorkshop) {
          return NextResponse.json({ error: "Workshop not found" }, { status: 404 });
        }

        if (!canManageCoachData(actor, targetWorkshop.coachId)) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }

      const updated = await db.fileAttachment.update({
        where: { id },
        data: {
          ...(category !== undefined && { category }),
          ...(workshopId !== undefined && { workshopId }),
        },
        include: {
          workshop: { select: { id: true, title: true, workshopCode: true } },
          workflowStep: { select: { id: true, stepType: true, subject: true } },
        },
      });
      return NextResponse.json({ success: true, data: mapFileForClient(updated) });
    }

    return NextResponse.json({ error: "No file changes provided" }, { status: 400 });
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

  const paramsValidation = fileRouteParamsSchema.safeParse(await params);
  if (!paramsValidation.success) {
    return NextResponse.json(
      { error: "Invalid file id", details: paramsValidation.error.issues },
      { status: 400 }
    );
  }

  const { id } = paramsValidation.data;

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
