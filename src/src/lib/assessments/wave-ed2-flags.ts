/**
 * Wave ED2 — assessment-editor Safe-to-Publish readout (default-OFF, single lever).
 * Spec: docs/specs/v7.6/19ad-editor-overhaul-wave2-safe-to-publish.md.
 * Additive, writes nothing → no KILL/CANARY needed (unlike the import flags).
 * Env read at call time (redeploy-less kill; test-predictable). Truthiness
 * matches the Wave-ED1/N/O/X convention.
 */
function isOn(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "TRUE" || v === "yes";
}

export function isSafeToPublishEnabled(): boolean {
  return isOn(process.env.WAVE_ED2_SAFE_TO_PUBLISH_ENABLED);
}
