"use client";

/**
 * SingleColumnFormBuilder — ED6 (spec 19ah), the flag-ON authoring surface.
 *
 * Flag-ON (`WAVE_ED6_SINGLE_COLUMN_ENABLED`, which WINS over the ED4
 * `WAVE_ED4_THREE_PANE_ENABLED`) replacement for the Questions tab body inside
 * `TabbedShell`: a single scrolling column, **Google-Forms-style** — one card per
 * question grouped under inline section-header bands. The Sections tab folds in
 * here (its trigger disappears in single mode), so section create/rename/reorder/
 * cascade-delete happen on the bands.
 *
 * ONE shell (co-validate C1): reads the SAME `model` `TabbedShell` uses (no second
 * hook call), so flag-OFF stays byte-identical by construction. Every structural
 * mutation routes through the SHARED `useEditorCommands` glue (confirm → model
 * command → focus) that `EditorOutline` also uses — no bypass, no duplicated
 * orchestration (co-validate §15.5). Per-card display data is derived ONCE via
 * `buildCardViewModels` and handed to memoized `QuestionCard`s (co-validate §15.6).
 *
 * T8 — within-section drag reorder (one DndContext + per-section SortableContext,
 * keyboard sensor drivable in jsdom, decision delegated to the pure
 * `resolveOutlineDrop`); cross-section MOVE via each card's "Move to section…"
 * select (cross-section drag is a fast-follow, co-validate Q1); contextual "+ Add
 * question below" inserts after the focused card. The expanded card body — live
 * preview + bare `QuestionInspector` (T11) — fills the `card-body-<uid>` slot next.
 *
 * ED9 (spec 19al-plan, T6) — the orchestration described above (commands glue,
 * card view-models, focus restoration, section grouping, DnD wiring, SR
 * announcements) lives in `useSingleColumnBuilderController` so the later
 * `FormsBuilder` reuses it verbatim (Codex co-validate finding #3). This file is
 * now a THIN renderer over that hook; its rendered output is unchanged (pinned by
 * the ED9 golden shell baseline + the single-column suite).
 */

import React from "react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import type { TemplateEditorModel } from "./hooks/useTemplateEditorModel";
import { useSingleColumnBuilderController } from "./hooks/useSingleColumnBuilderController";
import { QuestionCard } from "./QuestionCard";
import { QuestionCanvas } from "./QuestionCanvas";
import { QuestionInspector } from "./QuestionInspector";
import { computeShowIfGates, findShowIfDependents } from "./question-commands";
import { shapeSignature } from "./question-widget-mapper";

export interface SingleColumnFormBuilderProps {
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
  /** Retained for prop-parity with `ThreePaneWorkspace`; unused here. */
  onGoToSections: () => void;
  /** Presentation-only mobile containment; default false preserves ED6 output. */
  responsiveEnabled?: boolean;
}

export function SingleColumnFormBuilder({
  model,
  isReadOnly,
  isUnlocked,
  findingsEnabled,
  conditionalEnabled,
  publishedOptionKeys,
  responsiveEnabled = false,
}: SingleColumnFormBuilderProps) {
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

  if (sections.length === 0) {
    return (
      <div
        data-testid="single-column-builder"
        className={responsiveEnabled ? "min-w-0 max-w-full break-words" : undefined}
        {...(responsiveEnabled ? { "data-responsive-builder": "" } : {})}
      >
        <div
          data-testid="single-column-empty"
          className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground"
        >
          <p>No sections yet. Add your first section to start building.</p>
          {!isReadOnly && (
            <button
              type="button"
              data-testid="single-column-add-first-section"
              onClick={model.handleSectionsAdd}
              className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground"
            >
              Add your first section
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
      <div
        data-testid="single-column-builder"
        className={
          responsiveEnabled
            ? "flex min-w-0 max-w-full flex-col gap-4 break-words"
            : "flex flex-col gap-4"
        }
        {...(responsiveEnabled ? { "data-responsive-builder": "" } : {})}
      >
        {sections.map((s) => {
          const list = bySection.get(s.stableKey) ?? [];
          const collapsed = selection.isSectionCollapsed(s.stableKey);
          const labeled = list.filter((q) => (q.label ?? "").trim() !== "").length;
          const uids = list.map((q) => q.uid);
          return (
            <section
              key={s.uid}
              role="group"
              aria-label={s.name.trim() || "Untitled section"}
              data-testid={`sc-section-${s.stableKey}`}
              className={
                responsiveEnabled
                  ? "min-w-0 max-w-full rounded-lg border border-border"
                  : "rounded-lg border border-border"
              }
            >
              <div
                className={
                  responsiveEnabled
                    ? "sticky top-0 z-10 flex min-w-0 flex-wrap items-center gap-2 rounded-t-lg border-b border-border bg-muted px-3 py-2"
                    : "sticky top-0 z-10 flex items-center gap-2 rounded-t-lg border-b border-border bg-muted px-3 py-2"
                }
              >
                <button
                  type="button"
                  data-testid={`sc-section-toggle-${s.stableKey}`}
                  aria-expanded={!collapsed}
                  aria-label={collapsed ? "Expand section" : "Collapse section"}
                  onClick={() => selection.toggleSectionCollapsed(s.stableKey)}
                  className={
                    responsiveEnabled
                      ? "inline-flex min-h-11 min-w-11 items-center justify-center text-muted-foreground"
                      : "text-muted-foreground"
                  }
                >
                  {collapsed ? "▸" : "▾"}
                </button>
                <input
                  data-testid={`sc-section-name-${s.stableKey}`}
                  aria-label="Section name"
                  value={s.name}
                  placeholder="Section name"
                  disabled={isReadOnly}
                  onChange={(e) => model.handleSectionsRename(s.uid, e.target.value)}
                  className={
                    responsiveEnabled
                      ? "min-h-11 min-w-0 basis-full bg-transparent font-semibold outline-none sm:basis-auto sm:flex-1"
                      : "flex-1 bg-transparent font-semibold outline-none"
                  }
                />
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {labeled}/{list.length} labeled
                </span>
                {!isReadOnly && (
                  <span
                    className={
                      responsiveEnabled
                        ? "flex min-w-0 flex-wrap gap-2 text-xs text-muted-foreground"
                        : "flex shrink-0 gap-2 text-xs text-muted-foreground"
                    }
                  >
                    <button
                      type="button"
                      data-testid={`sc-section-add-q-${s.stableKey}`}
                      onClick={() => commands.addQuestion(s.stableKey)}
                      className={responsiveEnabled ? "min-h-11 px-2" : undefined}
                    >
                      + Question
                    </button>
                    <button
                      type="button"
                      data-testid={`sc-section-up-${s.stableKey}`}
                      aria-label="Move section up"
                      onClick={() => model.handleSectionsMoveUp(s.uid)}
                      className={
                        responsiveEnabled
                          ? "inline-flex min-h-11 min-w-11 items-center justify-center"
                          : undefined
                      }
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      data-testid={`sc-section-down-${s.stableKey}`}
                      aria-label="Move section down"
                      onClick={() => model.handleSectionsMoveDown(s.uid)}
                      className={
                        responsiveEnabled
                          ? "inline-flex min-h-11 min-w-11 items-center justify-center"
                          : undefined
                      }
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      data-testid={`sc-section-delete-${s.stableKey}`}
                      onClick={() => commands.deleteSection(s.uid)}
                      className={
                        responsiveEnabled
                          ? "min-h-11 px-2 text-destructive"
                          : "text-destructive"
                      }
                    >
                      Delete
                    </button>
                  </span>
                )}
              </div>

              {!collapsed && (
                <div className="flex flex-col gap-2 p-2">
                  {list.length === 0 ? (
                    <div
                      data-testid={`sc-section-empty-${s.stableKey}`}
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
                          data-testid={`sc-add-question-${s.stableKey}`}
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
                            <QuestionCard
                              vm={vm}
                              isFocused={focused}
                              isReadOnly={isReadOnly}
                              sections={sections}
                              onFocus={onFocus}
                              onDuplicate={duplicateQuestion}
                              onDelete={deleteQuestion}
                              onMove={moveQuestion}
                              registerFocusRef={registerFocusRef}
                            >
                              {focused && (
                                <>
                                  <QuestionCanvas
                                    key={`${q.uid}:${shapeSignature(q)}`}
                                    question={q}
                                    sectionName={s.name.trim() || null}
                                  />
                                  <QuestionInspector
                                    bare
                                    question={q}
                                    isReadOnly={isReadOnly}
                                    isUnlocked={isUnlocked}
                                    findingsEnabled={findingsEnabled}
                                    conditionalEnabled={conditionalEnabled}
                                    showIfGates={
                                      conditionalEnabled
                                        ? computeShowIfGates(sections, questions, q)
                                        : []
                                    }
                                    showIfDependents={
                                      conditionalEnabled
                                        ? findShowIfDependents(questions, q)
                                        : []
                                    }
                                    onClearDependents={(uids) => {
                                      for (const uid of uids)
                                        model.handleUpdateQuestion(uid, { showIf: null });
                                    }}
                                    publishedOptionKeys={publishedOptionKeys}
                                    onUpdate={(patch) =>
                                      model.handleUpdateQuestion(q.uid, patch)
                                    }
                                    responsiveEnabled={responsiveEnabled}
                                  />
                                </>
                              )}
                            </QuestionCard>
                            {focused && !isReadOnly && (
                              <button
                                type="button"
                                data-testid={`sc-add-below-${q.uid}`}
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
            </section>
          );
        })}
        {!isReadOnly && (
          <div className="flex justify-center">
            <button
              type="button"
              data-testid="single-column-add-section"
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
