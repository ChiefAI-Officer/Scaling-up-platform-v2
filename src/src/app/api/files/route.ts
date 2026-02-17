/**
 * GET /api/files — List files (with optional filters)
 * POST /api/files — Upload a file
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { uploadFile, listFiles, validateFile } from "@/lib/file-service";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workshopId = request.nextUrl.searchParams.get("workshopId") || undefined;
  const workflowStepId = request.nextUrl.searchParams.get("workflowStepId") || undefined;
  const category = request.nextUrl.searchParams.get("category") || undefined;

  const files = await listFiles({ workshopId, workflowStepId, category });
  return NextResponse.json({ success: true, data: files });
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

  const workshopId = formData.get("workshopId") as string | null;
  const workflowStepId = formData.get("workflowStepId") as string | null;
  const category = formData.get("category") as string | null;

  try {
    const record = await uploadFile({
      file,
      uploadedBy: session.user.id,
      workshopId: workshopId || undefined,
      workflowStepId: workflowStepId || undefined,
      category: category || undefined,
    });

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
