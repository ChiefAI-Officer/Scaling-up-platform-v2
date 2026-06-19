/**
 * Wave F group-report feature flag — default-OFF runtime gate.
 *
 * The group report is a bulk-PII surface (claudex R3-HIGH-2), so it ships
 * behind a default-OFF global flag PLUS a canary allowlist + kill-switch,
 * gating BOTH the route (T8) and the CampaignDetail entry point (T10) —
 * the same dark-merge pattern used by Wave B/D.
 *
 * Truthiness matches the Wave-D flag convention
 * (`@/lib/assessments/wave-d-feature-flags`):
 *   - false when unset / "" / "0" / "false"
 *   - true only for "1" / "true" / "TRUE" / "yes"
 */

function isTruthy(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "TRUE" || v === "yes";
}

/**
 * Whether the group report is enabled for this actor + campaign.
 *
 * - Returns true if WAVE_F_GROUP_REPORT_ENABLED is truthy (global launch),
 *   regardless of actor/campaign (so null args still return true).
 * - Else returns true if a canary identifier matches the comma-separated
 *   WAVE_F_GROUP_REPORT_CANARY allowlist — matched against actor.coachId,
 *   campaign.createdByCoachId, campaign.organizationId, or campaign.id.
 *   This canaries specific coaches/orgs/campaigns while the global flag is
 *   still off.
 * - Else false (default OFF).
 *
 * Pure + never-throwing: null/undefined actor or campaign and missing fields
 * are treated as non-matching.
 */
export function isGroupReportEnabled(
  actor: { coachId?: string | null } | null,
  campaign: {
    id: string;
    createdByCoachId?: string | null;
    organizationId?: string | null;
  } | null
): boolean {
  if (isTruthy(process.env.WAVE_F_GROUP_REPORT_ENABLED)) {
    return true;
  }

  const allowlist = (process.env.WAVE_F_GROUP_REPORT_CANARY ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (allowlist.length === 0) {
    return false;
  }

  const candidates = [
    actor?.coachId,
    campaign?.createdByCoachId,
    campaign?.organizationId,
    campaign?.id,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  return candidates.some((value) => allowlist.includes(value));
}

/**
 * Template aliases the group report is surfaced for.
 *
 * Per Jeff (2026-06-18): the aggregate/CEO group report is wanted on the
 * Leadership Vision Alignment assessment ONLY — NOT on the scored reports
 * (Rockefeller / Five Dysfunctions), which over-showed in the mockup and
 * confused him. The generic scored group engine remains in the codebase but
 * is intentionally NOT surfaced (unreachable) — add an alias here to surface it.
 *
 * Single source of truth: gates BOTH the loader (group-report.ts) and the
 * CampaignDetail entry point.
 */
export const GROUP_REPORT_ALIASES: readonly string[] = [
  "leadership-vision-alignment",
];

/** Whether a campaign's template alias is surfaced for the group report. */
export function isGroupReportAlias(alias: string | null | undefined): boolean {
  return typeof alias === "string" && GROUP_REPORT_ALIASES.includes(alias);
}
