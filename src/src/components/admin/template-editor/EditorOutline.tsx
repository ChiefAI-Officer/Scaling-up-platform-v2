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
 *
 * Collapse (ED5 Task 3, audit C): section-collapse used to be LOCAL state
 * here, which reset on every unmount — the flag-ON "Edit" tab body unmounts
 * on tab-away (Radix `TabsContent` is not force-mounted) while focus (already
 * in `useEditorSelection`) persisted, an inconsistency. Collapse is now owned
 * by the shared `useEditorSelection` slice (passed in as
 * `isSectionCollapsed`/`toggleSectionCollapsed`/`setSectionCollapsed`) so it
 * survives the same unmount/remount focus already does.
 *
 * DOM focus/scroll (ED5 Task 5, audit C — focus rule): the G10 policy above
 * only ever moved the MODEL's `focusedQuestionUid` — real keyboard/DOM focus
 * and viewport scroll never followed, so a keyboard or screen-reader user's
 * focus could be silently dropped (delete sends it to the page top) or left
 * behind (add/duplicate leaves it on the button that was just clicked while
 * a new row appears elsewhere). Row focus buttons and each section's
 * "+ Add question" button register themselves into ref maps; a
 * `useLayoutEffect` keyed on `questions` applies a "pending focus" target —
 * set synchronously by the mutation handlers, alongside the model focus
 * call — once the mutated row list has re-rendered: add/duplicate → the
 * new/copy row; delete of the FOCUSED row → the survivor computed by the
 * shared `computeSurvivorFocus` (next sibling, else previous, else nearest
 * section), or the section's "+ Add question" control when the template has
 * no surviving questions left.
 *
 * Section DELETE (ED5 Task 10, audit B-2b): the cascade lives on the model
 * (`useTemplateEditorDraft.deleteSection`) — it removes the section AND every
 * question in it, ATOMICALLY, clearing the `showIf` of any question OUTSIDE
 * the section that gated on one of them (a dependent INSIDE the section is
 * just removed, never reported). The outline assembles the aggregated
 * confirm (`buildSectionDeletePrompt` — count, inherited-key enumeration when
 * Wave T is unlocked, freed-dependent names) from its own local
 * `questions`/`findShowIfDependents` read BEFORE calling the command, then
 * applies the same G10 focus discipline as a question delete: only
 * reposition focus when the currently focused question was inside the
 * deleted section (survivor via the shared `computeSurvivorFocus`, same DOM
 * focus/scroll mechanism as above).
 */

import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
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
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Trash2,
} from "lucide-react";

import type { SectionDraft } from "./SectionsCard";
import type { QuestionDraftRow } from "./question-serialization";
import {
  buildMoveQuestionPrompt,
  buildQuestionDeletePrompt,
  buildSectionDeletePrompt,
  computeSurvivorFocus,
  findShowIfDependents,
} from "./question-commands";
import { LogicMapDrawer } from "./LogicMapDrawer";

type QuestionDraft = QuestionDraftRow;

export interface EditorOutlineProps {
  sections: SectionDraft[];
  questions: QuestionDraft[];
  /** Shared selection slice (persists across tab switches — G5). */
  focusedQuestionUid: string | null;
  setFocusedQuestionUid: (uid: string | null) => void;
  /**
   * Shared collapse slice (ED5 Task 3, audit C) — lives in
   * `useEditorSelection` so it survives an EditorOutline unmount/remount,
   * just like `focusedQuestionUid`.
   */
  isSectionCollapsed: (key: string) => boolean;
  toggleSectionCollapsed: (key: string) => void;
  setSectionCollapsed: (key: string, collapsed: boolean) => void;
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
  /**
   * ED5 Task 9 (B-2) — shared model section commands, so authors never have
   * to leave the outline to add/rename/reorder a section. Mirrors
   * `SectionsCard`'s inline-rename input + arrow-button reorder idiom.
   */
  onAddSection: () => void;
  onRenameSection: (uid: string, name: string) => void;
  onMoveSectionUp: (uid: string) => void;
  onMoveSectionDown: (uid: string) => void;
  /**
   * ED5 Task 10 (B-2b) — shared model CASCADE command: removes the section
   * AND every question in it atomically, clearing external show-if
   * dependents (see the model's `deleteSection` doc). The outline assembles
   * the aggregated confirm and the survivor-focus recompute itself before
   * calling this.
   */
  onDeleteSection: (uid: string) => {
    removedSectionKey: string;
    removedQuestionUids: string[];
    affectedDependentUids: string[];
  };
  /**
   * ED5 Task 11 (B-3) — shared model command: moves a question to a
   * DIFFERENT section (`stableKey`/`showIf` untouched — only
   * `sectionStableKey`/`sortOrder` change). The outline confirms first for
   * an INHERITED question via the shared `buildMoveQuestionPrompt` (empty
   * string ⇒ skip the confirm entirely).
   */
  onMoveQuestion: (uid: string, targetSectionKey: string) => void;
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
  /** ED5 Task 5 — registers this row's focus button into the parent's DOM
   *  focus-ref map, keyed by uid (survives a blank stableKey pre-save). */
  registerFocusRef: (el: HTMLButtonElement | null) => void;
  /**
   * ED5 Task 7 (B-1a) — Wave W show-if awareness in the outline. `true` when
   * this row's own `showIf` is set (it renders conditionally); `showIf`
   * itself is only ever authored when `conditionalEnabled`, so this is
   * already flag-gated by construction at the call site.
   */
  showConditionalBadge: boolean;
  /**
   * ED5 Task 7 (B-1a) — count of OTHER questions whose `showIf.questionKey`
   * points at this row (via the shared `findShowIfDependents`, same
   * predicate the delete-confirm dependents warning uses). Zero ⇒ no badge.
   * Flag-gated at the call site (always 0 when `conditionalEnabled` is
   * false).
   */
  gateDependentCount: number;
  /**
   * ED5 Task 11 (B-3) — sections OTHER than this row's own (by stableKey),
   * the "Move to section…" control's option list. Empty ⇒ the control is
   * disabled (only one section exists).
   */
  otherSections: readonly Pick<SectionDraft, "uid" | "stableKey" | "name">[];
  /** ED5 Task 11 (B-3) — the row's own confirm-then-call handler. */
  onMove: (targetSectionKey: string) => void;
}

function SortableOutlineRow({
  question,
  isFocused,
  isReadOnly,
  onFocus,
  onDuplicate,
  onDelete,
  registerFocusRef,
  showConditionalBadge,
  gateDependentCount,
  otherSections,
  onMove,
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
          ref={registerFocusRef}
          onClick={onFocus}
          data-testid={`outline-focus-${key}`}
          aria-pressed={isFocused}
          aria-label={`Edit ${question.label || question.stableKey || "new question"} (${question.type})`}
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
            {showConditionalBadge && (
              <span className="inline-flex items-center px-1 py-0.5 text-[0.5625rem] font-semibold uppercase tracking-wide rounded bg-primary/10 text-primary">
                conditional
              </span>
            )}
            {gateDependentCount > 0 && (
              <span className="inline-flex items-center px-1 py-0.5 text-[0.5625rem] font-semibold uppercase tracking-wide rounded bg-warning/10 text-warning">
                gate ({gateDependentCount})
              </span>
            )}
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
          <select
            aria-label="Move to section"
            data-testid={`outline-move-select-${key}`}
            value=""
            onChange={(e) => {
              const targetSectionKey = e.target.value;
              if (targetSectionKey) onMove(targetSectionKey);
            }}
            disabled={isReadOnly || otherSections.length === 0}
            className="text-[0.6875rem] font-medium px-1 py-1 rounded border border-border bg-background text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">Move to section…</option>
            {otherSections.map((sec) => (
              <option key={sec.uid} value={sec.stableKey}>
                {sec.name || sec.stableKey}
              </option>
            ))}
          </select>
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
  isSectionCollapsed,
  toggleSectionCollapsed,
  setSectionCollapsed,
  isReadOnly,
  isUnlocked,
  conditionalEnabled,
  onAddQuestion,
  onDuplicateQuestion,
  onDeleteQuestion,
  onReorderQuestions,
  onGoToSections,
  onAddSection,
  onRenameSection,
  onMoveSectionUp,
  onMoveSectionDown,
  onDeleteSection,
  onMoveQuestion,
}: EditorOutlineProps) {
  // ED5 Task 8 (B-1b) — read-only "Logic map" drawer, gated on the Wave-W
  // conditional flag exactly like the row badges above.
  const [logicMapOpen, setLogicMapOpen] = useState(false);
  const logicMapTrigger = conditionalEnabled ? (
    <button
      type="button"
      data-testid="editor-outline-logic-map-trigger"
      onClick={() => setLogicMapOpen(true)}
      className="wf-btn wf-btn-secondary wf-btn-sm"
    >
      Logic map
    </button>
  ) : null;
  const logicMapDrawer = (
    <LogicMapDrawer
      open={logicMapOpen}
      onClose={() => setLogicMapOpen(false)}
      sections={sections}
      questions={questions}
    />
  );

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

  // Collapse state — sections start EXPANDED (undefined ⇒ open). Owned by
  // the shared `useEditorSelection` slice (ED5 Task 3) so it survives an
  // unmount/remount of this component.
  const isExpanded = (key: string) => !isSectionCollapsed(key);
  const toggleSection = (key: string) => toggleSectionCollapsed(key);

  // ── DOM focus/scroll (ED5 Task 5, audit C) ──────────────────────────────
  // Ref maps: row focus buttons keyed by uid (stable across a blank
  // pre-save stableKey), "+ Add question" buttons keyed by section
  // stableKey. A mutation handler stashes a "pending focus" target here
  // synchronously; the layout effect below applies it once `questions` has
  // re-rendered with the mutation reflected (the new/removed row exists or
  // doesn't yet at the time the handler runs — a functional setState runs
  // during render, so the DOM isn't ready until the NEXT commit).
  const rowFocusRefs = useRef(new Map<string, HTMLButtonElement>());
  const addButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocusRef = useRef<
    { kind: "row"; uid: string } | { kind: "add"; sectionKey: string } | null
  >(null);

  useLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    pendingFocusRef.current = null;
    const el =
      pending.kind === "row"
        ? rowFocusRefs.current.get(pending.uid)
        : addButtonRefs.current.get(pending.sectionKey);
    if (!el) return;
    el.focus();
    el.scrollIntoView?.({ block: "nearest" });
  }, [questions]);

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

  // ── Section commands (ED5 Task 9, B-2) ──────────────────────────────────
  const handleAddSection = () => {
    if (isReadOnly) return;
    onAddSection();
  };

  const handleRenameSection = (uid: string, name: string) => {
    if (isReadOnly) return;
    onRenameSection(uid, name);
  };

  const handleMoveSectionUp = (uid: string) => {
    if (isReadOnly) return;
    onMoveSectionUp(uid);
  };

  const handleMoveSectionDown = (uid: string) => {
    if (isReadOnly) return;
    onMoveSectionDown(uid);
  };

  // ── Section DELETE — cascade (ED5 Task 10, B-2b) ────────────────────────
  const handleDeleteSection = (s: SectionDraft) => {
    if (isReadOnly) return;
    const list = questionsBySection[s.stableKey] ?? [];
    const inheritedKeys = list.filter((qq) => qq.isInherited).map((qq) => qq.stableKey);
    const removedUidSet = new Set(list.map((qq) => qq.uid));
    // Union of gates' dependents, restricted to questions the cascade does
    // NOT already remove (an in-section dependent is being removed too — it
    // never "becomes always-visible", so it isn't named here).
    const freedDependentKeys = Array.from(
      new Set(
        list
          .flatMap((gate) => findShowIfDependents(questions, gate))
          .filter((dep) => !removedUidSet.has(dep.uid))
          .map((dep) => dep.stableKey),
      ),
    );
    const ok = window.confirm(
      buildSectionDeletePrompt(
        { name: s.name, stableKey: s.stableKey },
        {
          questionCount: list.length,
          inheritedKeys,
          freedDependentKeys,
          isUnlocked,
        },
      ),
    );
    if (!ok) return;

    // Focus policy (mirrors the per-question G10 rule): only reposition
    // focus when the currently FOCUSED question is one this cascade removes
    // — an unrelated focus elsewhere in the template must not be disturbed
    // by deleting a different section. Computed BEFORE the delete call so
    // the pre-cascade question order is intact for `computeSurvivorFocus`.
    const removedUids = list.map((qq) => qq.uid);
    const wasFocusInSection =
      focusedQuestionUid !== null && removedUidSet.has(focusedQuestionUid);
    const survivor = wasFocusInSection
      ? computeSurvivorFocus(
          questions,
          sections.map((sec) => sec.stableKey),
          removedUids[0],
          removedUids.slice(1),
        )
      : null;

    onDeleteSection(s.uid);

    if (wasFocusInSection) {
      setFocusedQuestionUid(survivor);
      if (survivor) {
        pendingFocusRef.current = { kind: "row", uid: survivor };
      } else {
        // No surviving question anywhere — try the first remaining
        // section's "+ Add question" control; if no section survives
        // either, the outline falls back to the G9 empty state and there
        // is nothing left in this component's DOM to focus.
        const nextSection = sections.find((sec) => sec.uid !== s.uid);
        pendingFocusRef.current = nextSection
          ? { kind: "add", sectionKey: nextSection.stableKey }
          : null;
      }
    }
  };

  const handleAdd = (sectionKey: string) => {
    if (isReadOnly) return;
    const newUid = onAddQuestion(sectionKey);
    // Make sure the section is open so the new row is visible.
    setSectionCollapsed(sectionKey, false);
    setFocusedQuestionUid(newUid);
    pendingFocusRef.current = { kind: "row", uid: newUid };
  };

  const handleDuplicate = (uid: string) => {
    if (isReadOnly) return;
    const newUid = onDuplicateQuestion(uid);
    setFocusedQuestionUid(newUid);
    pendingFocusRef.current = { kind: "row", uid: newUid };
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
    // Focus policy (G10): only move focus when the FOCUSED question is
    // removed. Survivor computed by the SHARED `computeSurvivorFocus` (ED5
    // Task 5) — next sibling, else previous, else nearest section, else
    // null (template empty) — BEFORE the removal so the pre-delete order is
    // intact for the computation.
    if (focusedQuestionUid === q.uid) {
      const sectionOrder = sections.map((s) => s.stableKey);
      const survivor = computeSurvivorFocus(questions, sectionOrder, q.uid);
      setFocusedQuestionUid(survivor);
      pendingFocusRef.current = survivor
        ? { kind: "row", uid: survivor }
        : { kind: "add", sectionKey: q.sectionStableKey };
    }
    onDeleteQuestion(q.uid);
  };

  // ED5 Task 11 (B-3) — the row's explicit "Move to section…" select calls
  // this with the chosen target stableKey. Inherited questions confirm via
  // the shared `buildMoveQuestionPrompt` (empty string for a new-to-draft
  // question ⇒ the `msg &&` short-circuits before `window.confirm` is even
  // called — non-inherited moves never prompt). Focus stays ON the moved
  // question (its uid never changes) — reuse the pending-focus/DOM-scroll
  // mechanism so it stays visibly focused even though it re-renders under a
  // different section in the tree.
  const handleMove = (q: QuestionDraft, targetSectionKey: string) => {
    if (isReadOnly) return;
    const targetSection = sections.find((s) => s.stableKey === targetSectionKey);
    if (!targetSection) return;
    const msg = buildMoveQuestionPrompt(q, targetSection.name);
    if (msg && !window.confirm(msg)) return;
    onMoveQuestion(q.uid, targetSectionKey);
    setFocusedQuestionUid(q.uid);
    pendingFocusRef.current = { kind: "row", uid: q.uid };
  };

  // ── G9 empty state — zero sections → link to the Sections tab. ──
  if (sections.length === 0) {
    return (
      <section
        className="wf-card space-y-3"
        style={{ padding: "1rem" }}
        data-testid="editor-outline"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="wf-card-title">Outline</h3>
          {logicMapTrigger}
        </div>
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
        {logicMapDrawer}
      </section>
    );
  }

  return (
    <section
      className="wf-card space-y-2"
      style={{ padding: "1rem" }}
      data-testid="editor-outline"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="wf-card-title">Outline</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="editor-outline-add-section"
            onClick={handleAddSection}
            disabled={isReadOnly}
            className="wf-btn wf-btn-secondary wf-btn-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Add Section
          </button>
          {logicMapTrigger}
        </div>
      </div>

      <ul className="space-y-3">
        {sections.map((s, idx) => {
          const list = questionsBySection[s.stableKey] ?? [];
          const expanded = isExpanded(s.stableKey);
          // ED5 Task 11 (B-3) — every OTHER section, for this section's rows'
          // "Move to section…" option list (excludes the row's own section).
          const otherSections = sections.filter(
            (sec) => sec.stableKey !== s.stableKey,
          );
          return (
            <li key={s.uid} data-testid={`outline-section-${s.stableKey}`}>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  data-testid={`outline-section-toggle-${s.stableKey}`}
                  aria-expanded={expanded}
                  aria-label={`${expanded ? "Collapse" : "Expand"} section ${s.stableKey}`}
                  onClick={() => toggleSection(s.stableKey)}
                  className="flex-shrink-0 flex items-center gap-1.5 px-1 py-1 rounded text-left text-sm font-semibold text-foreground hover:bg-muted"
                >
                  {expanded ? (
                    <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
                  )}
                  <span className="inline-flex items-center px-1 py-0.5 text-[0.5625rem] font-mono font-semibold uppercase tracking-wide rounded bg-muted text-muted-foreground">
                    {s.stableKey}
                  </span>
                </button>
                <input
                  type="text"
                  data-testid={`outline-section-name-${s.stableKey}`}
                  aria-label={`Section ${s.stableKey} name`}
                  value={s.name}
                  onChange={(e) => handleRenameSection(s.uid, e.target.value)}
                  disabled={isReadOnly}
                  placeholder="Section name"
                  className="flex-1 min-w-0 bg-transparent px-1 py-0.5 text-sm font-semibold text-foreground border border-transparent rounded focus:outline-none focus:border-border focus:bg-background disabled:opacity-60 disabled:cursor-not-allowed"
                />
                <span className="flex-shrink-0 text-[0.625rem] text-muted-foreground whitespace-nowrap">
                  {list.filter((lq) => lq.label.trim() !== "").length}/
                  {list.length} labeled
                </span>
                <button
                  type="button"
                  data-testid={`outline-section-move-up-${s.stableKey}`}
                  aria-label={`Move up ${s.stableKey}`}
                  title="Move up"
                  onClick={() => handleMoveSectionUp(s.uid)}
                  disabled={isReadOnly || idx === 0}
                  className="flex-shrink-0 p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  data-testid={`outline-section-move-down-${s.stableKey}`}
                  aria-label={`Move down ${s.stableKey}`}
                  title="Move down"
                  onClick={() => handleMoveSectionDown(s.uid)}
                  disabled={isReadOnly || idx === sections.length - 1}
                  className="flex-shrink-0 p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  data-testid={`outline-section-delete-${s.stableKey}`}
                  aria-label={`Delete section ${s.stableKey}`}
                  title="Delete section"
                  onClick={() => handleDeleteSection(s)}
                  disabled={isReadOnly}
                  className="flex-shrink-0 p-1 rounded text-destructive hover:bg-destructive/10 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3.5 h-3.5" />
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
                              registerFocusRef={(el) => {
                                if (el) rowFocusRefs.current.set(q.uid, el);
                                else rowFocusRefs.current.delete(q.uid);
                              }}
                              showConditionalBadge={
                                conditionalEnabled && !!q.showIf
                              }
                              gateDependentCount={
                                conditionalEnabled
                                  ? findShowIfDependents(questions, q).length
                                  : 0
                              }
                              otherSections={otherSections}
                              onMove={(targetSectionKey) =>
                                handleMove(q, targetSectionKey)
                              }
                            />
                          ))}
                        </ul>
                      </SortableContext>
                    </DndContext>
                  )}

                  <button
                    type="button"
                    ref={(el) => {
                      if (el) addButtonRefs.current.set(s.stableKey, el);
                      else addButtonRefs.current.delete(s.stableKey);
                    }}
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
      {logicMapDrawer}
    </section>
  );
}
