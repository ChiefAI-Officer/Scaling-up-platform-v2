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
import type { ShowIfGateOption } from "./QuestionInspector";
import { canonicalQuestionOrderIndex } from "@/lib/assessments/section-pages";

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

/**
 * ED4 (spec 19af §3.4) — the FULL delete-confirm prompt, lifted VERBATIM out
 * of `QuestionsTab`'s row so BOTH the legacy tab and the three-pane outline
 * "prompt identically" (co-validate C2). The prompt keeps the Wave-T D4
 * distinction (inherited rows use the history-consequence text only when the
 * type-unlock is enabled) and appends the Wave-W dependents warning. This is
 * the single builder both views call — no fork.
 */
export function buildQuestionDeletePrompt(
  question: QuestionDraftRow,
  opts: { isUnlocked: boolean; dependentKeys: readonly string[] },
): string {
  const base =
    opts.isUnlocked && question.isInherited
      ? buildDeleteConfirmText(question)
      : `Delete question ${question.stableKey}?`;
  return base + buildShowIfDependentsWarning(opts.dependentKeys);
}

/**
 * ED4 (spec 19af §3.3/§3.4) — eligible show-if gates for a FOCUSED question,
 * lifted VERBATIM out of `QuestionsTab`'s `focusedShowIfGates` memo so the
 * inspector renders the SAME gate picker whether it is hosted by the legacy
 * `QuestionsTab` or the three-pane `ThreePaneWorkspace` (no forked eligibility
 * logic). A gate is eligible when it is a strictly-earlier (canonical render
 * order) MULTI_CHOICE with a persisted stableKey and no showIf of its own
 * (chains are publish-rejected). Order comes from the SHARED
 * `canonicalQuestionOrderIndex` keyed by uid (so unsaved rows with a blank
 * stableKey can't collide). The caller gates this on the Wave-W conditional
 * flag exactly as before (returns none when the flag is off).
 */
export function computeShowIfGates(
  sections: readonly { stableKey: string }[],
  questions: readonly QuestionDraftRow[],
  focusedQuestion: QuestionDraftRow,
): ShowIfGateOption[] {
  const orderByUid = canonicalQuestionOrderIndex(
    sections.map((s, i) => ({ stableKey: s.stableKey, sortOrder: i })),
    questions.map((q) => ({
      stableKey: q.uid,
      sortOrder: q.sortOrder,
      sectionStableKey: q.sectionStableKey,
    })),
  );
  const ownOrder = orderByUid.get(focusedQuestion.uid);
  if (ownOrder === undefined) return [];
  return questions
    .filter(
      (q) =>
        q.type === "MULTI_CHOICE" &&
        q.stableKey !== "" &&
        q.uid !== focusedQuestion.uid &&
        q.showIf === null &&
        (orderByUid.get(q.uid) ?? Infinity) < ownOrder,
    )
    .sort(
      (a, b) => (orderByUid.get(a.uid) ?? 0) - (orderByUid.get(b.uid) ?? 0),
    )
    .map((q) => ({
      stableKey: q.stableKey,
      label: q.label,
      options: q.options.map((o) => ({ key: o.key, label: o.label })),
    }));
}

/**
 * ED5 (Task 5, audit C — focus rule) — which question should receive focus
 * after `primaryRemovedUid` (plus any `alsoRemoved` cascade uids) is deleted,
 * given the PRE-delete question list and the section render order. Prefers
 * the next sibling in the removed question's own section (by `sortOrder`),
 * else the previous sibling in that section, else the nearest surviving
 * question in section order, else `null` when the template has no questions
 * left. Pure — `EditorOutline` applies both the model focus
 * (`setFocusedQuestionUid`) and the DOM keyboard focus/scroll from the
 * result.
 */
export function computeSurvivorFocus(
  questions: readonly Pick<QuestionDraftRow, "uid" | "sectionStableKey" | "sortOrder">[],
  sectionOrder: readonly string[],
  primaryRemovedUid: string,
  alsoRemoved: readonly string[] = [],
): string | null {
  const removed = new Set([primaryRemovedUid, ...alsoRemoved]);
  const target = questions.find((q) => q.uid === primaryRemovedUid);
  const survivors = questions.filter((q) => !removed.has(q.uid));
  if (survivors.length === 0) return null;
  const bySection = (sec: string) =>
    survivors
      .filter((q) => q.sectionStableKey === sec)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  if (target) {
    const same = bySection(target.sectionStableKey);
    const next = same.find((q) => q.sortOrder > target.sortOrder);
    if (next) return next.uid;
    const prev = [...same].reverse().find((q) => q.sortOrder < target.sortOrder);
    if (prev) return prev.uid;
  }
  for (const sec of sectionOrder) {
    const list = bySection(sec);
    if (list.length) return list[0].uid;
  }
  return survivors[0].uid;
}
