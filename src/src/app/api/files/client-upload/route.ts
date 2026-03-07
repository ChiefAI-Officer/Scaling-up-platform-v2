import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canManageCoachData, getApiActor } from "@/lib/authorization";
import { db } from "@/lib/db";
import {
  ALLOWED_CONTENT_TYPES,
  MAX_FILE_SIZE,
  sanitizeFilename,
  validateFileDescriptor,
} from "@/lib/file-rules";

class ClientUploadRouteError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ClientUploadRouteError";
  }
}

const clientUploadPayloadSchema = z.object({
  originalFilename: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(255),
  sizeBytes: z.coerce.number().int().positive(),
  workshopId: z.string().trim().min(1).optional().nullable(),
  category: z.string().trim().min(1).max(100).optional().nullable(),
});

const uploadTokenPayloadSchema = clientUploadPayloadSchema.extend({
  uploadedBy: z.string().trim().min(1),
  filename: z.string().trim().min(1).max(255),
});

async function parseClientPayload(raw: string | null) {
  if (!raw) {
    throw new ClientUploadRouteError(400, "Missing upload payload");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new ClientUploadRouteError(400, "Invalid upload payload");
  }

  const parsed = clientUploadPayloadSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new ClientUploadRouteError(400, "Invalid upload payload");
  }

  const validationError = validateFileDescriptor({
    sizeBytes: parsed.data.sizeBytes,
    contentType: parsed.data.contentType,
  });
  if (validationError) {
    throw new ClientUploadRouteError(400, validationError);
  }

  return parsed.data;
}

export async function POST(request: NextRequest) {
  let body: HandleUploadBody;

  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Invalid upload request body" }, { status: 400 });
  }

  let actor = null;
  if (body.type === "blob.generate-client-token") {
    actor = await getApiActor();
    if (!actor) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
  }

  try {
    const jsonResponse = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!actor) {
          throw new ClientUploadRouteError(401, "Authentication required");
        }

        const parsedPayload = await parseClientPayload(clientPayload);
        const safeName = sanitizeFilename(parsedPayload.originalFilename);
        if (pathname !== safeName) {
          throw new ClientUploadRouteError(400, "Invalid upload pathname");
        }

        if (parsedPayload.workshopId) {
          const workshop = await db.workshop.findUnique({
            where: { id: parsedPayload.workshopId },
            select: { coachId: true },
          });

          if (!workshop) {
            throw new ClientUploadRouteError(404, "Workshop not found");
          }

          if (!canManageCoachData(actor, workshop.coachId)) {
            throw new ClientUploadRouteError(403, "Forbidden");
          }
        }

        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_FILE_SIZE,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            ...parsedPayload,
            uploadedBy: actor.userId,
            filename: safeName,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        let parsedTokenPayload: unknown = null;
        if (tokenPayload) {
          try {
            parsedTokenPayload = JSON.parse(tokenPayload);
          } catch {
            throw new ClientUploadRouteError(400, "Invalid upload completion payload");
          }
        }

        const parsedPayload = uploadTokenPayloadSchema.safeParse(parsedTokenPayload);
        if (!parsedPayload.success) {
          throw new ClientUploadRouteError(400, "Invalid upload completion payload");
        }

        const existingRecord = await db.fileAttachment.findFirst({
          where: { blobUrl: blob.url },
          select: { id: true },
        });
        if (existingRecord) {
          return;
        }

        let workshopCode: string | null = null;
        if (parsedPayload.data.workshopId) {
          const workshop = await db.workshop.findUnique({
            where: { id: parsedPayload.data.workshopId },
            select: { workshopCode: true },
          });
          workshopCode = workshop?.workshopCode || null;
        }

        await db.fileAttachment.create({
          data: {
            filename: parsedPayload.data.filename,
            blobUrl: blob.url,
            contentType: parsedPayload.data.contentType,
            sizeBytes: parsedPayload.data.sizeBytes,
            workshopId: parsedPayload.data.workshopId ?? null,
            workshopCode,
            workflowStepId: null,
            uploadedBy: parsedPayload.data.uploadedBy,
            category: parsedPayload.data.category ?? null,
          },
        });
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    if (error instanceof ClientUploadRouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Error handling client file upload:", error);
    return NextResponse.json(
      { error: "Failed to handle file upload" },
      { status: 500 }
    );
  }
}
