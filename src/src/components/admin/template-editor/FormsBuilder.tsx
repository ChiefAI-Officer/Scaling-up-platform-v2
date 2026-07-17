"use client";

/**
 * FormsBuilder — ED9 (spec 19al-plan), Task 10.
 *
 * The flag-ON Google-Forms Build body. A THIN renderer over
 * `useSingleColumnBuilderController` (the orchestration lifted VERBATIM out of
 * `SingleColumnFormBuilder` in Task 6 — DnD wiring, section grouping, per-card
 * view-models, focus restoration, SR announcements, and the shared confirm →
 * command → focus glue), composing the ED9 presentation pieces built in Tasks
 * 7-9: `FormHeaderCard` (top) + `FormSectionCard` (per section band) +
 * `FormQuestionCard` (per question, its focused body self-contained). It
 * re-implements NONE of that — same hook call as `SingleColumnFormBuilder`
 * now uses, so the two surfaces can never drift.
 *
 * ADDITIVE — nothing wires this into `TabbedShell` yet (that is T11), so the
 * existing single-column DOM (goldens/frozen/single-column suites) is untouched
 * by this file.
 *
 * ADD MODEL (Codex co-validate finding #4): question-add is **section-local
 * only** — the `FormSectionCard` ⋯ "Add question", the empty-section add zone,
 * and the focused card's "+ Add question below". The bottom bar shows ONLY
 * "+ Add section"; there is NO global "+ Add question" button. The empty state
 * (no sections) offers ONLY "+ Add section" — a question cannot exist without a
 * section. `isReadOnly` suppresses every add/edit affordance (the section ⋯
 * menu, the drag handles, the footer, and all add buttons).
 *
 * Header identity: `template`/`onTemplateFieldChange` come straight from the
 * SHARED model — `model.templateValues` (name/description) + the PATCH-object
 * `model.handleTemplateFieldChange` the Metadata tab already uses — so the hero
 * stays two-way synced with Metadata for free (one `templateValues` state, one
 * setter, no second source of truth).
 */

import React from "react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import type { TemplateEditorModel } from "./hooks/useTemplateEditorModel";
import { useSingleColumnBuilderController } from "./hooks/useSingleColumnBuilderController";
import { FormHeaderCard } from "./FormHeaderCard";
import { FormSectionCard } from "./FormSectionCard";
import { FormQuestionCard } from "./FormQuestionCard";
import { computeShowIfGates, findShowIfDependents } from "./question-commands";

export interface FormsBuilderProps {
  /** The composed editor model, shared with `TabbedShell` (ONE shell rule). */
  model: TemplateEditorModel;
  /** Published version ⇒ read-only mutation affordances (reused signal). */
  isReadOnly: boolean;
  /** Wave T — per-type question editing unlocked. */
  isUnlocked: boolean;
  /** Wave U — findings-logic authoring panel. */
  findingsEnabled: boolean;
  /** Wave W — conditional (show-if) authoring panel. */
  conditionalEnabled: boolean;
  /** Wave T — union of published option keys per question stableKey. */
  publishedOptionKeys: Record<string, readonly string[]>;
  /** Retained for prop-parity with the other Build bodies; unused here. */
  onGoToSections: () => void;
}

export function FormsBuilder({
  model,
  isReadOnly,
  isUnlocked,
  findingsEnabled,
  conditionalEnabled,
  publishedOptionKeys,
}: FormsBuilderProps) {
  const {
    sections,
    questions,
    selection,
    commands,
    vms,
    bySection,
    sensors,
    handleDragEnd,
    dndAnnouncements,
    registerFocusRef,
    addButtonRefs,
  } = useSingleColumnBuilderController(model, {
    conditionalEnabled,
    isReadOnly,
    isUnlocked,
  });
  const { duplicateQuestion, deleteQuestion, moveQuestion } = commands;

  const onFocus = selection.setFocusedQuestionUid;

  const header = (
    <FormHeaderCard
      template={{
        name: model.templateValues.name,
        description: model.templateValues.description,
      }}
      questions={questions}
      sectionCount={sections.length}
      isReadOnly={isReadOnly}
      onTemplateFieldChange={model.handleTemplateFieldChange}
    />
  );

  if (sections.length === 0) {
    return (
      <div data-testid="forms-builder" className="flex flex-col gap-4">
        {header}
        <div
          data-testid="forms-builder-empty"
          className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground"
        >
          <p>No sections yet. Add your first section to start building.</p>
          {!isReadOnly && (
            <button
              type="button"
              data-testid="forms-builder-add-first-section"
              onClick={model.handleSectionsAdd}
              className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground"
            >
              + Add section
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      accessibility={{ announcements: dndAnnouncements }}
    >
      <div data-testid="forms-builder" className="flex flex-col gap-4">
        {header}
        {sections.map((s) => {
          const list = bySection.get(s.stableKey) ?? [];
          const collapsed = selection.isSectionCollapsed(s.stableKey);
          const labeled = list.filter((q) => (q.label ?? "").trim() !== "").length;
          const uids = list.map((q) => q.uid);
          return (
            <div
              key={s.uid}
              data-testid={`forms-section-${s.stableKey}`}
              className="flex flex-col gap-2"
            >
              <FormSectionCard
                section={s}
                labeledCount={labeled}
                totalCount={list.length}
                collapsed={collapsed}
                isReadOnly={isReadOnly}
                onRename={model.handleSectionsRename}
                onSetDescription={model.handleSectionsSetDescription}
                onToggleCollapsed={selection.toggleSectionCollapsed}
                onAddQuestion={(stableKey) => commands.addQuestion(stableKey)}
                onMoveUp={model.handleSectionsMoveUp}
                onMoveDown={model.handleSectionsMoveDown}
                onDelete={commands.deleteSection}
              />

              {!collapsed && (
                <div className="flex flex-col gap-2 pl-3">
                  {list.length === 0 ? (
                    <div
                      data-testid={`forms-section-empty-${s.stableKey}`}
                      className="flex flex-col items-center gap-2 rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground"
                    >
                      No questions yet.
                      {!isReadOnly && (
                        <button
                          type="button"
                          ref={(el) => {
                            if (el) addButtonRefs.current.set(s.stableKey, el);
                            else addButtonRefs.current.delete(s.stableKey);
                          }}
                          data-testid={`forms-add-question-${s.stableKey}`}
                          onClick={() => commands.addQuestion(s.stableKey)}
                          className="rounded bg-primary px-3 py-1 text-primary-foreground"
                        >
                          + Add question
                        </button>
                      )}
                    </div>
                  ) : (
                    <SortableContext items={uids} strategy={verticalListSortingStrategy}>
                      {list.map((q) => {
                        const vm = vms.get(q.uid);
                        if (!vm) return null;
                        const focused = selection.focusedQuestionUid === q.uid;
                        return (
                          <React.Fragment key={q.uid}>
                            <FormQuestionCard
                              vm={vm}
                              question={focused ? q : null}
                              isFocused={focused}
                              isReadOnly={isReadOnly}
                              isUnlocked={isUnlocked}
                              findingsEnabled={findingsEnabled}
                              conditionalEnabled={conditionalEnabled}
                              sections={sections}
                              showIfGates={
                                focused && conditionalEnabled
                                  ? computeShowIfGates(sections, questions, q)
                                  : []
                              }
                              showIfDependents={
                                focused && conditionalEnabled
                                  ? findShowIfDependents(questions, q)
                                  : []
                              }
                              publishedOptionKeys={publishedOptionKeys}
                              onFocus={onFocus}
                              onDuplicate={duplicateQuestion}
                              onDelete={deleteQuestion}
                              onMove={moveQuestion}
                              onClearDependents={(uids) => {
                                for (const uid of uids)
                                  model.handleUpdateQuestion(uid, { showIf: null });
                              }}
                              onUpdate={(patch) =>
                                model.handleUpdateQuestion(q.uid, patch)
                              }
                              registerFocusRef={registerFocusRef}
                            />
                            {focused && !isReadOnly && (
                              <button
                                type="button"
                                data-testid={`forms-add-below-${q.uid}`}
                                onClick={() =>
                                  commands.addQuestion(s.stableKey, { afterUid: q.uid })
                                }
                                className="self-center rounded-full border border-border px-3 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                              >
                                + Add question below
                              </button>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </SortableContext>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!isReadOnly && (
          <div data-testid="forms-bottom-bar" className="flex justify-center">
            <button
              type="button"
              data-testid="forms-add-section"
              onClick={model.handleSectionsAdd}
              className="rounded border border-dashed border-border px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              + Add section
            </button>
          </div>
        )}
      </div>
    </DndContext>
  );
}
