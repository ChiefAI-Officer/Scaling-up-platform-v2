"use client";

/**
 * TemplateEditorController — ED3 (spec 19ae), Tasks 2–3.
 *
 * Owner wrapper around the editor view. Task 2 was a PURE structural split
 * (state stayed in `TabbedShell`). Task 3 begins lifting SHARED state up:
 * the controller now owns the question-selection slice via
 * `useEditorSelection()` and passes it into `TabbedShell` as `selection`, so
 * the future three-pane (W4) can share one selection across panes instead of
 * re-deriving it. All OTHER editor state still lives in `TabbedShell`.
 *
 * Behavior-neutral: `TabbedShell` forwards `selection` to `QuestionsTab`,
 * whose mount-only effect reproduces the pre-ED3 remount reset (the selection
 * used to be local `useState` that reset when the tab unmounted). See the
 * ED3-pinned characterization test in editor-byte-equivalence.test.tsx.
 */

import { TabbedShell, type TabbedShellProps } from "./TabbedShell";
import { useEditorSelection } from "./hooks/useEditorSelection";

export function TemplateEditorController(props: TabbedShellProps) {
  const selection = useEditorSelection();
  return <TabbedShell {...props} selection={selection} />;
}
