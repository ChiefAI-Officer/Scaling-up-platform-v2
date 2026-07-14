"use client";

/**
 * EditorOutline — ED4 (spec 19af §3.3 left pane / §3.4 shared commands + focus
 * policy), Task 4.
 *
 * The three-pane workspace's LEFT pane: a nested section→question tree (NOT a
 * flat list). Sections render as collapsible headers; each holds its own
 * within-section drag-and-keyboard reorderable question list with per-row
 * focus / duplicate / delete affordances and a per-section "+ Add question".
 *
 * DISCIPLINE (co-validate C2): every mutation runs through the SHARED model
 * commands (`onAddQuestion`/`onDuplicateQuestion`/`onDeleteQuestion`/
 * `onReorderQuestions`) that both this outline and the legacy `QuestionsTab`
 * call — the outline can't bypass the show-if dependent cleanup (the model's
 * `deleteQuestion` clears dependents; the delete confirm names them via the
 * SHARED `buildQuestionDeletePrompt`). Focus goes through the shared
 * `useEditorSelection` slice so it PERSISTS across tab switches (unlike
 * `QuestionsTab`'s mount-reset — the deliberate three-pane divergence, G5).
 *
 * Focus policy (§3.4 / G10): row click → focus that question; add → focus the
 * returned new uid; duplicate → focus the copy; delete the FOCUSED question →
 * focus the next in-section sibling (previous if it was last; null if the
 * section is now empty); reorder → focus unchanged. Questions-only focus:
 * clicking a section header only expands/collapses.
 *
 * Read-only (G4): a published version disables add/duplicate/delete/reorder;
 * rows stay navigable (focus allowed).
 */

import React, { useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, GripVertical } from "lucide-react";

import type { SectionDraft } from "./SectionsCard";
import type { QuestionDraftRow } from "./question-serialization";
import {
  buildQuestionDeletePrompt,
  findShowIfDependents,
} from "./question-commands";

type QuestionDraft = QuestionDraftRow;

export interface EditorOutlineProps {
  sections: SectionDraft[];
  questions: QuestionDraft[];
  /** Shared selection slice (persists across tab switches — G5). */
  focusedQuestionUid: string | null;
  setFocusedQuestionUid: (uid: string | null) => void;
  /** Published version ⇒ read-only mutation affordances (G4). */
  isReadOnly: boolean;
  /** Wave T — inherited-question delete uses the history-consequence confirm. */
  isUnlocked: boolean;
  /** Wave W — dependents named in the delete confirm when authoring is on. */
  conditionalEnabled: boolean;
  /** Shared model command — appends a question, returns the new uid. */
  onAddQuestion: (sectionStableKey: string) => string;
  /** Shared model command — duplicates a question, returns the copy uid. */
  onDuplicateQuestion: (uid: string) => string;
  /** Shared model command — removes a question + clears its show-if dependents. */
  onDeleteQuestion: (uid: string) => {
    removedUid: string;
    affectedDependentUids: string[];
  };
  /** Shared model command — within-section reorder (drag + keyboard). */
  onReorderQuestions: (sectionStableKey: string, newOrderUids: string[]) => void;
  /** Switch the active tab to Sections (owned by the shell — G9 empty state). */
  onGoToSections: () => void;
}

// ────────────────────────────────────────────────────────────────────────
// Sortable question row (mirrors QuestionsTab's card testid/handle conventions
// so the shared jsdom keyboard-reorder harness drives it identically).
// ────────────────────────────────────────────────────────────────────────
interface SortableOutlineRowProps {
  question: QuestionDraft;
  isFocused: boolean;
  isReadOnly: boolean;
  onFocus: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function SortableOutlineRow({
  question,
  isFocused,
  isReadOnly,
  onFocus,
  onDuplicate,
  onDelete,
}: SortableOutlineRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: question.uid, disabled: isReadOnly });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const key = question.stableKey || question.uid;
  const focusedClass = isFocused
    ? "ring-2 ring-primary border-primary"
    : "border-border hover:bg-muted/30";

  return (
    <li
      ref={setNodeRef}
      style={style}
      data-testid={`question-card-${key}`}
      aria-current={isFocused ? "true" : undefined}
      className={`flex items-start gap-1.5 px-2 py-2 rounded-md border bg-card ${focusedClass}`}
    >
      <button
        type="button"
        aria-label={`Drag to reorder ${question.stableKey || "(new question)"}`}
        data-testid={`drag-handle-${key}`}
        disabled={isReadOnly}
        className="mt-0.5 cursor-grab disabled:cursor-not-allowed text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>

      {/* flex-1 column: content on top, actions BELOW — so the type/key badges
          never compete horizontally with Duplicate/Delete in the narrow outline
          column (ED4 launch hotfix — the badges used to overflow and overlap the
          action buttons at ~20% width). */}
      <div className="flex-1 min-w-0 space-y-1">
        <button
          type="button"
          onClick={onFocus}
          data-testid={`outline-focus-${key}`}
          aria-pressed={isFocused}
          aria-label={`Edit ${question.stableKey || "new question"}`}
          className="block w-full min-w-0 text-left"
        >
          <span className="flex flex-wrap items-center gap-1.5 mb-0.5">
            <span
              className="inline-flex items-center px-1 py-0.5 text-[0.5625rem] font-mono font-semibold uppercase tracking-wide rounded bg-muted text-muted-foreground"
            >
              {question.stableKey || (
                <span className="italic normal-case">(assigned on save)</span>
              )}
            </span>
            <span className="inline-flex items-center px-1 py-0.5 text-[0.5625rem] font-semibold uppercase tracking-wide rounded bg-success/10 text-success">
              {question.type}
            </span>
          </span>
          <span className="block text-xs text-foreground truncate">
            {question.label || (
              <span className="italic text-muted-foreground">(no label yet)</span>
            )}
          </span>
        </button>

        <span className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onDuplicate}
            disabled={isReadOnly}
            className="text-[0.6875rem] font-medium px-1.5 py-1 rounded text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={isReadOnly}
            className="text-[0.6875rem] font-medium px-1.5 py-1 rounded text-destructive hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Delete
          </button>
        </span>
      </div>
    </li>
  );
}

// ────────────────────────────────────────────────────────────────────────
// EditorOutline
// ────────────────────────────────────────────────────────────────────────
export function EditorOutline({
  sections,
  questions,
  focusedQuestionUid,
  setFocusedQuestionUid,
  isReadOnly,
  isUnlocked,
  conditionalEnabled,
  onAddQuestion,
  onDuplicateQuestion,
  onDeleteQuestion,
  onReorderQuestions,
  onGoToSections,
}: EditorOutlineProps) {
  // Group + sort questions by section (identical semantics to QuestionsTab).
  const questionsBySection = useMemo(() => {
    const out: Record<string, QuestionDraft[]> = {};
    for (const s of sections) out[s.stableKey] = [];
    for (const q of questions) {
      if (!out[q.sectionStableKey]) out[q.sectionStableKey] = [];
      out[q.sectionStableKey].push(q);
    }
    for (const k of Object.keys(out)) {
      out[k] = [...out[k]].sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return out;
  }, [questions, sections]);

  // Collapse state — sections start EXPANDED (undefined ⇒ open).
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const isExpanded = (key: string) => !collapsed[key];
  const toggleSection = (key: string) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  // Drag-and-drop sensors — pointer AND keyboard (the keyboard sensor is the
  // jsdom-drivable path; both call the SAME onDragEnd → onReorderQuestions).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (sectionKey: string, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const list = questionsBySection[sectionKey] ?? [];
    const oldIndex = list.findIndex((q) => q.uid === String(active.id));
    const newIndex = list.findIndex((q) => q.uid === String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const newOrderUids = arrayMove(list, oldIndex, newIndex).map((q) => q.uid);
    onReorderQuestions(sectionKey, newOrderUids);
    // Focus unchanged on reorder (G10).
  };

  const handleAdd = (sectionKey: string) => {
    if (isReadOnly) return;
    const newUid = onAddQuestion(sectionKey);
    // Make sure the section is open so the new row is visible.
    setCollapsed((prev) => ({ ...prev, [sectionKey]: false }));
    setFocusedQuestionUid(newUid);
  };

  const handleDuplicate = (uid: string) => {
    if (isReadOnly) return;
    const newUid = onDuplicateQuestion(uid);
    setFocusedQuestionUid(newUid);
  };

  const handleDelete = (q: QuestionDraft) => {
    if (isReadOnly) return;
    const dependentKeys = conditionalEnabled
      ? findShowIfDependents(questions, q).map((d) => d.stableKey)
      : [];
    const ok = window.confirm(
      buildQuestionDeletePrompt(q, { isUnlocked, dependentKeys }),
    );
    if (!ok) return;
    // Focus policy (G10): only move focus when the FOCUSED question is removed.
    if (focusedQuestionUid === q.uid) {
      const list = questionsBySection[q.sectionStableKey] ?? [];
      const idx = list.findIndex((x) => x.uid === q.uid);
      const neighbor = list[idx + 1] ?? list[idx - 1] ?? null;
      setFocusedQuestionUid(neighbor?.uid ?? null);
    }
    onDeleteQuestion(q.uid);
  };

  // ── G9 empty state — zero sections → link to the Sections tab. ──
  if (sections.length === 0) {
    return (
      <section
        className="wf-card space-y-3"
        style={{ padding: "1rem" }}
        data-testid="editor-outline"
      >
        <h3 className="wf-card-title">Outline</h3>
        <div
          data-testid="editor-outline-empty"
          className="text-xs italic text-muted-foreground py-4 space-y-2"
        >
          <p>No sections yet — add one in the Sections tab.</p>
          <button
            type="button"
            data-testid="editor-outline-go-to-sections"
            onClick={onGoToSections}
            className="wf-btn wf-btn-secondary not-italic"
          >
            Go to Sections
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      className="wf-card space-y-2"
      style={{ padding: "1rem" }}
      data-testid="editor-outline"
    >
      <h3 className="wf-card-title">Outline</h3>

      <ul className="space-y-3">
        {sections.map((s) => {
          const list = questionsBySection[s.stableKey] ?? [];
          const expanded = isExpanded(s.stableKey);
          return (
            <li key={s.uid} data-testid={`outline-section-${s.stableKey}`}>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  data-testid={`outline-section-toggle-${s.stableKey}`}
                  aria-expanded={expanded}
                  onClick={() => toggleSection(s.stableKey)}
                  className="flex-1 min-w-0 flex items-center gap-1.5 px-1 py-1 rounded text-left text-sm font-semibold text-foreground hover:bg-muted"
                >
                  {expanded ? (
                    <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
                  )}
                  <span className="inline-flex items-center px-1 py-0.5 text-[0.5625rem] font-mono font-semibold uppercase tracking-wide rounded bg-muted text-muted-foreground">
                    {s.stableKey}
                  </span>
                  <span className="flex-1 min-w-0 truncate">
                    {s.name || (
                      <span className="italic text-muted-foreground">
                        (no name)
                      </span>
                    )}
                  </span>
                  <span className="text-[0.625rem] text-muted-foreground whitespace-nowrap">
                    {list.length}
                  </span>
                </button>
              </div>

              {expanded ? (
                <div className="pl-4 pt-1.5 space-y-1.5">
                  {list.length === 0 ? (
                    <p className="text-[0.6875rem] italic text-muted-foreground py-1">
                      No questions in this section.
                    </p>
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={(e) => handleDragEnd(s.stableKey, e)}
                    >
                      <SortableContext
                        items={list.map((q) => q.uid)}
                        strategy={verticalListSortingStrategy}
                      >
                        <ul className="space-y-1.5">
                          {list.map((q) => (
                            <SortableOutlineRow
                              key={q.uid}
                              question={q}
                              isFocused={focusedQuestionUid === q.uid}
                              isReadOnly={isReadOnly}
                              onFocus={() => setFocusedQuestionUid(q.uid)}
                              onDuplicate={() => handleDuplicate(q.uid)}
                              onDelete={() => handleDelete(q)}
                            />
                          ))}
                        </ul>
                      </SortableContext>
                    </DndContext>
                  )}

                  <button
                    type="button"
                    data-testid={`outline-add-question-${s.stableKey}`}
                    onClick={() => handleAdd(s.stableKey)}
                    disabled={isReadOnly}
                    className="text-xs font-medium text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    + Add question
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
