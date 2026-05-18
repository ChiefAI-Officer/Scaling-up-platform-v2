/**
 * Assessment v7.6 — Canonical coach certification status constants.
 *
 * Spec ref: docs/specs/v7.6/02-service-layer-rules.md → "Canonical
 * certification constant (Round 3 H-2)".
 *
 * The existing platform uses `certificationStatus="ACTIVE"` for certified
 * coaches (verified against src/src/app/(dashboard)/coaches/page.tsx
 * filters and src/src/services/hubspot.ts), NOT "CERTIFIED". A canonical
 * constant is introduced to prevent drift across the service layer,
 * admin UI filter chips, and post-deploy verification scripts.
 *
 * v7.6 admin UI may flip a coach to DEACTIVATED instead of hard-deleting
 * (Round 3 M-6); the constant is exported here so the service layer can
 * reference it without literal-string sprinkles.
 */

export const CERTIFIED_STATUS = "ACTIVE" as const;
export const PENDING_STATUS = "PENDING" as const;
export const DEACTIVATED_STATUS = "DEACTIVATED" as const;

export type CoachCertificationStatus =
  | typeof CERTIFIED_STATUS
  | typeof PENDING_STATUS
  | typeof DEACTIVATED_STATUS
  | string;

/**
 * Returns true iff the coach's certificationStatus is exactly the canonical
 * certified value ("ACTIVE"). PENDING / DEACTIVATED / DENIED / EXPIRED and
 * any unknown values return false.
 */
export function isCertified(coach: { certificationStatus: string }): boolean {
  return coach.certificationStatus === CERTIFIED_STATUS;
}
