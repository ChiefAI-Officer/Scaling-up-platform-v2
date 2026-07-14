"use client";

/**
 * TemplateEditorController — ED3 (spec 19ae), Tasks 2–6; ED5 (spec 19ag), Task 4.
 *
 * Owner wrapper around the editor view. Task 2 was a PURE structural split
 * (state stayed in `TabbedShell`). Task 3 lifted the question-selection
 * slice up via `useEditorSelection()`. Task 6 (Codex C1) finishes the lift:
 * the controller now calls the composer `useTemplateEditorModel()` exactly
 * ONCE — which itself calls `useTemplateEditorDraft`, `useVersionActions`,
 * and `useEditorSelection` — and hands `TabbedShell` a SINGLE `model` prop
 * instead of `TabbedShell` calling those hooks itself. This is what lets the
 * future three-pane (W4) share one model across panes instead of re-deriving
 * it. `TabbedShell` stays the thin view; all other editor state (active tab,
 * Test Mode drawer open/closed, badge memos) still lives there.
 *
 * Behavior-neutral: `TabbedShell` forwards `model.selection` to
 * `QuestionsTab`, whose mount-only effect reproduces the pre-ED3 remount
 * reset (the selection used to be local `useState` that reset when the tab
 * unmounted). See the ED3-pinned characterization test in
 * editor-byte-equivalence.test.tsx.
 *
 * ED5 Task 4 (audit A-1, "cold empty landing") — a MOUNT-ONCE auto-focus
 * effect. When the three-pane flag is on, the Questions tab is relabeled
 * "Edit" and becomes the default landing tab (`TabbedShell`'s
 * `threePaneEnabled` branch), but `focusedQuestionUid` starts `null` — the
 * legacy `QuestionsTab` effectively opened on the first question (its own
 * mount-only reset effect), so the flag-ON author instead landed on an empty
 * canvas + empty inspector. This effect focuses the first section's first
 * question (by canonical array order, then `sortOrder` within the section)
 * exactly once on controller mount — flag-OFF is a no-op (byte-identity
 * guard), and it never clobbers a focus a later re-render already carries
 * (the controller mounts once and survives Edit-tab unmount/remount, so this
 * effect fires exactly once for the life of the editor session).
 */

import { useEffect } from "react";
import { TabbedShell, type TabbedShellProps } from "./TabbedShell";
import { useTemplateEditorModel } from "./hooks/useTemplateEditorModel";

export function TemplateEditorController(props: TabbedShellProps) {
  const model = useTemplateEditorModel(props);

  useEffect(() => {
    if (!props.threePaneEnabled) return; // flag-off: no-op (byte-identity guard)
    if (model.selection.focusedQuestionUid !== null) return; // don't clobber persisted focus
    const firstSection = model.sections[0]; // array order = canonical section order
    if (!firstSection) return;
    const firstQuestion = model.questions
      .filter((q) => q.sectionStableKey === firstSection.stableKey)
      .sort((a, b) => a.sortOrder - b.sortOrder)[0];
    if (firstQuestion) {
      model.selection.resetSelection(firstSection.stableKey, firstQuestion.uid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // once on mount

  return <TabbedShell {...props} model={model} />;
}
