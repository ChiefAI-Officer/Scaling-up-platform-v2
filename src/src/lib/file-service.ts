/**
 * File Service (JV-12)
 *
 * Vercel Blob upload/download/delete + database tracking.
 */

import { put, del } from "@vercel/blob";
import { db } from "@/lib/db";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function sanitizeFilename(name: string): string {
  // Strip path separators and null bytes
  let sanitized = name.replace(/[/\\]/g, "_").replace(/\0/g, "").replace(/\.\./g, "_");
  // Remove leading dots (hidden files)
  sanitized = sanitized.replace(/^\.+/, "");
  // Limit length
  if (sanitized.length > 255) {
    const ext = sanitized.slice(sanitized.lastIndexOf("."));
    sanitized = sanitized.slice(0, 255 - ext.length) + ext;
  }
  // Fallback if empty
  if (sanitized.trim().length === 0) {
    sanitized = `upload-${Date.now()}`;
  }
  return sanitized;
}

const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "text/plain",
  "text/csv",
];

export interface UploadFileInput {
  file: File;
  uploadedBy: string;
  workshopId?: string;
  workflowStepId?: string;
  category?: string;
}

export function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`;
  }
  if (!ALLOWED_CONTENT_TYPES.includes(file.type)) {
    return `File type "${file.type}" is not allowed`;
  }
  return null;
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
    orderBy: { createdAt: "desc" },
  });
}

export async function getFile(fileId: string) {
  return db.fileAttachment.findUnique({ where: { id: fileId } });
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
      blobUrl: true,
      contentType: true,
      sizeBytes: true,
    },
  });
}
