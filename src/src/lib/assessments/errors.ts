/**
 * Assessment v7.6 — typed error classes for the service layer.
 *
 * Spec ref: docs/specs/v7.6/02-service-layer-rules.md.
 *
 * Discriminator: every error carries a `code` field. API routes translate
 * codes to HTTP status + machine-readable response bodies; the route layer
 * NEVER inspects the raw message.
 *
 * Pattern mirrors `src/src/lib/assessments/scoring.ts → ScoringValidationError`
 * (constructor `(code, details, message?)`, `Object.setPrototypeOf` for
 * cross-compile `instanceof`).
 */

// ────────────────────────────────────────────────────────────────────────
// canAccessTemplate / canAccessOrganization / canCreateCampaign errors
// ────────────────────────────────────────────────────────────────────────

export type AccessControlCode =
  | "ZERO_GROUPS"
  | "TEMPLATE_NOT_GRANTED"
  | "ORG_NOT_OWNED"
  | "COACH_NOT_CERTIFIED"
  | "COACH_DEACTIVATED";

export class AccessControlError extends Error {
  constructor(
    public readonly code: AccessControlCode,
    public readonly details: Record<string, unknown> = {},
    message?: string,
  ) {
    super(message ?? code);
    this.name = "AccessControlError";
    Object.setPrototypeOf(this, AccessControlError.prototype);
  }
}

// ────────────────────────────────────────────────────────────────────────
// evaluateAccessChange errors
// ────────────────────────────────────────────────────────────────────────

export type AccessChangeCode =
  | "BLOCKED_ZERO_ACCESS"
  | "INVALID_FORCE_REASON"
  | "STALE_STATE";

export class AccessChangeError extends Error {
  constructor(
    public readonly code: AccessChangeCode,
    public readonly details: Record<string, unknown> = {},
    message?: string,
  ) {
    super(message ?? code);
    this.name = "AccessChangeError";
    Object.setPrototypeOf(this, AccessChangeError.prototype);
  }
}

// ────────────────────────────────────────────────────────────────────────
// transferOrganizationOwnership errors
// ────────────────────────────────────────────────────────────────────────

export type OwnershipTransferCode =
  | "NEW_OWNER_NOT_CERTIFIED"
  | "NEW_OWNER_NO_TEMPLATE_ACCESS"
  | "RETAINED_CLOSED_NOT_ACKNOWLEDGED"
  | "CONCURRENT_TRANSFER";

export class OwnershipTransferError extends Error {
  constructor(
    public readonly code: OwnershipTransferCode,
    public readonly details: Record<string, unknown> = {},
    message?: string,
  ) {
    super(message ?? code);
    this.name = "OwnershipTransferError";
    Object.setPrototypeOf(this, OwnershipTransferError.prototype);
  }
}
