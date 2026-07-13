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

  return {
    selectedSectionStableKey,
    setSelectedSectionStableKey,
    focusedQuestionUid,
    setFocusedQuestionUid,
    resetSelection,
  };
}
