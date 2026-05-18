/**
 * Assessment v7.6 — Invitation token helpers.
 *
 * Spec ref: docs/specs/v7.6/02-service-layer-rules.md (Task D).
 *
 * The raw token is delivered to respondents inside an email link's URL
 * fragment (`#t=...`). Only the SHA-256 hex digest is persisted as
 * AssessmentInvitation.tokenHash — so a database leak alone cannot mint
 * valid sessions. Token comparisons go through timingSafeMatch to defeat
 * timing-based oracle attacks.
 */
import { createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * Generate a new raw invitation token (32 random bytes, base64url-encoded).
 * Returned string is URL-safe (no `+`, `/`, or `=` padding).
 */
export function generateRawToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * SHA-256 the raw token and return hex. Stored on AssessmentInvitation.tokenHash.
 * The raw token is NEVER persisted server-side — it lives only in the email link.
 */
export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/**
 * Constant-time string comparison wrapper around crypto.timingSafeEqual.
 * Returns false when lengths differ (timingSafeEqual would throw).
 */
export function timingSafeMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
