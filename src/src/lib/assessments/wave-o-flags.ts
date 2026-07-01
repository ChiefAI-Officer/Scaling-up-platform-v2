/**
 * Wave O — historical SU-Full Esperto import feature flag (default-OFF runtime gate).
 *
 * The SU-Full historical-import capability ships behind a default-OFF global
 * flag PLUS a canary allowlist + hard kill-switch — the same three-lever
 * dark-merge pattern used by Wave N (`@/lib/assessments/wave-n-flags`) and
 * Wave M (`@/lib/assessments/wave-m-flags`).
 *
 * Rollout ramp (per plan R3-H3): coach self-serve is the END STATE, reached via
 * the CANARY lever (pilot org → allowlist → global ENABLED), never a day-one
 * global flip. Import stays fully dark until this flag is on AND the SU-Full
 * crosswalk is `locked:true`.
 *
 * Truthiness matches the Wave-N / Wave-M convention:
 *   - false when unset / "" / "0" / "false"
 *   - true only for "1" / "true" / "TRUE" / "yes"
 *
 * Env vars (all read at call time so tests can set process.env):
 * - `WAVE_O_ESPERTO_SUFULL_IMPORT_KILL` hard-overrides everything (even a
 *   matching canary or a global enable).
 * - `WAVE_O_ESPERTO_SUFULL_IMPORT_ENABLED` enables globally.
 * - `WAVE_O_ESPERTO_SUFULL_IMPORT_CANARY` enables by exact organization id
 *   OR exact template id (comma/space-separated allowlist).
 */

function isOn(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "TRUE" || v === "yes";
}

/**
 * SU-Full import canary: matches the given organizationId OR templateId against
 * the comma/space-separated allowlist. Empty/undefined ids and an empty
 * allowlist are treated as non-matching.
 */
function canaryMatches(
  csv: string | undefined,
  organizationId: string | undefined,
  templateId: string | undefined,
): boolean {
  const allowlist = (csv ?? "")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowlist.length === 0) return false;

  const candidates = [organizationId, templateId].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

  return candidates.some((value) => allowlist.includes(value));
}

/**
 * Whether the SU-Full historical-import capability is enabled for the given
 * organization/template.
 *
 * Pure + never-throwing: undefined opts and missing/empty env vars are treated
 * as non-matching. Default-OFF when all unset.
 */
export function isEspertoSuFullImportEnabled(opts?: {
  organizationId?: string;
  templateId?: string;
}): boolean {
  // Hard kill overrides any canary or global enable.
  if (isOn(process.env.WAVE_O_ESPERTO_SUFULL_IMPORT_KILL)) return false;
  return (
    isOn(process.env.WAVE_O_ESPERTO_SUFULL_IMPORT_ENABLED) ||
    canaryMatches(
      process.env.WAVE_O_ESPERTO_SUFULL_IMPORT_CANARY,
      opts?.organizationId,
      opts?.templateId,
    )
  );
}
