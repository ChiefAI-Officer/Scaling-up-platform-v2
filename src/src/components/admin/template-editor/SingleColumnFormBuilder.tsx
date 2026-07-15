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
 * Task 7 scope: section bands + COLLAPSED cards + focus + empty states. Reorder /
 * cross-section move (Task 8) and the expanded card body — live preview + the bare
 * `QuestionInspector` (Task 11) — layer on next; the focused card already renders
 * an empty `card-body-<uid>` slot for Task 11 to fill.
 */

import React, { useCallback, useLayoutEffect, useMemo, useRef } from "react";

import type { TemplateEditorModel } from "./hooks/useTemplateEditorModel";
import { useEditorCommands, type EditorCommandsModel } from "./hooks/useEditorCommands";
import { buildCardViewModels } from "./single-column-view-model";
import { QuestionCard } from "./QuestionCard";

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
  /**
   * Switch the active tab to Sections. Retained for prop-parity with
   * `ThreePaneWorkspace`; single-column folds sections inline, so this surface
   * does not use it (its empty state adds a section directly).
   */
  onGoToSections: () => void;
}

export function SingleColumnFormBuilder({
  model,
  isReadOnly,
  isUnlocked,
  conditionalEnabled,
}: SingleColumnFormBuilderProps) {
  const { sections, questions, selection } = model;

  // Shared orchestration (confirm → command → focus). Structural subset of the
  // model; latest-latched inside the hook, so building it inline is fine.
  const commandsModel: EditorCommandsModel = {
    sections,
    questions,
    selection: {
      focusedQuestionUid: selection.focusedQuestionUid,
      setFocusedQuestionUid: selection.setFocusedQuestionUid,
      setSectionCollapsed: selection.setSectionCollapsed,
    },
    addQuestion: model.addQuestion,
    duplicateQuestion: model.duplicateQuestion,
    deleteQuestion: model.deleteQuestion,
    deleteSection: model.deleteSection,
    moveQuestionToSection: model.moveQuestionToSection,
  };
  const commands = useEditorCommands(commandsModel, {
    conditionalEnabled,
    isReadOnly,
    isUnlocked,
  });
  const { consumePendingFocus, duplicateQuestion, deleteQuestion } = commands;

  // Per-card view-models — ONE pass over the whole instrument (co-validate §15.6).
  const vms = useMemo(
    () => buildCardViewModels(questions, sections, { conditionalEnabled }),
    [questions, sections, conditionalEnabled],
  );

  // Focus glue (mirrors EditorOutline) — apply the hook's pending DOM-focus target
  // after the commit that added/removed the row.
  const rowFocusRefs = useRef(new Map<string, HTMLButtonElement>());
  const addButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  useLayoutEffect(() => {
    const pending = consumePendingFocus();
    if (!pending) return;
    const el =
      pending.kind === "row"
        ? rowFocusRefs.current.get(pending.uid)
        : addButtonRefs.current.get(pending.sectionKey);
    if (!el) return;
    el.focus();
    el.scrollIntoView?.({ block: "nearest" });
  }, [questions, consumePendingFocus]);

  const registerFocusRef = useCallback(
    (uid: string, el: HTMLButtonElement | null) => {
      if (el) rowFocusRefs.current.set(uid, el);
      else rowFocusRefs.current.delete(uid);
    },
    [],
  );

  const onFocus = selection.setFocusedQuestionUid;

  // Group questions by section, ascending sortOrder.
  const bySection = useMemo(() => {
    const grouped = new Map<string, typeof questions>();
    for (const s of sections) grouped.set(s.stableKey, []);
    const ordered = [...questions].sort((a, b) => a.sortOrder - b.sortOrder);
    for (const q of ordered) {
      const arr = grouped.get(q.sectionStableKey);
      if (arr) (arr as (typeof questions)[number][]).push(q);
    }
    return grouped;
  }, [questions, sections]);

  if (sections.length === 0) {
    return (
      <div data-testid="single-column-builder">
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
    <div data-testid="single-column-builder" className="flex flex-col gap-4">
      {sections.map((s) => {
        const list = (bySection.get(s.stableKey) ?? []) as (typeof questions)[number][];
        const collapsed = selection.isSectionCollapsed(s.stableKey);
        const labeled = list.filter((q) => (q.label ?? "").trim() !== "").length;
        return (
          <section
            key={s.uid}
            role="group"
            aria-label={s.name.trim() || "Untitled section"}
            data-testid={`sc-section-${s.stableKey}`}
            className="rounded-lg border border-border"
          >
            <div className="sticky top-0 z-10 flex items-center gap-2 rounded-t-lg border-b border-border bg-muted px-3 py-2">
              <button
                type="button"
                data-testid={`sc-section-toggle-${s.stableKey}`}
                aria-expanded={!collapsed}
                aria-label={collapsed ? "Expand section" : "Collapse section"}
                onClick={() => selection.toggleSectionCollapsed(s.stableKey)}
                className="text-muted-foreground"
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
                className="flex-1 bg-transparent font-semibold outline-none"
              />
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {labeled}/{list.length} labeled
              </span>
              {!isReadOnly && (
                <span className="flex shrink-0 gap-2 text-xs text-muted-foreground">
                  <button
                    type="button"
                    data-testid={`sc-section-add-q-${s.stableKey}`}
                    onClick={() => commands.addQuestion(s.stableKey)}
                  >
                    + Question
                  </button>
                  <button
                    type="button"
                    data-testid={`sc-section-up-${s.stableKey}`}
                    aria-label="Move section up"
                    onClick={() => model.handleSectionsMoveUp(s.uid)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    data-testid={`sc-section-down-${s.stableKey}`}
                    aria-label="Move section down"
                    onClick={() => model.handleSectionsMoveDown(s.uid)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    data-testid={`sc-section-delete-${s.stableKey}`}
                    onClick={() => commands.deleteSection(s.uid)}
                    className="text-destructive"
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
                  list.map((q) => {
                    const vm = vms.get(q.uid);
                    if (!vm) return null;
                    return (
                      <QuestionCard
                        key={q.uid}
                        vm={vm}
                        isFocused={selection.focusedQuestionUid === q.uid}
                        isReadOnly={isReadOnly}
                        onFocus={onFocus}
                        onDuplicate={duplicateQuestion}
                        onDelete={deleteQuestion}
                        registerFocusRef={registerFocusRef}
                      />
                    );
                  })
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
