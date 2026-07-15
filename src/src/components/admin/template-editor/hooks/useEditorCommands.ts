"use client";

/**
 * useEditorCommands — ED6 (spec 19ah §15.5), Task 4.
 *
 * The SHARED confirm→command→focus orchestration hook. The sequence that turns
 * a user action into a confirmed model mutation + a focus move — build the
 * prompt (via the pure `question-commands` helpers) → `window.confirm` → run
 * the SHARED model command → set the model focus + a pending DOM-focus target —
 * used to live INLINE inside `EditorOutline`. ED6's flag-ON single-column
 * builder needs the SAME glue, so co-validate §15.5 required it lifted into ONE
 * hook rather than copied. This is that hook; `EditorOutline` (and the later
 * single-column surface) both consume it — no second copy.
 *
 * BEHAVIOR-PRESERVING LIFT. Every handler below is the EXACT logic previously
 * inline in `EditorOutline` (the `handleAdd`/`handleDuplicate`/`handleDelete`/
 * `handleDeleteSection`/`handleMove` bodies), moved verbatim. The read-only
 * guard, the pre-mutation survivor-focus computation (so the pre-delete
 * ordering is intact), the focus-only-when-the-focused-row-is-removed policy
 * (G10), and the "add"-control fallback when a delete empties the template all
 * carry over unchanged. The pure primitives (`findShowIfDependents`,
 * `computeSurvivorFocus`, `buildQuestionDeletePrompt`,
 * `buildSectionDeletePrompt`, `buildMoveQuestionPrompt`) are REUSED from
 * `question-commands.ts` — no re-derivation. Pinned byte-equal by
 * `EditorOutline.test.tsx` + the ED4 three-pane parity suite.
 *
 * NOT extracted: within-section reorder + multi-container drag. Those have no
 * confirm and never move focus (G10), so they are not part of the orchestration
 * this hook owns — `EditorOutline` keeps its `handleMultiDragEnd` and calls the
 * raw `reorderQuestions`/`moveQuestionToSection` model commands directly for the
 * drag path (a drag move must NOT prompt or steal focus, unlike the explicit
 * "Move to section…" control, which routes through `moveQuestion` here).
 *
 * PENDING FOCUS. The hook OWNS the pending-focus target in a ref (no re-render —
 * identical to `EditorOutline`'s pre-extraction `pendingFocusRef`). The hosting
 * view reads + clears it via `consumePendingFocus()` inside its own
 * `useLayoutEffect([questions])` and resolves `row` → the row's focus button /
 * `add` → the section's "+ Add question" control. The target is a discriminated
 * union — NOT a bare uid — because the "add" case (a delete that leaves the
 * template with no surviving question) must focus a section control, which is
 * keyed by section stableKey, not a question uid.
 */

import { useCallback, useLayoutEffect, useMemo, useRef } from "react";

import type { SectionDraft } from "../SectionsCard";
import type { QuestionDraftRow } from "../question-serialization";
import {
  buildMoveQuestionPrompt,
  buildQuestionDeletePrompt,
  buildSectionDeletePrompt,
  computeSurvivorFocus,
  findShowIfDependents,
} from "../question-commands";

/**
 * The pending DOM-focus target set by the last mutation. `row` ⇒ focus that
 * question's row focus button; `add` ⇒ focus the section's "+ Add question"
 * control (the survivor-less delete fallback). Resolved by the hosting view's
 * `useLayoutEffect` against its own row/add ref maps.
 */
export type PendingFocusTarget =
  | { kind: "row"; uid: string }
  | { kind: "add"; sectionKey: string };

/**
 * The subset of the composed editor model the orchestration reads/calls. The
 * real `TemplateEditorModel` satisfies this structurally (top-level `sections`/
 * `questions` + command fns, `selection` slice with the focus/collapse
 * setters); `EditorOutline` — which receives these as flattened props — wraps
 * them in this shape at the call site.
 */
export interface EditorCommandsModel {
  sections: readonly SectionDraft[];
  questions: readonly QuestionDraftRow[];
  selection: {
    focusedQuestionUid: string | null;
    setFocusedQuestionUid: (uid: string | null) => void;
    setSectionCollapsed: (key: string, collapsed: boolean) => void;
  };
  /** Shared model command — appends a question, returns the new uid. */
  addQuestion: (sectionStableKey: string) => string;
  /** Shared model command — duplicates a question, returns the copy uid. */
  duplicateQuestion: (uid: string) => string;
  /** Shared model command — removes a question + clears its show-if dependents. */
  deleteQuestion: (uid: string) => {
    removedUid: string;
    affectedDependentUids: string[];
  };
  /** Shared model CASCADE command — removes a section + its questions atomically. */
  deleteSection: (uid: string) => {
    removedSectionKey: string;
    removedQuestionUids: string[];
    affectedDependentUids: string[];
  };
  /** Shared model command — moves a question to a different section. */
  moveQuestionToSection: (
    uid: string,
    targetSectionKey: string,
    index?: number,
  ) => void;
}

export interface EditorCommandsOptions {
  /** Wave W — dependents named in the delete confirm when authoring is on. */
  conditionalEnabled: boolean;
  /** Published version ⇒ read-only mutation affordances (G4). */
  isReadOnly: boolean;
  /** Wave T — inherited-question delete/move uses the history-consequence confirm. */
  isUnlocked: boolean;
}

export interface EditorCommands {
  /** Append a question to a section, expand it, focus + pend the new uid. */
  addQuestion: (sectionStableKey: string) => string | undefined;
  /** Duplicate a question, focus + pend the copy uid. */
  duplicateQuestion: (uid: string) => string | undefined;
  /** Confirm (naming dependents), delete, and move focus to the survivor. */
  deleteQuestion: (uid: string) => void;
  /** Confirm (aggregated cascade prompt), delete the section + its questions,
   *  and reposition focus only when the focused question was inside it. */
  deleteSection: (uid: string) => void;
  /** Confirm an inherited move, move to the target section, keep focus on it. */
  moveQuestion: (uid: string, targetSectionKey: string, index?: number) => void;
  /** Read AND CLEAR the pending DOM-focus target (ref-backed — no re-render).
   *  Call inside the host view's `useLayoutEffect([questions])`. */
  consumePendingFocus: () => PendingFocusTarget | null;
}

export function useEditorCommands(
  model: EditorCommandsModel,
  options: EditorCommandsOptions,
): EditorCommands {
  // Latch the latest inputs so the returned handlers keep a STABLE identity
  // (plan T4 — the single-column builder hands them to memoized cards) while
  // always reading the CURRENT questions/sections/focus/flags. Synced in a
  // layout effect (never during render) — the handlers below only read
  // `*.current` from event handlers, which always run after the commit's
  // layout effects, so they observe the latest values.
  const modelRef = useRef(model);
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    modelRef.current = model;
    optionsRef.current = options;
  });

  // Owned here (was `EditorOutline`'s `pendingFocusRef`) — a ref, not state, so
  // setting it never triggers a render, exactly as before.
  const pendingFocusRef = useRef<PendingFocusTarget | null>(null);

  const consumePendingFocus = useCallback((): PendingFocusTarget | null => {
    const pending = pendingFocusRef.current;
    pendingFocusRef.current = null;
    return pending;
  }, []);

  const addQuestion = useCallback((sectionStableKey: string) => {
    const m = modelRef.current;
    if (optionsRef.current.isReadOnly) return undefined;
    const newUid = m.addQuestion(sectionStableKey);
    // Make sure the section is open so the new row is visible.
    m.selection.setSectionCollapsed(sectionStableKey, false);
    m.selection.setFocusedQuestionUid(newUid);
    pendingFocusRef.current = { kind: "row", uid: newUid };
    return newUid;
  }, []);

  const duplicateQuestion = useCallback((uid: string) => {
    const m = modelRef.current;
    if (optionsRef.current.isReadOnly) return undefined;
    const newUid = m.duplicateQuestion(uid);
    m.selection.setFocusedQuestionUid(newUid);
    pendingFocusRef.current = { kind: "row", uid: newUid };
    return newUid;
  }, []);

  const deleteQuestion = useCallback((uid: string) => {
    const m = modelRef.current;
    const { isReadOnly, isUnlocked, conditionalEnabled } = optionsRef.current;
    if (isReadOnly) return;
    const question = m.questions.find((qq) => qq.uid === uid);
    if (!question) return;
    const dependentKeys = conditionalEnabled
      ? findShowIfDependents(m.questions, question).map((d) => d.stableKey)
      : [];
    const ok = window.confirm(
      buildQuestionDeletePrompt(question, { isUnlocked, dependentKeys }),
    );
    if (!ok) return;
    // Focus policy (G10): only move focus when the FOCUSED question is removed.
    // Survivor computed by the SHARED `computeSurvivorFocus` BEFORE the removal
    // so the pre-delete order is intact for the computation.
    if (m.selection.focusedQuestionUid === question.uid) {
      const sectionOrder = m.sections.map((s) => s.stableKey);
      const survivor = computeSurvivorFocus(
        m.questions,
        sectionOrder,
        question.uid,
      );
      m.selection.setFocusedQuestionUid(survivor);
      pendingFocusRef.current = survivor
        ? { kind: "row", uid: survivor }
        : { kind: "add", sectionKey: question.sectionStableKey };
    }
    m.deleteQuestion(question.uid);
  }, []);

  const deleteSection = useCallback((uid: string) => {
    const m = modelRef.current;
    const { isReadOnly, isUnlocked } = optionsRef.current;
    if (isReadOnly) return;
    const section = m.sections.find((s) => s.uid === uid);
    if (!section) return;
    // Sorted list of the section's questions (matches `questionsBySection`).
    const list = m.questions
      .filter((qq) => qq.sectionStableKey === section.stableKey)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const inheritedKeys = list
      .filter((qq) => qq.isInherited)
      .map((qq) => qq.stableKey);
    const removedUidSet = new Set(list.map((qq) => qq.uid));
    // Union of gates' dependents, restricted to questions the cascade does NOT
    // already remove (an in-section dependent is removed too — it never
    // "becomes always-visible", so it isn't named here).
    const freedDependentKeys = Array.from(
      new Set(
        list
          .flatMap((gate) => findShowIfDependents(m.questions, gate))
          .filter((dep) => !removedUidSet.has(dep.uid))
          .map((dep) => dep.stableKey),
      ),
    );
    const ok = window.confirm(
      buildSectionDeletePrompt(
        { name: section.name, stableKey: section.stableKey },
        {
          questionCount: list.length,
          inheritedKeys,
          freedDependentKeys,
          isUnlocked,
        },
      ),
    );
    if (!ok) return;

    // Focus policy (mirrors the per-question G10 rule): only reposition focus
    // when the currently FOCUSED question is one this cascade removes. Computed
    // BEFORE the delete so the pre-cascade order is intact.
    const removedUids = list.map((qq) => qq.uid);
    const wasFocusInSection =
      m.selection.focusedQuestionUid !== null &&
      removedUidSet.has(m.selection.focusedQuestionUid);
    const survivor = wasFocusInSection
      ? computeSurvivorFocus(
          m.questions,
          m.sections.map((sec) => sec.stableKey),
          removedUids[0],
          removedUids.slice(1),
        )
      : null;

    m.deleteSection(section.uid);

    if (wasFocusInSection) {
      m.selection.setFocusedQuestionUid(survivor);
      if (survivor) {
        pendingFocusRef.current = { kind: "row", uid: survivor };
      } else {
        // No surviving question anywhere — try the first remaining section's
        // "+ Add question" control; if no section survives either, there is
        // nothing left in the outline DOM to focus.
        const nextSection = m.sections.find((sec) => sec.uid !== section.uid);
        pendingFocusRef.current = nextSection
          ? { kind: "add", sectionKey: nextSection.stableKey }
          : null;
      }
    }
  }, []);

  const moveQuestion = useCallback(
    (uid: string, targetSectionKey: string, index?: number) => {
      const m = modelRef.current;
      if (optionsRef.current.isReadOnly) return;
      const question = m.questions.find((qq) => qq.uid === uid);
      if (!question) return;
      const targetSection = m.sections.find(
        (s) => s.stableKey === targetSectionKey,
      );
      if (!targetSection) return;
      const msg = buildMoveQuestionPrompt(question, targetSection.name);
      if (msg && !window.confirm(msg)) return;
      m.moveQuestionToSection(question.uid, targetSectionKey, index);
      // Focus stays ON the moved question (its uid never changes) — reuse the
      // pending-focus/DOM-scroll mechanism so it stays visibly focused even
      // though it re-renders under a different section in the tree.
      m.selection.setFocusedQuestionUid(question.uid);
      pendingFocusRef.current = { kind: "row", uid: question.uid };
    },
    [],
  );

  return useMemo(
    () => ({
      addQuestion,
      duplicateQuestion,
      deleteQuestion,
      deleteSection,
      moveQuestion,
      consumePendingFocus,
    }),
    [
      addQuestion,
      duplicateQuestion,
      deleteQuestion,
      deleteSection,
      moveQuestion,
      consumePendingFocus,
    ],
  );
}
