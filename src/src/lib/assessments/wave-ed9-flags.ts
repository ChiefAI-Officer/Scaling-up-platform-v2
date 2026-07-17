/**
 * Wave ED9 — Google-Forms Build-tab feature flag (default-OFF runtime gate).
 *
 * Gates the ED9 Google-Forms-style Build-tab PRESENTATION only (spec
 * 19al-plan) — no schema, API, or data changes ride on this flag. Kill/off
 * means the Build tab renders byte-identical to today's ED6
 * `SingleColumnFormBuilder`.
 *
 * Two levers only:
 * - `WAVE_ED9_FORMS_BUILD_KILL` hard-overrides everything OFF.
 * - `WAVE_ED9_FORMS_BUILD_ENABLED` enables globally.
 *
 * Truthiness matches the Wave-Q doctrine:
 *   - false when unset / "" / "0" / "false"
 *   - true only for "1" / "true" / "TRUE" / "yes"
 *
 * Env vars are read at call time (never cached) so tests can set process.env.
 */

function isOn(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "TRUE" || v === "yes";
}

/**
 * Whether the ED9 Google-Forms Build-tab presentation is enabled.
 * Pure + never-throwing. Default-OFF when all unset.
 */
export function isFormsBuildEnabled(): boolean {
  if (isOn(process.env.WAVE_ED9_FORMS_BUILD_KILL)) return false;
  return isOn(process.env.WAVE_ED9_FORMS_BUILD_ENABLED);
}
