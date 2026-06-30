/**
 * Wave N per-respondent longitudinal feature flag — default-OFF runtime gate.
 *
 * The per-respondent longitudinal comparison reads a named person's frozen
 * scored submissions across campaigns, so it ships behind a default-OFF global
 * flag PLUS a canary allowlist + hard kill-switch, gating the launch with three
 * independent levers — the same dark-merge pattern used by Wave M
 * (`@/lib/assessments/wave-m-flags`) and Wave F (`@/lib/assessments/wave-f-flags`).
 *
 * Truthiness matches the Wave-M / Wave-F flag convention:
 *   - false when unset / "" / "0" / "false"
 *   - true only for "1" / "true" / "TRUE" / "yes"
 *
 * The canary is org-OR-template-scoped (per the 18mn plan, item 2): a single
 * env entry exposes either one organization's respondents OR one template's
 * cohort for the longitudinal view — letting an early canary target a specific
 * coach's org or a specific scored assessment before the global flip.
 *
 * Env vars (all read at call time so tests can set process.env):
 * - `WAVE_N_RESPONDENT_LONGITUDINAL_KILL` hard-overrides everything (even a
 *   matching canary or a global enable).
 * - `WAVE_N_RESPONDENT_LONGITUDINAL_ENABLED` enables globally.
 * - `WAVE_N_RESPONDENT_LONGITUDINAL_CANARY` enables by exact organization id
 *   OR exact template id.
 */

function isOn(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "TRUE" || v === "yes";
}

/**
 * Longitudinal canary: matches the given organizationId OR templateId against
 * the comma/space-separated allowlist (org/template-scoped — 18mn item 2).
 * Empty/undefined ids and an empty allowlist are treated as non-matching.
 */
function canaryMatches(
  csv: string | undefined,
  organizationId: string | undefined,
  templateId: string | undefined
): boolean {
  const allowlist = (csv ?? "")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowlist.length === 0) return false;

  const candidates = [organizationId, templateId].filter(
    (value): value is string => typeof value === "string" && value.length > 0
  );

  return candidates.some((value) => allowlist.includes(value));
}

/**
 * Whether the per-respondent longitudinal comparison is enabled for the given
 * organization/template.
 *
 * - `WAVE_N_RESPONDENT_LONGITUDINAL_KILL` hard-overrides everything (even a
 *   matching canary or a global enable — R3-High-1 kill precedence).
 * - `WAVE_N_RESPONDENT_LONGITUDINAL_ENABLED` enables globally for any ids.
 * - `WAVE_N_RESPONDENT_LONGITUDINAL_CANARY` enables by exact organization id
 *   OR exact template id.
 *
 * Pure + never-throwing: undefined opts and missing/empty env vars are treated
 * as non-matching. Default-OFF when all unset.
 */
export function isRespondentLongitudinalEnabled(opts?: {
  organizationId?: string;
  templateId?: string;
}): boolean {
  // Hard kill overrides any canary or global enable (R3-High-1).
  if (isOn(process.env.WAVE_N_RESPONDENT_LONGITUDINAL_KILL)) return false;
  return (
    isOn(process.env.WAVE_N_RESPONDENT_LONGITUDINAL_ENABLED) ||
    canaryMatches(
      process.env.WAVE_N_RESPONDENT_LONGITUDINAL_CANARY,
      opts?.organizationId,
      opts?.templateId
    )
  );
}
