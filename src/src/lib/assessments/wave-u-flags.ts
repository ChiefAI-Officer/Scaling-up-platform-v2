/**
 * Wave U — findings-logic feature flag (default-OFF runtime gate).
 *
 * Gates ONLY the capability surfaces (Jeff July-1 #11, spec 19u):
 *   - the Findings authoring panel in the QuestionsTab (editor UI), and
 *   - the rendering of findings in individual reports (the scored report's
 *     non-slider merge into "What to work on next" + the qualitative
 *     report's consolidated findings section).
 *
 * Deliberately NOT gated by this flag (spec 19u D12/D18 — non-killable
 * correctness whose kill is revert-commit):
 *   - the per-type `recommendations` schema + publish/runtime validation (§U-2),
 *   - the unconditional `result.findings` snapshot write at scoring time
 *     (flags gate capability/UI, never data correctness — Wave Q durable rule).
 *
 * Two levers only (no canary — authoring is admin/STAFF-only; rendering is
 * inert until rules exist on a published version, which ships empty per D15):
 * - `WAVE_U_FINDINGS_KILL` hard-overrides everything.
 * - `WAVE_U_FINDINGS_ENABLED` enables globally.
 *
 * Truthiness matches the Wave-M/N/O/S/T convention:
 *   - false when unset / "" / "0" / "false"
 *   - true only for "1" / "true" / "TRUE" / "yes"
 *
 * Env vars are read at call time (never cached) so tests can set process.env.
 */

function isOn(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "TRUE" || v === "yes";
}

/**
 * Whether findings-logic authoring + rendering is enabled.
 * Pure + never-throwing. Default-OFF when all unset.
 */
export function isFindingsLogicEnabled(): boolean {
  if (isOn(process.env.WAVE_U_FINDINGS_KILL)) return false;
  return isOn(process.env.WAVE_U_FINDINGS_ENABLED);
}
