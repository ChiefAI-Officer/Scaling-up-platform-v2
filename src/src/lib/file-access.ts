import crypto from "crypto";

export const WORKSHOP_STATUS_ORDER = [
  "REQUESTED",
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
  return (
    process.env.FILE_ACCESS_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    "local-dev-file-access-secret"
  );
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
    STAFF: "REQUESTED",
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

export function getProtectedFileUrl(fileId: string, token: string): string {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  return `${appUrl}/api/files/${fileId}/download?token=${encodeURIComponent(token)}`;
}
