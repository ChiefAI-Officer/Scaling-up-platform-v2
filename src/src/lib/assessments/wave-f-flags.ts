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
 *
 * Wave J extension: SU-Full uses a completely independent set of env vars
 * (`WAVE_J_SUFULL_GROUP_ENABLED`, `WAVE_J_SUFULL_GROUP_CANARY`,
 * `WAVE_J_SUFULL_GROUP_KILL`) so LVA and SU-Full can be launched/killed
 * independently. The SU-Full canary is campaign-id-only (R4-M blast-radius cap):
 * coach or org ids in the canary list do NOT match, preventing a single
 * env entry from exposing many campaigns at once.
 */

function isOn(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "TRUE" || v === "yes";
}

/**
 * LVA/default canary: matches actor.coachId, campaign.createdByCoachId,
 * campaign.organizationId, or campaign.id against the comma-separated list.
 */
function canaryMatches(
  csv: string | undefined,
  actor: { coachId?: string | null } | null,
  campaign: {
    id?: string;
    createdByCoachId?: string | null;
    organizationId?: string | null;
  } | null
): boolean {
  const allowlist = (csv ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (allowlist.length === 0) return false;

  const candidates = [
    actor?.coachId,
    campaign?.createdByCoachId,
    campaign?.organizationId,
    campaign?.id,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  return candidates.some((value) => allowlist.includes(value));
}

/**
 * SU-Full canary: campaign-id-ONLY (R4-M blast-radius cap).
 * Coach ids and org ids in the canary list are intentionally ignored —
 * one env entry cannot expose many/large campaigns past the cohort cap.
 */
function sufCanaryMatches(
  csv: string | undefined,
  campaign: { id?: string } | null
): boolean {
  if (!campaign?.id) return false;
  const allowlist = (csv ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allowlist.includes(campaign.id);
}

/**
 * Whether the group report is enabled for this actor + campaign.
 *
 * For SU-Full (`campaign.template.alias === "scaling-up-full"`), uses the
 * independent Wave J flag set:
 * - `WAVE_J_SUFULL_GROUP_KILL` hard-overrides everything (even a matching canary).
 * - `WAVE_J_SUFULL_GROUP_ENABLED` enables globally.
 * - `WAVE_J_SUFULL_GROUP_CANARY` enables by exact campaign id only.
 *
 * For all other aliases (including LVA), uses the original Wave F flags:
 * - `WAVE_F_GROUP_REPORT_ENABLED` enables globally.
 * - `WAVE_F_GROUP_REPORT_CANARY` matches coach/org/campaign id.
 *
 * Pure + never-throwing: null/undefined actor or campaign and missing fields
 * are treated as non-matching.
 */
export function isGroupReportEnabled(
  actor: { coachId?: string | null } | null,
  campaign: {
    id?: string;
    createdByCoachId?: string | null;
    organizationId?: string | null;
    template?: { alias?: string | null } | null;
  } | null
): boolean {
  if (campaign?.template?.alias === "scaling-up-full") {
    // Hard kill overrides any canary (R2-H3)
    if (isOn(process.env.WAVE_J_SUFULL_GROUP_KILL)) return false;
    return (
      isOn(process.env.WAVE_J_SUFULL_GROUP_ENABLED) ||
      sufCanaryMatches(process.env.WAVE_J_SUFULL_GROUP_CANARY, campaign)
    );
  }

  // LVA and all other aliases: original Wave F behaviour, byte-for-byte.
  return (
    isOn(process.env.WAVE_F_GROUP_REPORT_ENABLED) ||
    canaryMatches(process.env.WAVE_F_GROUP_REPORT_CANARY, actor, campaign)
  );
}

/**
 * Template aliases the group report is surfaced for.
 *
 * Per Jeff (2026-06-18): the aggregate/CEO group report was first wanted on the
 * Leadership Vision Alignment assessment ONLY — NOT on the scored reports
 * (Rockefeller / Five Dysfunctions), which over-showed in the mockup and
 * confused him. Wave J (J-3, 2026-06-28) adds Scaling Up Full — the (already
 * built) SCORED group engine — behind its own independent WAVE_J_SUFULL_GROUP_*
 * flag set + an enforced publish gate. The remaining scored templates stay
 * built but unreachable — add an alias here to surface one.
 *
 * Single source of truth: gates BOTH the loader (group-report.ts) and the
 * CampaignDetail entry point.
 */
export const GROUP_REPORT_ALIASES: readonly string[] = [
  "leadership-vision-alignment",
  // Wave J (J-3): Scaling Up Full surfaces the (already-built) SCORED group
  // engine. Added ATOMICALLY with the three publish gates (loader + route +
  // entry point) in this same commit — there is no intermediate window where
  // the alias is allowlisted but a DRAFT/unpublished version could be reached.
  // Independently flag-gated by WAVE_J_SUFULL_GROUP_* (see isGroupReportEnabled).
  "scaling-up-full",
];

/** Whether a campaign's template alias is surfaced for the group report. */
export function isGroupReportAlias(alias: string | null | undefined): boolean {
  return typeof alias === "string" && GROUP_REPORT_ALIASES.includes(alias);
}
