"use client";

/**
 * ThreePaneWorkspace — ED4 (spec 19af §3.1–§3.3), Task 3 STUB.
 *
 * Flag-ON (`WAVE_ED4_THREE_PANE_ENABLED`) replacement for the Questions tab
 * body inside `TabbedShell`: left outline · center in-context canvas · right
 * reused `QuestionInspector`. This is the TASK-3 STUB — the left/center panes
 * are placeholders (`editor-outline-placeholder` / `question-canvas-placeholder`);
 * the real `EditorOutline` (T4) and `QuestionCanvas` (T5) land next. The RIGHT
 * pane already mounts the REAL, verbatim-reused `QuestionInspector` for the
 * question the shared model currently focuses
 * (`model.selection.focusedQuestionUid`).
 *
 * ONE shell (co-validate C1): this is a flag-selected workspace, NOT a forked
 * shell. It reads the SAME `model` `TabbedShell` uses (no second hook call), so
 * flag-OFF stays byte-identical to today by construction. Question mutations go
 * through the shared model commands both views call (co-validate C2) — no
 * bypass. The show-if dependent discovery uses the shared `findShowIfDependents`
 * predicate (same one `QuestionsTab` + the model's `deleteQuestion` use).
 */

import type { TemplateEditorModel } from "./hooks/useTemplateEditorModel";
import type { QuestionDraftRow } from "./question-serialization";
import { QuestionInspector, type ShowIfGateOption } from "./QuestionInspector";
import { findShowIfDependents } from "./question-commands";

type QuestionDraft = QuestionDraftRow;

export interface ThreePaneWorkspaceProps {
  /** The composed editor model, shared with `TabbedShell` (co-validate C1). */
  model: TemplateEditorModel;
  /** Published version ⇒ read-only mutation affordances (reused signal, G4). */
  isReadOnly: boolean;
  /** Wave T — per-type question editing unlocked. */
  isUnlocked: boolean;
  /** Wave U — findings-logic authoring panel. */
  findingsEnabled: boolean;
  /** Wave W — conditional (show-if) authoring panel. */
  conditionalEnabled: boolean;
  /** Wave T — union of published option keys per question stableKey. */
  publishedOptionKeys: Record<string, readonly string[]>;
}

export function ThreePaneWorkspace({
  model,
  isReadOnly,
  isUnlocked,
  findingsEnabled,
  conditionalEnabled,
  publishedOptionKeys,
}: ThreePaneWorkspaceProps) {
  const { questions, selection, handleUpdateQuestion } = model;

  const focusedQuestion: QuestionDraft | null =
    questions.find((q) => q.uid === selection.focusedQuestionUid) ?? null;

  // T4 (EditorOutline) computes the real eligible-gate list; the stub passes
  // none so the inspector renders without a broken gate picker.
  const showIfGates: ShowIfGateOption[] = [];

  // Questions whose showIf references the focused question — via the SHARED
  // predicate (co-validate C2), gated on the conditional flag as elsewhere.
  const showIfDependents: QuestionDraft[] =
    focusedQuestion && conditionalEnabled
      ? findShowIfDependents(questions, focusedQuestion)
      : [];

  return (
    <div
      data-testid="three-pane-workspace"
      className="grid grid-cols-1 lg:grid-cols-[20%_50%_30%] gap-4"
    >
      {/* LEFT — outline (T4 replaces this placeholder). */}
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <section
          className="wf-card space-y-2"
          style={{ padding: "1rem" }}
          data-testid="editor-outline-placeholder"
        >
          <h3 className="wf-card-title">Outline</h3>
          <p className="text-xs italic text-muted-foreground py-2">
            Section &amp; question outline lands here.
          </p>
        </section>
      </aside>

      {/* CENTER — in-context canvas (T5 replaces this placeholder). */}
      <section
        className="wf-card space-y-3"
        style={{ padding: "1rem" }}
        data-testid="question-canvas-placeholder"
      >
        <h3 className="wf-card-title">Preview</h3>
        <p className="text-xs italic text-muted-foreground py-2">
          {focusedQuestion
            ? "In-context question preview lands here."
            : "Select a question to preview it."}
        </p>
      </section>

      {/* RIGHT — reused QuestionInspector (verbatim). */}
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <QuestionInspector
          question={focusedQuestion}
          isReadOnly={isReadOnly}
          isUnlocked={isUnlocked}
          findingsEnabled={findingsEnabled}
          conditionalEnabled={conditionalEnabled}
          showIfGates={showIfGates}
          showIfDependents={showIfDependents}
          onClearDependents={(uids) => {
            for (const uid of uids) handleUpdateQuestion(uid, { showIf: null });
          }}
          publishedOptionKeys={publishedOptionKeys}
          onUpdate={(patch) => {
            if (focusedQuestion) handleUpdateQuestion(focusedQuestion.uid, patch);
          }}
        />
      </aside>
    </div>
  );
}
