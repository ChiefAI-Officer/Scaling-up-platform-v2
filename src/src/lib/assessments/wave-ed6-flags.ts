/**
 * Wave ED6 — single-column form-builder editor (default-OFF, single lever).
 * Spec: docs/specs/v7.6/19ah-editor-overhaul-wave6-single-column.md.
 * A THIRD editor presentation that WINS over the ED4 three-pane workspace.
 * Additive presentation swap, writes nothing → no KILL/CANARY needed (unlike
 * the import flags); kill = flag off + REDEPLOY (Vercel env needs a redeploy)
 * → the Questions body falls back to three-pane (if ED4 on) or the
 * byte-identical `QuestionsTab`.
 * Env read at call time (redeploy-less test-predictability). Truthiness matches
 * the Wave-ED1/ED2/ED4/N/O/X convention.
 */
function isOn(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "TRUE" || v === "yes";
}

export function isSingleColumnEnabled(): boolean {
  return isOn(process.env.WAVE_ED6_SINGLE_COLUMN_ENABLED);
}
