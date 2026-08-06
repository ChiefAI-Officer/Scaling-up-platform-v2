import { createHmac, timingSafeEqual } from "node:crypto";

export interface CeoReportAccessClaims {
  version: 1;
  purpose: "assessment-report-comparison-self";
  focusCampaignId: string;
  invitationId: string;
  respondentId: string;
  expiresAt: number;
}

const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60;
const PURPOSE = "assessment-report-comparison-self" as const;
const MIN_SECRET_LENGTH = 32;

function accessSecret(): string | null {
  const secret = process.env.ASSESSMENT_REPORT_ACCESS_SECRET;
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null;
}

function requireAccessSecret(): string {
  const secret = accessSecret();
  if (!secret) {
    throw new Error(
      "ASSESSMENT_REPORT_ACCESS_SECRET must be configured with at least 32 characters.",
    );
  }
  return secret;
}

function signature(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isClaims(value: unknown): value is CeoReportAccessClaims {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const claim = value as Record<string, unknown>;
  return (
    claim.version === 1 &&
    claim.purpose === PURPOSE &&
    isNonEmptyString(claim.focusCampaignId) &&
    isNonEmptyString(claim.invitationId) &&
    isNonEmptyString(claim.respondentId) &&
    typeof claim.expiresAt === "number" &&
    Number.isFinite(claim.expiresAt)
  );
}

/** Creates a purpose-bound, short-lived HMAC capability for CEO self-access. */
export function createCeoReportAccessToken(
  input: Omit<CeoReportAccessClaims, "version" | "purpose" | "expiresAt">,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const secret = requireAccessSecret();
  if (!isNonEmptyString(input.focusCampaignId) || !isNonEmptyString(input.invitationId) || !isNonEmptyString(input.respondentId)) {
    throw new Error("CEO report access claims must contain non-empty identifiers.");
  }
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0 || !Number.isFinite(nowSeconds)) {
    throw new Error("CEO report access token expiry must be finite and in the future.");
  }
  const claims: CeoReportAccessClaims = {
    version: 1,
    purpose: PURPOSE,
    focusCampaignId: input.focusCampaignId,
    invitationId: input.invitationId,
    respondentId: input.respondentId,
    expiresAt: nowSeconds + ttlSeconds,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${signature(payload, secret).toString("base64url")}`;
}

/** Verifies every signed claim and fails closed for malformed, expired, or invalid tokens. */
export function verifyCeoReportAccessToken(
  token: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): CeoReportAccessClaims | null {
  const secret = accessSecret();
  if (!secret || !isNonEmptyString(token) || !Number.isFinite(nowSeconds)) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  try {
    const suppliedSignature = Buffer.from(parts[1], "base64url");
    const expectedSignature = signature(parts[0], secret);
    if (suppliedSignature.length !== expectedSignature.length || !timingSafeEqual(suppliedSignature, expectedSignature)) {
      return null;
    }
    const claims: unknown = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (!isClaims(claims) || claims.expiresAt <= nowSeconds) return null;
    return claims;
  } catch {
    return null;
  }
}
