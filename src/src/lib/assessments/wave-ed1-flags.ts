/**
 * Wave ED1 — assessment-editor Test Mode (default-OFF, single lever).
 * Spec: docs/specs/v7.6/19ac-editor-overhaul-wave1-test-mode.md.
 * Additive, writes nothing → no KILL/CANARY needed (unlike the import flags).
 * Env read at call time (redeploy-less kill; test-predictable). Truthiness
 * matches the Wave-N/O/X convention.
 */
function isOn(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "TRUE" || v === "yes";
}

export function isTestModeEnabled(): boolean {
  return isOn(process.env.WAVE_ED1_TEST_MODE_ENABLED);
}
