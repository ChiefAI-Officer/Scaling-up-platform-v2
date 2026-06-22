import crypto from "crypto";

export const WORKSHOP_STATUS_ORDER = [
  "INFO_REQUESTED",
  "DENIED",
  "AWAITING_APPROVAL",
  "PRE_EVENT",
  "POST_EVENT",
  "COMPLETED",
  "CANCELED",
] as const;

export type WorkshopStatus = (typeof WORKSHOP_STATUS_ORDER)[number];
export type FileRecipientRole = "STAFF" | "COACH" | "ATTENDEE" | "CUSTOM";

const DEFAULT_MIN_STATUS: WorkshopStatus = "PRE_EVENT";
const DEFAULT_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes

interface FileAccessTokenPayload {
  fileId: string;
  workshopId?: string;
  recipientRole: FileRecipientRole;
  minStatus: WorkshopStatus;
  exp: number;
}

function getFileAccessSecret(): string {
  const secret =
    process.env.FILE_ACCESS_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV) {
      throw new Error(
        "FILE_ACCESS_SECRET (or NEXTAUTH_SECRET) must be set in production. " +
        "File access tokens cannot be signed securely without a secret."
      );
    }
    return "local-dev-file-access-secret";
  }

  return secret;
}

function getConfiguredMinStatus(): WorkshopStatus {
  const configured = process.env.WORKFLOW_ATTACHMENT_MIN_STATUS;
  if (!configured) {
    return DEFAULT_MIN_STATUS;
  }

  const normalized = configured.trim().toUpperCase();
  if (
    WORKSHOP_STATUS_ORDER.includes(
      normalized as (typeof WORKSHOP_STATUS_ORDER)[number]
    )
  ) {
    return normalized as WorkshopStatus;
  }

  return DEFAULT_MIN_STATUS;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signTokenPayload(encodedPayload: string): string {
  return crypto
    .createHmac("sha256", getFileAccessSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function statusRank(status: string): number {
  return WORKSHOP_STATUS_ORDER.indexOf(status as WorkshopStatus);
}

function normalizeStatus(status: string | null | undefined): WorkshopStatus | null {
  if (!status) return null;
  const normalized = status.toUpperCase();
  if (!WORKSHOP_STATUS_ORDER.includes(normalized as WorkshopStatus)) {
    return null;
  }
  return normalized as WorkshopStatus;
}

function maxStatus(a: WorkshopStatus, b: WorkshopStatus): WorkshopStatus {
  return statusRank(a) >= statusRank(b) ? a : b;
}

export function createFileAccessToken(input: {
  fileId: string;
  workshopId?: string;
  recipientRole: FileRecipientRole;
  minStatus?: WorkshopStatus;
  ttlSeconds?: number;
}): string {
  const payload: FileAccessTokenPayload = {
    fileId: input.fileId,
    workshopId: input.workshopId,
    recipientRole: input.recipientRole,
    minStatus: input.minStatus ?? getConfiguredMinStatus(),
    exp: Math.floor(Date.now() / 1000) + (input.ttlSeconds ?? DEFAULT_TOKEN_TTL_SECONDS),
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signTokenPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyFileAccessToken(token: string): FileAccessTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [encodedPayload, signature] = parts;
  const expectedSignature = signTokenPayload(encodedPayload);
  const signatureBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expectedSignature);
  if (signatureBytes.length !== expectedBytes.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(signatureBytes, expectedBytes)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as FileAccessTokenPayload;
    if (!payload.fileId || !payload.recipientRole || !payload.minStatus || !payload.exp) {
      return null;
    }

    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function canRoleAccessAttachment(input: {
  recipientRole: FileRecipientRole;
  workshopStatus: string | null | undefined;
  minStatus?: WorkshopStatus;
}): boolean {
  const normalizedStatus = normalizeStatus(input.workshopStatus);
  if (input.recipientRole === "STAFF") {
    return true;
  }

  if (!normalizedStatus) {
    return false;
  }

  if (normalizedStatus === "CANCELED") {
    return false;
  }

  const roleMinStatus: Record<FileRecipientRole, WorkshopStatus> = {
    STAFF: "INFO_REQUESTED",
    COACH: "AWAITING_APPROVAL",
    ATTENDEE: "PRE_EVENT",
    CUSTOM: "PRE_EVENT",
  };

  const effectiveMinStatus = maxStatus(
    input.minStatus ?? getConfiguredMinStatus(),
    roleMinStatus[input.recipientRole]
  );

  return statusRank(normalizedStatus) >= statusRank(effectiveMinStatus);
}

/**
 * Canonical file-READ authorization, mirroring app/api/files/[id]/download/route.ts:
 * ADMIN/STAFF may read any file; a COACH who owns the file's workshop is gated by
 * the attachment-status policy; otherwise the original uploader may read a file
 * not attached to a workshop. Used by the metadata GET (which exposes blobUrl, a
 * direct content reference) so reading metadata is never weaker than downloading.
 */
export function canReadFile(input: {
  actor: { role: string; userId: string; coachId: string | null };
  file: {
    uploadedBy: string;
    workshop?: { coachId: string | null; status: string | null } | null;
  };
}): boolean {
  const { actor, file } = input;

  if (actor.role === "ADMIN" || actor.role === "STAFF") {
    return true;
  }

  if (
    actor.role === "COACH" &&
    actor.coachId &&
    file.workshop?.coachId === actor.coachId
  ) {
    return canRoleAccessAttachment({
      recipientRole: "COACH",
      workshopStatus: file.workshop?.status,
    });
  }

  // Uploader fallback for files not linked to a workshop.
  if (file.uploadedBy === actor.userId) {
    return true;
  }

  return false;
}

export function getProtectedFileUrl(fileId: string, token: string): string {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  return `${appUrl}/api/files/${fileId}/download?token=${encodeURIComponent(token)}`;
}
