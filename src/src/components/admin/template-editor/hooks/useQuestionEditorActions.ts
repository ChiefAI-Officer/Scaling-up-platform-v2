"use client";

/**
 * useQuestionEditorActions — ED9 Task 3 (spec 19al-plan, Codex co-validate #1).
 *
 * The SHARED destructive-edit command layer for a single question. The three
 * destructive edits a question's config surface performs — change the type,
 * remove a MULTI_CHOICE option, change an inherited slider's scale — are NOT
 * plain field writes: each carries its own confirm(s) and cleanup. A type
 * change in particular is NOT "confirm + setType" — on accept it also DROPS the
 * question's findings rules (Wave U D21) AND clears `showIf` on every dependent
 * that gated on this question / this option (Wave W). An option-remove confirms
 * for published/depended-on keys and prunes the option's finding text; an
 * inherited-slider scale edit confirms once per question (measurement-semantics
 * drift, Wave T D9 / co-validate C4).
 *
 * This logic used to live INLINE in `QuestionInspector` (`handleTypeChange` /
 * `handleRemoveOption` / `handleScaleUpdate`). ED9 adds a new inline
 * question-type picker (a later task) that must perform the SAME edits, so the
 * layer is lifted here VERBATIM (byte-identical confirm copy + drop rules) and
 * BOTH surfaces call it — no fork, no way for one surface to skip a drop rule.
 * The hook owns the per-question scale-ack ref (was the inspector's
 * `scaleAckUidsRef`) so its once-per-question-per-session semantics are
 * preserved unchanged. Pinned byte-equal by `ed9-golden-snapshots.test.tsx`
 * (rendered DOM) + `use-question-editor-actions.test.tsx` (this contract).
 */

import { useRef } from "react";

import type { QuestionDraftRow } from "../question-serialization";

type QuestionDraft = QuestionDraftRow;

/**
 * Wave U — how many findings rules a draft question currently carries. Shared
 * with `QuestionInspector`'s FindingsPanel header badge (single definition).
 */
export function countFindingRules(q: QuestionDraft): number {
  if (q.type === "SLIDER_LIKERT" || q.type === "NUMBER") {
    return q.findingBands.filter((b) => b.text.trim() !== "").length;
  }
  if (q.type === "MULTI_CHOICE") {
    return Object.values(q.findingOptionTexts).filter((t) => t.trim() !== "")
      .length;
  }
  return 0;
}

/**
 * Wave U D21 — ANY retype drops that question's findings rules (even the
 * band-compatible SLIDER→NUMBER — re-author deliberately).
 */
export function buildTypeChangeFindingsConfirmText(
  ruleCount: number,
  fromType: string,
  toType: string,
): string {
  return [
    `Change this question's type from ${fromType} to ${toType}?`,
    "",
    `It carries ${ruleCount} finding rule${ruleCount === 1 ? "" : "s"} — changing the type removes ${
      ruleCount === 1 ? "it" : "them all"
    }. Re-author findings for the new type deliberately.`,
    "",
    "Continue?",
  ].join("\n");
}

/**
 * Wave T D9 — removing an option whose key exists in a published version
 * orphans its `S5_why_<optionKey>` conditional followup pairing and breaks
 * the option's historical vote-share continuity.
 */
export function buildOptionRemoveConfirmText(
  optionKey: string,
  questionStableKey: string,
): string {
  return [
    `Remove option "${optionKey}" from ${questionStableKey}?`,
    "",
    "This option key exists in a published version. Removing it:",
    `• breaks its "S5_why_${optionKey}"-style conditional followup pairing;`,
    "• ends the option's historical vote-share continuity across versions.",
    "",
    "Continue?",
  ].join("\n");
}

/**
 * Wave T D9 (co-validate C4) — changing an inherited slider's scale
 * (min/max/step) drifts its measurement semantics across versions.
 */
export function buildScaleChangeConfirmText(questionStableKey: string): string {
  return [
    `Change the scale of inherited question ${questionStableKey}?`,
    "",
    "This question exists in a published version. Changing scale min/max/step drifts its measurement semantics across versions — answers before and after will be on different scales.",
    "",
    "Continue?",
  ].join("\n");
}

/**
 * The derived data + callbacks the command layer needs — exactly what
 * `QuestionInspector` already receives via props (so the future picker can
 * construct the same deps and reuse the layer verbatim).
 */
export interface QuestionEditorActionsDeps {
  /** Wave T — the 4-type unlock is on (inherited-slider scale edits warn). */
  isUnlocked: boolean;
  /** Wave U — the findings flag is on (a retype/option-remove drops rules). */
  findingsEnabled: boolean;
  /** Wave W — the conditional flag is on (dependent `showIf` is cleared). */
  conditionalEnabled: boolean;
  /** Wave W — questions whose `showIf` references the FOCUSED question. */
  showIfDependents: ReadonlyArray<QuestionDraft>;
  /** Wave W — clear the `showIf` of the given question uids. */
  onClearDependents: (uids: string[]) => void;
  /** Per-question published option keys (option-remove confirm gate). */
  publishedOptionKeys: Record<string, readonly string[]>;
  /** Apply a patch to the focused question. */
  onUpdate: (patch: Partial<QuestionDraft>) => void;
}

export interface QuestionEditorActions {
  /**
   * Change a question's type. Runs the confirm(s) (findings loss + stranded
   * dependents); on accept applies `{ type }` (plus `findingBands:[]` /
   * `findingOptionTexts:{}` when it carried rules) and clears the dependents'
   * `showIf`. No-op when `nextType === question.type`.
   */
  changeType: (question: QuestionDraft, nextType: string) => void;
  /**
   * Remove the option at `idx`. Confirms (naming the finding + freed
   * dependents) for a published/depended-on key; prunes the option's finding
   * text; clears the freed dependents' `showIf`. Index-based so a blank/new
   * option removes exactly the clicked row (keys are not yet unique).
   */
  removeOption: (question: QuestionDraft, idx: number) => void;
  /**
   * Apply a slider scale patch. Warns once per inherited question per session
   * (measurement-semantics drift) before applying; new-to-draft + locked-mode
   * edits apply silently.
   */
  updateScale: (
    question: QuestionDraft,
    patch: Pick<Partial<QuestionDraft>, "scaleMin" | "scaleMax" | "scaleStep">,
  ) => void;
}

export function useQuestionEditorActions(
  deps: QuestionEditorActionsDeps,
): QuestionEditorActions {
  const {
    isUnlocked,
    findingsEnabled,
    conditionalEnabled,
    showIfDependents,
    onClearDependents,
    publishedOptionKeys,
    onUpdate,
  } = deps;

  // D9 scale-change warning — acknowledged once per question per session.
  // Owned here (was the inspector's `scaleAckUidsRef`) so its per-instance,
  // once-per-uid lifetime is preserved unchanged.
  const scaleAckUidsRef = useRef<Set<string>>(new Set());

  // Wave T — scale edits on an INHERITED slider warn once (measurement-
  // semantics drift), then apply silently for that question. Cancel
  // discards the field change. Locked mode keeps today's silent behavior.
  const updateScale: QuestionEditorActions["updateScale"] = (
    question,
    patch,
  ) => {
    if (
      isUnlocked &&
      question.isInherited &&
      !scaleAckUidsRef.current.has(question.uid)
    ) {
      const ok = window.confirm(buildScaleChangeConfirmText(question.stableKey));
      if (!ok) return;
      scaleAckUidsRef.current.add(question.uid);
    }
    onUpdate(patch);
  };

  const removeOption: QuestionEditorActions["removeOption"] = (
    question,
    idx,
  ) => {
    const opt = question.options[idx];
    if (!opt) return;
    const published = publishedOptionKeys[question.stableKey] ?? [];
    const hasRule =
      findingsEnabled &&
      opt.key !== "" &&
      (question.findingOptionTexts[opt.key] ?? "").trim() !== "";
    // Wave W — other questions shown conditionally on THIS option lose
    // their rule with it (confirm-drop, never silent).
    const optionDependents =
      conditionalEnabled && opt.key !== ""
        ? showIfDependents.filter((d) => d.showIf?.optionKey === opt.key)
        : [];
    if (
      opt.key !== "" &&
      (published.includes(opt.key) || optionDependents.length > 0)
    ) {
      const ok = window.confirm(
        buildOptionRemoveConfirmText(opt.key, question.stableKey) +
          (hasRule
            ? `\n\nIt also carries a finding rule, which will be removed with it.`
            : "") +
          (optionDependents.length > 0
            ? `\n\n${optionDependents.length} question${optionDependents.length === 1 ? "" : "s"} shown conditionally on this option will become always-visible: ${optionDependents.map((d) => d.stableKey).join(", ")}.`
            : ""),
      );
      if (!ok) return;
    }
    // Wave U — removing an option drops its finding rule with it (silently
    // for new-to-draft options; named in the confirm above for published).
    const patch: Partial<QuestionDraft> = {
      options: question.options.filter((_, i) => i !== idx),
    };
    if (opt.key !== "" && question.findingOptionTexts[opt.key] !== undefined) {
      const texts = { ...question.findingOptionTexts };
      delete texts[opt.key];
      patch.findingOptionTexts = texts;
    }
    onUpdate(patch);
    if (optionDependents.length > 0) {
      onClearDependents(optionDependents.map((d) => d.uid));
    }
  };

  // Wave U D21 — ANY retype drops the question's findings rules, behind a
  // confirm naming the loss. (Retype is only possible on new-to-draft
  // questions — the dropdown is disabled for inherited ones.)
  const changeType: QuestionEditorActions["changeType"] = (
    question,
    nextType,
  ) => {
    if (nextType === question.type) return;
    // Wave W — retyping a gate away from MULTI_CHOICE strands its
    // dependents' rules; confirm names them, then their rules are cleared.
    const typeDependents =
      conditionalEnabled &&
      question.type === "MULTI_CHOICE" &&
      nextType !== "MULTI_CHOICE"
        ? showIfDependents
        : [];
    const ruleCount = findingsEnabled ? countFindingRules(question) : 0;
    if (ruleCount > 0 || typeDependents.length > 0) {
      const ok = window.confirm(
        (ruleCount > 0
          ? buildTypeChangeFindingsConfirmText(
              ruleCount,
              question.type,
              nextType,
            )
          : `Change question type ${question.type} → ${nextType}?`) +
          (typeDependents.length > 0
            ? `\n\n${typeDependents.length} question${typeDependents.length === 1 ? "" : "s"} shown conditionally on this one will become always-visible: ${typeDependents.map((d) => d.stableKey).join(", ")}.`
            : ""),
      );
      if (!ok) return;
      if (ruleCount > 0) {
        onUpdate({ type: nextType, findingBands: [], findingOptionTexts: {} });
      } else {
        onUpdate({ type: nextType });
      }
      if (typeDependents.length > 0) {
        onClearDependents(typeDependents.map((d) => d.uid));
      }
      return;
    }
    onUpdate({ type: nextType });
  };

  return { changeType, removeOption, updateScale };
}
