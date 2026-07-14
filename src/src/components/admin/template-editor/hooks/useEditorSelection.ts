"use client";

/**
 * useEditorSelection — ED3 (spec 19ae), Task 3.
 *
 * Headless owner of the editor's *question-selection* state:
 *   - `selectedSectionStableKey` — which section the Questions pane shows.
 *   - `focusedQuestionUid`        — which question the inspector column edits.
 *
 * Until now this state lived as LOCAL `useState` inside `QuestionsTab`. The
 * three-pane end-state (W4) needs the outline, canvas, and inspector panes to
 * SHARE one selection, so it must live ABOVE `QuestionsTab`. This hook is that
 * lifted home; the controller owns it and passes the slice + setters down.
 *
 * BEHAVIOR-NEUTRAL LIFT. The only externally-visible wrinkle of lifting is
 * lifecycle: `QuestionsTab` used to UNMOUNT when its (non-force-mounted) Radix
 * `TabsContent` went inactive, so its local selection RESET to the initial
 * value (first section + that section's first question) on every re-entry to
 * the Questions tab. With the state lifted into the always-mounted controller
 * it would instead PERSIST across that unmount — a behavior change. To keep
 * the old reset, `QuestionsTab` calls `resetSelection(...)` from a mount-only
 * effect, reproducing the pre-ED3 remount initialization exactly (resolved by
 * the caller against the *live* sections/questions at entry time). See the
 * ED3-pinned characterization test in editor-byte-equivalence.test.tsx.
 *
 * ED5 Task 3 (audit C) additive extension: a `collapsedSections` slice.
 * `EditorOutline` used to own section-collapse as LOCAL `useState`, which is
 * fine while `QuestionsTab` hosts it (mount-reset is the existing, accepted
 * behavior there) but wrong for the flag-ON three-pane "Edit" tab: its Radix
 * `TabsContent` is NOT force-mounted, so `EditorOutline` unmounts on
 * tab-away and remounts on tab-back — resetting local collapse state while
 * `focusedQuestionUid` (already lifted here) persists. Moving collapse into
 * this always-mounted hook closes that inconsistency; it is a pure addition
 * and does not change `selectedSectionStableKey` / `focusedQuestionUid` /
 * `resetSelection` behavior.
 */

import { useCallback, useState } from "react";

export interface EditorSelection {
  /** Section whose questions the middle pane lists; null ⇒ none selected. */
  selectedSectionStableKey: string | null;
  setSelectedSectionStableKey: (key: string | null) => void;
  /** Question the inspector edits; null ⇒ nothing focused. */
  focusedQuestionUid: string | null;
  setFocusedQuestionUid: (uid: string | null) => void;
  /**
   * Set BOTH slices in one shot. Used to reproduce the pre-ED3 remount reset:
   * the caller resolves the target (first section + its first question) and
   * hands it in. Identity is stable across renders.
   */
  resetSelection: (
    selectedSectionStableKey: string | null,
    focusedQuestionUid: string | null,
  ) => void;
  /**
   * Section-collapse slice (ED5 Task 3). Keyed by section `stableKey`;
   * absent ⇒ expanded (undefined is falsy, matching the pre-lift
   * `EditorOutline` default of "sections start EXPANDED").
   */
  collapsedSections: Record<string, boolean>;
  isSectionCollapsed: (key: string) => boolean;
  toggleSectionCollapsed: (key: string) => void;
  /** Explicit set — used by "expand on add" (called with `false`). */
  setSectionCollapsed: (key: string, collapsed: boolean) => void;
}

export function useEditorSelection(): EditorSelection {
  const [selectedSectionStableKey, setSelectedSectionStableKey] = useState<
    string | null
  >(null);
  const [focusedQuestionUid, setFocusedQuestionUid] = useState<string | null>(
    null,
  );

  const resetSelection = useCallback(
    (nextSection: string | null, nextFocus: string | null) => {
      setSelectedSectionStableKey(nextSection);
      setFocusedQuestionUid(nextFocus);
    },
    [],
  );

  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({});

  const isSectionCollapsed = useCallback(
    (key: string) => !!collapsedSections[key],
    [collapsedSections],
  );

  const toggleSectionCollapsed = useCallback((key: string) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const setSectionCollapsed = useCallback((key: string, collapsed: boolean) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: collapsed }));
  }, []);

  return {
    selectedSectionStableKey,
    setSelectedSectionStableKey,
    focusedQuestionUid,
    setFocusedQuestionUid,
    resetSelection,
    collapsedSections,
    isSectionCollapsed,
    toggleSectionCollapsed,
    setSectionCollapsed,
  };
}
