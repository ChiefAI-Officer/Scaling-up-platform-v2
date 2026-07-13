import React from "react";

import {
  QuestionsTab,
  type QuestionsTabProps,
} from "@/components/admin/template-editor/QuestionsTab";
import {
  useEditorSelection,
  type EditorSelection,
} from "@/components/admin/template-editor/hooks/useEditorSelection";

/**
 * Shared test harness — NOT a suite (no `.test.` in the filename, so jest's
 * testMatch skips it).
 *
 * ED3 Task 3 lifted question-selection out of QuestionsTab into
 * `useEditorSelection` (owned by TemplateEditorController in production).
 * Standalone unit tests that render QuestionsTab directly must therefore
 * supply the selection props. This harness wires them from the SAME hook the
 * real editor uses, so standalone behavior (initial first-section/first-
 * question focus via QuestionsTab's mount effect, section switching, focus)
 * matches production exactly. Callers pass every OTHER QuestionsTab prop.
 */
export function QuestionsTabHarness(
  props: Omit<QuestionsTabProps, keyof EditorSelection>,
) {
  const selection = useEditorSelection();
  return <QuestionsTab {...props} {...selection} />;
}
