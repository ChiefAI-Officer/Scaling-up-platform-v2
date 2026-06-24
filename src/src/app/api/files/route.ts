/**
 * GET /api/files — List files (with optional filters)
 * POST /api/files — Upload a file
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePrivilegedApiActor } from "@/lib/auth/api-actor-gate";
import { canManageCoachData, getApiActor, isPrivilegedRole } from "@/lib/auth/authorization";
import { db } from "@/lib/db";
import { withRateLimit, RateLimits } from "@/lib/rate-limit";
import { uploadFile, listFiles, mapFileForClient, validateFile } from "@/lib/files/file-service";
import { z } from "zod";

const filesQuerySchema = z.object({
  workshopId: z.string().min(1).optional(),
  workflowStepId: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
});

const fileUploadMetaSchema = z.object({
  workshopId: z.string().min(1).optional(),
  workflowStepId: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
});

export async function GET(request: NextRequest) {
  // The file list is admin-tooling only (file-manager, workflow-editor). Gate to
  // privileged actors; listFiles has no per-owner scoping.
  const gate = await requirePrivilegedApiActor();
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: gate.status }
    );
  }

  const queryValidation = filesQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries())
  );
  if (!queryValidation.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: queryValidation.error.issues },
      { status: 400 }
    );
  }

  const { workshopId, workflowStepId, category } = queryValidation.data;

  const files = await listFiles({ workshopId, workflowStepId, category });
  return NextResponse.json({ success: true, data: files.map(mapFileForClient) });
}

export async function POST(request: NextRequest) {
  const rateLimit = await withRateLimit(request, RateLimits.standard);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimit.headers }
    );
  }

  const actor = await getApiActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const validationError = validateFile(file);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const metadataValidation = fileUploadMetaSchema.safeParse({
    workshopId: (formData.get("workshopId") as string | null) || undefined,
    workflowStepId: (formData.get("workflowStepId") as string | null) || undefined,
    category: (formData.get("category") as string | null) || undefined,
  });
  if (!metadataValidation.success) {
    return NextResponse.json(
      { error: "Invalid upload metadata", details: metadataValidation.error.issues },
      { status: 400 }
    );
  }

  const { workshopId, workflowStepId, category } = metadataValidation.data;

  if (workflowStepId && !isPrivilegedRole(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (workshopId) {
    const workshop = await db.workshop.findUnique({
      where: { id: workshopId },
      select: { coachId: true },
    });

    if (!workshop) {
      return NextResponse.json({ error: "Workshop not found" }, { status: 404 });
    }

    if (!canManageCoachData(actor, workshop.coachId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const record = await uploadFile({
      file,
      uploadedBy: actor.userId,
      workshopId,
      workflowStepId,
      category,
    });

    return NextResponse.json({ success: true, data: mapFileForClient(record) }, { status: 201 });
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
