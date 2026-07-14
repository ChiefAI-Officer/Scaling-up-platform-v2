/**
 * Wave ED4 — three-pane authoring workspace (default-OFF, single lever).
 * Spec: docs/specs/v7.6/19af-editor-overhaul-wave4-three-pane.md.
 * Additive presentation swap, writes nothing → no KILL/CANARY needed (unlike
 * the import flags); kill = flag off + REDEPLOY (Vercel env needs a redeploy)
 * → the Questions body falls back to the byte-identical `QuestionsTab`.
 * Env read at call time (redeploy-less test-predictability). Truthiness matches
 * the Wave-ED1/ED2/N/O/X convention.
 */
function isOn(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "TRUE" || v === "yes";
}

export function isThreePaneEnabled(): boolean {
  return isOn(process.env.WAVE_ED4_THREE_PANE_ENABLED);
}
