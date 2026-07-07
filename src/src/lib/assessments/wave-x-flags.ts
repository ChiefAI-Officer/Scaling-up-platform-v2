/**
 * Wave X — LVA + Rockefeller historical Esperto import flag (default-OFF).
 *
 * Spec ref: docs/specs/v7.6/19x-wave-x-lva-rockefeller-import.md (X-2).
 *
 * Same three-lever dark-merge pattern as Wave O (`wave-o-flags.ts`): a hard
 * KILL that overrides everything, a global ENABLED, and a CANARY allowlist
 * matched by exact organization id OR template id. All env reads happen at
 * call time so tests (and a redeploy-less kill) behave predictably.
 *
 * Scope: gates ONLY the LVA + Rockefeller instrument registry entries
 * (`restricted-instruments.ts`). SU-Full stays on the independent Wave O flag
 * — killing Wave X never touches the live SU-Full import, and vice versa.
 * Import additionally stays refused per-instrument until that instrument's
 * crosswalk is `locked:true` (the plan-layer `crosswalk-locked` refusal).
 *
 * Truthiness matches the Wave-N/O convention:
 *   - false when unset / "" / "0" / "false"
 *   - true only for "1" / "true" / "TRUE" / "yes"
 */

function isOn(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "TRUE" || v === "yes";
}

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
 * Whether the LVA + Rockefeller historical-import capability is enabled for
 * the given organization/template.
 *
 * Pure + never-throwing: undefined opts and missing/empty env vars are
 * treated as non-matching. Default-OFF when all unset.
 */
export function isEspertoLvaRockImportEnabled(opts?: {
  organizationId?: string;
  templateId?: string;
}): boolean {
  // Hard kill overrides any canary or global enable.
  if (isOn(process.env.WAVE_X_ESPERTO_LVA_ROCK_IMPORT_KILL)) return false;
  return (
    isOn(process.env.WAVE_X_ESPERTO_LVA_ROCK_IMPORT_ENABLED) ||
    canaryMatches(
      process.env.WAVE_X_ESPERTO_LVA_ROCK_IMPORT_CANARY,
      opts?.organizationId,
      opts?.templateId,
    )
  );
}
