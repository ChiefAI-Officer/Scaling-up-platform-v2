/**
 * Wave U3 (spec 19aa) — results-email findings feature flag (default-OFF).
 *
 * Gates ONLY the rendering of the frozen `result.findings` snapshot into the
 * results EMAIL (both the scored anatomy and the qualitative twin). It exists
 * as a SEPARATE flag from Wave U's `WAVE_U_FINDINGS_ENABLED` — which is already
 * LIVE in production — because reusing that live flag would push findings into
 * real results emails the instant this deploys (a sensitive send-path change
 * that also reverses the deliberate Wave U D7 report-only isolation). So the
 * email surface ships DARK behind its own gate: flip it after a launch-walk.
 *
 * Deliberately NOT gated by this flag:
 *   - the editor test-a-value PREVIEW (an admin authoring tool with no send /
 *     prod-data effect — it reuses the live `isFindingsLogicEnabled()`), and
 *   - the unconditional `result.findings` snapshot write at scoring time
 *     (flags gate capability/rendering, never data correctness — the Wave Q
 *     durable rule).
 *
 * Single ENABLED lever — no KILL/canary: rendering is inert until the flag is
 * ON *and* a submission carries a frozen findings snapshot, and the kill path
 * is simply zeroing the flag (published snapshots persist inert). Truthiness
 * matches the Wave-M/N/O/S/T/U convention; env read at call time (never cached)
 * so tests can set process.env. Pure + never-throwing.
 */

function isOn(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "TRUE" || v === "yes";
}

/** Whether findings render in the results email. Default-OFF when unset. */
export function isEmailFindingsEnabled(): boolean {
  return isOn(process.env.WAVE_U3_EMAIL_FINDINGS_ENABLED);
}
