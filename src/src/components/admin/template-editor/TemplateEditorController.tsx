"use client";

/**
 * TemplateEditorController — ED3 (spec 19ae), Tasks 2–6.
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
 */

import { TabbedShell, type TabbedShellProps } from "./TabbedShell";
import { useTemplateEditorModel } from "./hooks/useTemplateEditorModel";

export function TemplateEditorController(props: TabbedShellProps) {
  const model = useTemplateEditorModel(props);
  return <TabbedShell {...props} model={model} />;
}
