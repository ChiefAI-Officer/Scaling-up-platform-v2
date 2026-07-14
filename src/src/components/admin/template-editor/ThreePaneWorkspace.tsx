"use client";

/**
 * ThreePaneWorkspace — ED4 (spec 19af §3.1–§3.3), Task 3 STUB.
 *
 * Flag-ON (`WAVE_ED4_THREE_PANE_ENABLED`) replacement for the Questions tab
 * body inside `TabbedShell`: left `EditorOutline` (T4) · center `QuestionCanvas`
 * (T5) · right the REAL, verbatim-reused `QuestionInspector`. All three panes
 * render the question the shared model currently focuses
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
import { computeShowIfGates, findShowIfDependents } from "./question-commands";
import { EditorOutline } from "./EditorOutline";
import { QuestionCanvas } from "./QuestionCanvas";
import { shapeSignature } from "./question-widget-mapper";

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
  /** Switch the active tab to Sections (owned by the shell — G9 empty state). */
  onGoToSections: () => void;
}

export function ThreePaneWorkspace({
  model,
  isReadOnly,
  isUnlocked,
  findingsEnabled,
  conditionalEnabled,
  publishedOptionKeys,
  onGoToSections,
}: ThreePaneWorkspaceProps) {
  const {
    sections,
    questions,
    selection,
    handleUpdateQuestion,
    addQuestion,
    duplicateQuestion,
    deleteQuestion,
    reorderQuestions,
    handleSectionsAdd,
    handleSectionsRename,
    handleSectionsMoveUp,
    handleSectionsMoveDown,
    deleteSection,
    moveQuestionToSection,
  } = model;

  const focusedQuestion: QuestionDraft | null =
    questions.find((q) => q.uid === selection.focusedQuestionUid) ?? null;

  // Section heading for the canvas (respondent-fidelity context).
  const focusedSectionName: string | null = focusedQuestion
    ? (sections.find((s) => s.stableKey === focusedQuestion.sectionStableKey)
        ?.name ?? null)
    : null;

  // Eligible show-if gates for the focused question — via the SHARED
  // `computeShowIfGates` helper (also used by QuestionsTab), gated on the
  // conditional flag exactly as the legacy tab does.
  const showIfGates: ShowIfGateOption[] =
    focusedQuestion && conditionalEnabled
      ? computeShowIfGates(sections, questions, focusedQuestion)
      : [];

  // Questions whose showIf references the focused question — via the SHARED
  // predicate (co-validate C2), gated on the conditional flag as elsewhere.
  const showIfDependents: QuestionDraft[] =
    focusedQuestion && conditionalEnabled
      ? findShowIfDependents(questions, focusedQuestion)
      : [];

  return (
    <div
      data-testid="three-pane-workspace"
      className="grid grid-cols-1 lg:grid-cols-[minmax(14rem,22%)_1fr_30%] gap-4"
    >
      {/* LEFT — EditorOutline (section→question tree, shared commands). */}
      <aside aria-label="Question outline" className="lg:sticky lg:top-4 lg:self-start">
        <EditorOutline
          sections={sections}
          questions={questions}
          focusedQuestionUid={selection.focusedQuestionUid}
          setFocusedQuestionUid={selection.setFocusedQuestionUid}
          isSectionCollapsed={selection.isSectionCollapsed}
          toggleSectionCollapsed={selection.toggleSectionCollapsed}
          setSectionCollapsed={selection.setSectionCollapsed}
          isReadOnly={isReadOnly}
          isUnlocked={isUnlocked}
          conditionalEnabled={conditionalEnabled}
          onAddQuestion={addQuestion}
          onDuplicateQuestion={duplicateQuestion}
          onDeleteQuestion={deleteQuestion}
          onReorderQuestions={reorderQuestions}
          onGoToSections={onGoToSections}
          onAddSection={handleSectionsAdd}
          onRenameSection={handleSectionsRename}
          onMoveSectionUp={handleSectionsMoveUp}
          onMoveSectionDown={handleSectionsMoveDown}
          onDeleteSection={deleteSection}
          onMoveQuestion={moveQuestionToSection}
        />
      </aside>

      {/* CENTER — in-context canvas. Keyed by uid + shapeSignature so the local,
          throwaway preview answer-state resets on focus change AND on a
          widget-shape change (type/scale/options) to the SAME focused question
          (ED5 B-4/A-3/C1 — co-validate C4). */}
      <QuestionCanvas
        key={
          focusedQuestion
            ? `${focusedQuestion.uid}:${shapeSignature(focusedQuestion)}`
            : "none"
        }
        question={focusedQuestion}
        sectionName={focusedSectionName}
      />

      {/* RIGHT — reused QuestionInspector (verbatim). */}
      <aside aria-label="Question inspector" className="lg:sticky lg:top-4 lg:self-start">
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
