/**
 * Wave T — question-editor type-unlock feature flag (default-OFF runtime gate).
 *
 * Gates ONLY the editor UI unlock (Jeff July-1 #10, spec 19t): enabling
 * TEXT / NUMBER / MULTI_CHOICE in the QuestionsTab type dropdown plus their
 * per-type config forms. Flag OFF ⇒ the editor renders today's slider-only
 * UI byte-identically (including the legacy v1.5 placeholder cards).
 *
 * Deliberately NOT gated by this flag (spec 19t D5/C2 — non-killable
 * correctness hardening whose kill is revert-commit):
 *   - the version-PATCH question validation (§T-5), and
 *   - the per-type question serialization fix (§T-3).
 *
 * Two levers only (no canary — the editor is an admin/STAFF-only surface):
 * - `WAVE_T_QUESTION_EDITOR_KILL` hard-overrides everything.
 * - `WAVE_T_QUESTION_EDITOR_ENABLED` enables globally.
 *
 * Truthiness matches the Wave-M/N/O/S convention:
 *   - false when unset / "" / "0" / "false"
 *   - true only for "1" / "true" / "TRUE" / "yes"
 *
 * Env vars are read at call time (never cached) so tests can set process.env.
 */

function isOn(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "TRUE" || v === "yes";
}

/**
 * Whether the question-editor type unlock (UI) is enabled.
 * Pure + never-throwing. Default-OFF when all unset.
 */
export function isQuestionEditorUnlockEnabled(): boolean {
  if (isOn(process.env.WAVE_T_QUESTION_EDITOR_KILL)) return false;
  return isOn(process.env.WAVE_T_QUESTION_EDITOR_ENABLED);
}
