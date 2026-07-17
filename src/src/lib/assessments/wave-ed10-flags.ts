/**
 * Wave ED10 — Metadata→Preview + Settings tab feature flag (default-OFF
 * runtime gate).
 *
 * Gates the ED10 editor rebuild PRESENTATION only (spec 19am-plan) — the
 * Metadata tab becomes a Preview tab, a new Settings tab is added, and the
 * respondent `SectionPager` gains an additive `previewMode`. No schema, API,
 * or data changes ride on this flag. Kill/off means the editor + live survey
 * render byte-identical to today's ED9 shell.
 *
 * Two levers only:
 * - `WAVE_ED10_PREVIEW_SETTINGS_KILL` hard-overrides everything OFF.
 * - `WAVE_ED10_PREVIEW_SETTINGS_ENABLED` enables globally.
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
 * Whether the ED10 Preview/Settings editor presentation is enabled.
 * Pure + never-throwing. Default-OFF when all unset.
 */
export function isPreviewSettingsEnabled(): boolean {
  if (isOn(process.env.WAVE_ED10_PREVIEW_SETTINGS_KILL)) return false;
  return isOn(process.env.WAVE_ED10_PREVIEW_SETTINGS_ENABLED);
}
