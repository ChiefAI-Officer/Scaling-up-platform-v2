/**
 * GET /api/files — List files (with optional filters)
 * POST /api/files — Upload a file
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { uploadFile, listFiles, mapFileForClient, validateFile } from "@/lib/file-service";
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
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  const session = await getServerSession(authOptions);
  if (!session?.user) {
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

  try {
    const record = await uploadFile({
      file,
      uploadedBy: session.user.id,
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
