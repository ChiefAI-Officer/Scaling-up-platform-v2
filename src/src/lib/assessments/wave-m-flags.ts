/**
 * Wave M custom-slides feature flag — default-OFF runtime gate.
 *
 * Custom slides are a per-campaign authored surface, so they ship behind a
 * default-OFF global flag PLUS a canary allowlist + hard kill-switch, gating
 * the launch with three independent levers — the same dark-merge pattern used
 * by Wave F (`@/lib/assessments/wave-f-flags`) and Wave D.
 *
 * Truthiness matches the Wave-F / Wave-D flag convention:
 *   - false when unset / "" / "0" / "false"
 *   - true only for "1" / "true" / "TRUE" / "yes"
 *
 * The canary is campaign-id-ONLY (blast-radius cap, mirroring Wave J's
 * SU-Full canary): one env entry exposes exactly one campaign, never a coach
 * or org's whole portfolio at once.
 *
 * Env vars (all read at call time so tests can set process.env):
 * - `WAVE_M_CUSTOM_SLIDES_KILL` hard-overrides everything (even a matching
 *   canary or a global enable).
 * - `WAVE_M_CUSTOM_SLIDES_ENABLED` enables globally.
 * - `WAVE_M_CUSTOM_SLIDES_CANARY` enables by exact campaign id only.
 */

function isOn(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "TRUE" || v === "yes";
}

/**
 * Custom-slides canary: campaign-id-ONLY (blast-radius cap, mirroring Wave J's
 * SU-Full canary). Coach ids and org ids in the canary list are intentionally
 * NOT honoured — one env entry cannot expose many campaigns at once.
 */
function canaryMatches(
  csv: string | undefined,
  campaignId: string | undefined
): boolean {
  if (!campaignId) return false;
  const allowlist = (csv ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allowlist.includes(campaignId);
}

/**
 * Whether custom slides are enabled for this campaign.
 *
 * - `WAVE_M_CUSTOM_SLIDES_KILL` hard-overrides everything (even a matching
 *   canary or a global enable — R2-H3 kill precedence).
 * - `WAVE_M_CUSTOM_SLIDES_ENABLED` enables globally for any campaign.
 * - `WAVE_M_CUSTOM_SLIDES_CANARY` enables by exact campaign id only.
 *
 * Pure + never-throwing: an undefined campaignId and missing/empty env vars
 * are treated as non-matching. Default-OFF when all unset.
 */
export function isCustomSlidesEnabled(campaignId?: string): boolean {
  // Hard kill overrides any canary or global enable (R2-H3).
  if (isOn(process.env.WAVE_M_CUSTOM_SLIDES_KILL)) return false;
  return (
    isOn(process.env.WAVE_M_CUSTOM_SLIDES_ENABLED) ||
    canaryMatches(process.env.WAVE_M_CUSTOM_SLIDES_CANARY, campaignId)
  );
}
