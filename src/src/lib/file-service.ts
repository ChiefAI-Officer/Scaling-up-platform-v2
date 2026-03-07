/**
 * File Service (JV-12)
 *
 * Vercel Blob upload/download/delete + database tracking.
 */

import { put, del } from "@vercel/blob";
import { db } from "@/lib/db";
import {
  canRoleAccessAttachment,
  createFileAccessToken,
  getProtectedFileUrl,
  type FileRecipientRole,
  type WorkshopStatus,
} from "@/lib/file-access";
import { getSessionDownloadPath } from "@/lib/file-download-path";
import {
  sanitizeFilename,
  validateFile,
} from "@/lib/file-rules";
export { validateFile } from "@/lib/file-rules";

export interface UploadFileInput {
  file: File;
  uploadedBy: string;
  workshopId?: string;
  workflowStepId?: string;
  category?: string;
}

export async function uploadFile(input: UploadFileInput) {
  const validation = validateFile(input.file);
  if (validation) throw new Error(validation);

  // Sanitize filename before storage
  const safeName = sanitizeFilename(input.file.name);

  // Upload to Vercel Blob
  const blob = await put(safeName, input.file, {
    access: "public",
    addRandomSuffix: true,
  });

  // Get workshopCode if workshopId provided
  let workshopCode: string | null = null;
  if (input.workshopId) {
    const workshop = await db.workshop.findUnique({
      where: { id: input.workshopId },
      select: { workshopCode: true },
    });
    workshopCode = workshop?.workshopCode || null;
  }

  // Record in database
  const record = await db.fileAttachment.create({
    data: {
      filename: safeName,
      blobUrl: blob.url,
      contentType: input.file.type,
      sizeBytes: input.file.size,
      workshopId: input.workshopId,
      workshopCode,
      workflowStepId: input.workflowStepId,
      uploadedBy: input.uploadedBy,
      category: input.category,
    },
  });

  return record;
}

export async function deleteFile(fileId: string) {
  const file = await db.fileAttachment.findUnique({
    where: { id: fileId },
  });

  if (!file) throw new Error("File not found");

  // Delete from Vercel Blob
  await del(file.blobUrl);

  // Delete from database
  await db.fileAttachment.delete({ where: { id: fileId } });

  return { success: true };
}

export async function listFiles(filters?: {
  workshopId?: string;
  workflowStepId?: string;
  category?: string;
}) {
  return db.fileAttachment.findMany({
    where: {
      ...(filters?.workshopId ? { workshopId: filters.workshopId } : {}),
      ...(filters?.workflowStepId ? { workflowStepId: filters.workflowStepId } : {}),
      ...(filters?.category ? { category: filters.category } : {}),
    },
    include: {
      workshop: { select: { id: true, title: true, workshopCode: true } },
      workflowStep: { select: { id: true, stepType: true, subject: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getFile(fileId: string) {
  return db.fileAttachment.findUnique({
    where: { id: fileId },
    include: {
      workshop: { select: { id: true, title: true, workshopCode: true, status: true, coachId: true } },
      workflowStep: { select: { id: true, stepType: true, subject: true } },
    },
  });
}

export async function linkFileToWorkflowStep(fileId: string, workflowStepId: string) {
  return db.fileAttachment.update({
    where: { id: fileId },
    data: { workflowStepId },
  });
}

export async function unlinkFileFromWorkflowStep(fileId: string) {
  return db.fileAttachment.update({
    where: { id: fileId },
    data: { workflowStepId: null },
  });
}

/**
 * Get all files attached to a workflow step (for email sending).
 */
export async function getWorkflowStepFiles(workflowStepId: string) {
  return db.fileAttachment.findMany({
    where: { workflowStepId },
    select: {
      id: true,
      filename: true,
      contentType: true,
      sizeBytes: true,
      workshopId: true,
      workshop: { select: { status: true } },
    },
  });
}

export function mapFileForClient<T extends { id: string; blobUrl?: string | null }>(file: T) {
  const { blobUrl: _blobUrl, ...rest } = file;
  return {
    ...rest,
    downloadUrl: getSessionDownloadPath(file.id),
  };
}

export function canDeliverWorkflowAttachments(input: {
  recipientRole: FileRecipientRole;
  workshopStatus: string | null | undefined;
  minStatus?: WorkshopStatus;
}): boolean {
  return canRoleAccessAttachment(input);
}

export interface ProtectedEmailAttachment {
  filename: string;
  path: string;
  contentType: string;
}

export function buildProtectedEmailAttachments(input: {
  files: Array<{ id: string; filename: string; contentType: string }>;
  workshopId: string;
  workshopStatus: string | null | undefined;
  recipientRole: FileRecipientRole;
  minStatus?: WorkshopStatus;
  ttlSeconds?: number;
}): ProtectedEmailAttachment[] {
  if (
    !canDeliverWorkflowAttachments({
      recipientRole: input.recipientRole,
      workshopStatus: input.workshopStatus,
      minStatus: input.minStatus,
    })
  ) {
    return [];
  }

  return input.files.map((file) => {
    const token = createFileAccessToken({
      fileId: file.id,
      workshopId: input.workshopId,
      recipientRole: input.recipientRole,
      minStatus: input.minStatus,
      ttlSeconds: input.ttlSeconds,
    });

    return {
      filename: file.filename,
      path: getProtectedFileUrl(file.id, token),
      contentType: file.contentType,
    };
  });
}
