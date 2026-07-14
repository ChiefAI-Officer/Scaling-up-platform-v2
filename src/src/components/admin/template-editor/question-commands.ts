/**
 * Shared question-command primitives — Wave ED4 (spec 19af §3.4, Task 1).
 *
 * The question-mutation SEMANTICS used to be split: the draft hook's
 * add/duplicate/delete handlers returned `void`, while the delete-confirm
 * text, the inherited-question (D9) warning, and the show-if dependent
 * DISCOVERY lived inline in `QuestionsTab`'s presentation. The three-pane
 * outline (W4) must run mutations through the SAME primitives so it can't
 * bypass those semantics (co-validate C2). This module holds the pieces that
 * BOTH views share:
 *   - the two confirm/warn TEXT builders (lifted VERBATIM out of QuestionsTab —
 *     byte-identical output, snapshot-pinned by question-commands.test.ts);
 *   - `findShowIfDependents`, the discovery predicate used by QuestionsTab's
 *     `showIfDependentsOf` AND by the model's consolidated `deleteQuestion`
 *     command (so there is ONE definition of "which questions gate on this
 *     one").
 *
 * The actual mutation commands (`addQuestion`/`duplicateQuestion`/
 * `deleteQuestion`/`reorderQuestions`, which return the affected/new UIDs)
 * live on the model (`useTemplateEditorDraft`) because they own `setQuestions`;
 * they consume `findShowIfDependents` from here.
 */

import type { QuestionDraftRow } from "./question-serialization";

/**
 * Wave T D4 — deleting an INHERITED question (its stableKey exists in a
 * published version) is a history-affecting act; the confirm names the key
 * and the three consequence classes. New-to-draft rows keep the legacy
 * simple confirm.
 */
export function buildDeleteConfirmText(question: QuestionDraftRow): string {
  return [
    `Delete inherited question ${question.stableKey}?`,
    "",
    "This question exists in a published version of this template. Deleting it means:",
    `• cross-version trend history for ${question.stableKey} ends with the last published version;`,
    "• a locked Esperto import crosswalk that maps this key will refuse imports against the next published version;",
    "• any peer benchmark set on this question will be pruned.",
    "",
    "Continue?",
  ].join("\n");
}

/**
 * Wave W — appended to the delete confirm when other questions are shown
 * conditionally on the one being deleted.
 */
export function buildShowIfDependentsWarning(keys: readonly string[]): string {
  if (keys.length === 0) return "";
  return [
    "",
    `${keys.length} question${keys.length === 1 ? "" : "s"} shown conditionally on this one will become always-visible: ${keys.join(", ")}.`,
  ].join("\n");
}

/**
 * Wave W — questions whose `showIf` references a given gate's stableKey.
 * A gate with a blank stableKey can't be referenced yet (unsaved), so it has
 * no dependents. Excludes the gate itself. This is the single definition of
 * "dependents of a gate" shared by the QuestionsTab presentation and the
 * model's `deleteQuestion` command.
 */
export function findShowIfDependents(
  questions: readonly QuestionDraftRow[],
  gate: Pick<QuestionDraftRow, "uid" | "stableKey">,
): QuestionDraftRow[] {
  if (gate.stableKey === "") return [];
  return questions.filter(
    (q) => q.uid !== gate.uid && q.showIf?.questionKey === gate.stableKey,
  );
}
