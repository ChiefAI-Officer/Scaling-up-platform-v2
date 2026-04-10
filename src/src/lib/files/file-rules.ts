export const MAX_FILE_SIZE = 250 * 1024 * 1024; // 250MB

export const ALLOWED_CONTENT_TYPES = [
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

export function sanitizeFilename(name: string): string {
  let sanitized = name.replace(/[/\\]/g, "_").replace(/\0/g, "").replace(/\.\./g, "_");
  sanitized = sanitized.replace(/^\.+/, "");

  if (sanitized.length > 255) {
    const extIndex = sanitized.lastIndexOf(".");
    const ext = extIndex >= 0 ? sanitized.slice(extIndex) : "";
    sanitized = sanitized.slice(0, 255 - ext.length) + ext;
  }

  if (sanitized.trim().length === 0) {
    sanitized = `upload-${Date.now()}`;
  }

  return sanitized;
}

export function validateFileDescriptor(input: {
  sizeBytes: number;
  contentType: string;
}): string | null {
  if (input.sizeBytes > MAX_FILE_SIZE) {
    return `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`;
  }

  if (!ALLOWED_CONTENT_TYPES.includes(input.contentType)) {
    return `File type "${input.contentType}" is not allowed`;
  }

  return null;
}

export function validateFile(file: Pick<File, "size" | "type">): string | null {
  return validateFileDescriptor({
    sizeBytes: file.size,
    contentType: file.type,
  });
}
