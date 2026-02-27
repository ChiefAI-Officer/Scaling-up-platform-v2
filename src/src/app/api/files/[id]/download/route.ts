import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getApiActor } from "@/lib/authorization";
import { getFile } from "@/lib/file-service";
import { canRoleAccessAttachment, verifyFileAccessToken } from "@/lib/file-access";
import { db } from "@/lib/db";
import { z } from "zod";

const fileDownloadParamsSchema = z.object({
  id: z.string().min(1, "File id is required"),
});

const fileDownloadQuerySchema = z.object({
  token: z.string().min(1).optional(),
});

function sanitizeContentDispositionFilename(filename: string): string {
  return filename.replace(/["\\]/g, "_");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const paramsValidation = fileDownloadParamsSchema.safeParse(await params);
  if (!paramsValidation.success) {
    return NextResponse.json(
      { error: "Invalid file id", details: paramsValidation.error.issues },
      { status: 400 }
    );
  }

  const queryValidation = fileDownloadQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries())
  );
  if (!queryValidation.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: queryValidation.error.issues },
      { status: 400 }
    );
  }

  const { id } = paramsValidation.data;
  const { token } = queryValidation.data;

  const file = await getFile(id);
  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  let allowed = false;

  if (token) {
    const payload = verifyFileAccessToken(token);
    if (!payload || payload.fileId !== id) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    if (file.workshopId && payload.workshopId !== file.workshopId) {
      return NextResponse.json({ error: "Token workshop mismatch" }, { status: 403 });
    }

    let workshopStatusForAccess = file.workshop?.status;
    if (!workshopStatusForAccess && payload.workshopId) {
      const workshop = await db.workshop.findUnique({
        where: { id: payload.workshopId },
        select: { status: true },
      });
      workshopStatusForAccess = workshop?.status;
    }

    allowed = canRoleAccessAttachment({
      recipientRole: payload.recipientRole,
      workshopStatus: workshopStatusForAccess,
      minStatus: payload.minStatus,
    });
  } else {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const actor = await getApiActor();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (actor.role === "ADMIN" || actor.role === "STAFF") {
      allowed = true;
    } else if (actor.role === "COACH" && actor.coachId && file.workshop?.coachId === actor.coachId) {
      allowed = canRoleAccessAttachment({
        recipientRole: "COACH",
        workshopStatus: file.workshop?.status,
      });
    } else if (file.uploadedBy === actor.userId) {
      // Uploader fallback for files not linked to a workshop.
      allowed = true;
    }
  }

  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const blobResponse = await fetch(file.blobUrl);
  if (!blobResponse.ok || !blobResponse.body) {
    return NextResponse.json({ error: "Unable to fetch file content" }, { status: 502 });
  }

  return new NextResponse(blobResponse.body, {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${sanitizeContentDispositionFilename(file.filename)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
