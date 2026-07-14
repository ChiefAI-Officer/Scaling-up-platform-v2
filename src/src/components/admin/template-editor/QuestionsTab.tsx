"use client";

/**
 * QuestionsTab — F3 (Checkpoint 2).
 *
 * Wireframe spec: src/public/wireframes-phase2/admin/17-admin-template-editor-questions.html
 *
 * 3-column layout:
 *   LEFT (20%, sticky lg+): Section navigator card. Click a section to
 *     switch the middle column's question list + reset the right column
 *     focus to the section's first question.
 *   MIDDLE (50%): Question list for the selected section. Drag-sortable
 *     (via @dnd-kit). Each row has stableKey badge, SLIDER_LIKERT type
 *     pill, label, and Edit/Duplicate/Delete actions.
 *   RIGHT (30%, sticky lg+): Per-question config form for the focused
 *     question. SLIDER_LIKERT fields are fully editable; NUMBER and
 *     MULTI_CHOICE accordions are shown as v1.5-disabled previews
 *     (Gap E + grill Q9 — the only v1 active type is SLIDER_LIKERT).
 *
 * Below the grid: v1.5 informational cards (TEXT / TEXTAREA / COMPOUND),
 * read-only descriptions only.
 *
 * Plan: ~/.claude/plans/yes-we-were-in-cosmic-jellyfish.md (F3).
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
} from "react";
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
import { GripVertical } from "lucide-react";

import type { SectionDraft } from "./SectionsCard";
import type { QuestionDraftRow, FindingBandDraft } from "./question-serialization";
import { canonicalQuestionOrderIndex } from "@/lib/assessments/section-pages";
// ED3 Task 7 — the per-question inspector column lives in its own file now
// (QuestionInspector, formerly the internal QuestionConfigForm). ShowIfGateOption
// moved with it and is re-exported here to preserve this module's public surface.
import { QuestionInspector, type ShowIfGateOption } from "./QuestionInspector";
// ED4 (spec 19af §3.4) — the delete-confirm/warn text + show-if dependent
// discovery are now SHARED with the model's question commands so the future
// three-pane outline prompts + cleans up identically (co-validate C2).
import {
  buildDeleteConfirmText,
  buildShowIfDependentsWarning,
  findShowIfDependents,
} from "./question-commands";

export type { ShowIfGateOption };

// ────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────
/**
 * Wave T — the editor draft row is now structurally identical to the pure
 * serializer's QuestionDraftRow (question-serialization.ts): the F3 fields
 * plus `options` / `maxChoices` / `isInherited` / `isNewToDraft`. Re-exported
 * under the original name so existing imports keep working.
 */
export type QuestionDraft = QuestionDraftRow;

export interface QuestionsTabProps {
  sections: SectionDraft[];
  questions: QuestionDraft[];
  onAddQuestion: (sectionStableKey: string) => void;
  onUpdateQuestion: (uid: string, patch: Partial<QuestionDraft>) => void;
  onDeleteQuestion: (uid: string) => void;
  onDuplicateQuestion: (uid: string) => void;
  onReorderQuestions: (sectionStableKey: string, newOrder: string[]) => void;
  isReadOnly: boolean;
  /**
   * Wave T (spec 19t D2) — the question-editor type unlock. False ⇒ the
   * legacy slider-only editor renders byte-identically (v1.5 placeholders
   * included); true ⇒ TEXT/NUMBER/MULTI_CHOICE editing is enabled.
   */
  isUnlocked: boolean;
  /**
   * Wave T (spec 19t §T-4) — union of option keys per published question
   * stableKey. Drives the D9 inherited-option remove warning.
   */
  publishedOptionKeys: Record<string, readonly string[]>;
  /**
   * Wave U (spec 19u U-4) — findings-logic authoring. False ⇒ the Findings
   * panel does not exist and this tab renders byte-identically to
   * pre-Wave-U; true ⇒ each SLIDER/NUMBER/MULTI_CHOICE question card gains
   * a collapsible Findings panel (editable on inherited questions — D9
   * reword-class). Optional (default false) so pre-Wave-U call sites render
   * unchanged.
   */
  findingsEnabled?: boolean;
  /**
   * Wave W (spec 19w §2.6) — conditional (show-if) authoring. False ⇒ no
   * showIf DOM exists and this tab renders byte-identically to pre-Wave-W;
   * true ⇒ every question card gains a collapsible "Show only when…"
   * panel + the Required interlock + dependent confirm-drop hygiene.
   * Optional (default false) so pre-Wave-W call sites render unchanged.
   */
  conditionalEnabled?: boolean;
  /**
   * ED3 (spec 19ae, Task 3) — question-selection state, LIFTED out of this
   * component into `useEditorSelection` (owned by TemplateEditorController)
   * so the future three-pane can share it. Behavior-neutral: `resetSelection`
   * reproduces the pre-ED3 remount reset (see the mount effect below).
   */
  selectedSectionStableKey: string | null;
  setSelectedSectionStableKey: (key: string | null) => void;
  focusedQuestionUid: string | null;
  setFocusedQuestionUid: (uid: string | null) => void;
  resetSelection: (
    selectedSectionStableKey: string | null,
    focusedQuestionUid: string | null,
  ) => void;
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────
function genUid(): string {
  return `u${Math.random().toString(36).slice(2, 10)}`;
}

export function genNewQuestionStableKey(): string {
  return `Q_NEW_${genUid()}`;
}

const EMPTY_PUBLISHED_KEYS: ReadonlySet<string> = new Set();

export function hydrateQuestionsFromJson(
  raw: unknown,
  publishedKeys: ReadonlySet<string> = EMPTY_PUBLISHED_KEYS,
): QuestionDraft[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((q, idx) => {
    const r = q as {
      stableKey?: unknown;
      sectionStableKey?: unknown;
      label?: unknown;
      helpText?: unknown;
      type?: unknown;
      isRequired?: unknown;
      sortOrder?: unknown;
      scale?: unknown;
      options?: unknown;
      maxChoices?: unknown;
      recommendations?: unknown;
      showIf?: unknown;
    };
    const scale = (r.scale && typeof r.scale === "object"
      ? r.scale
      : {}) as {
      min?: unknown;
      max?: unknown;
      step?: unknown;
      anchorMin?: unknown;
      anchorMax?: unknown;
    };
    const sectionStableKey =
      typeof r.sectionStableKey === "string" ? r.sectionStableKey : "";
    const stableKey =
      typeof r.stableKey === "string" && r.stableKey.length > 0
        ? r.stableKey
        : `${sectionStableKey || "S?"}_Q${idx + 1}`;
    // Wave T — persisted MULTI_CHOICE options hydrate as isNew:false
    // (their keys are locked by the serializer's inherited re-check).
    const options: Array<{ key: string; label: string; isNew: boolean }> = [];
    if (Array.isArray(r.options)) {
      for (const o of r.options) {
        if (o && typeof o === "object") {
          const opt = o as { key?: unknown; label?: unknown };
          options.push({
            key: typeof opt.key === "string" ? opt.key : "",
            label: typeof opt.label === "string" ? opt.label : "",
            isNew: false,
          });
        }
      }
    }
    const isInherited = publishedKeys.has(stableKey);

    // Wave U (spec 19u U-4) — hydrate persisted findings rules per type.
    const qType = typeof r.type === "string" ? r.type : "SLIDER_LIKERT";
    const findingBands: FindingBandDraft[] = [];
    const findingOptionTexts: Record<string, string> = {};
    if (Array.isArray(r.recommendations)) {
      for (const rec of r.recommendations) {
        if (!rec || typeof rec !== "object") continue;
        const rr = rec as {
          minScore?: unknown;
          maxScore?: unknown;
          optionKey?: unknown;
          text?: unknown;
        };
        if (
          (qType === "SLIDER_LIKERT" || qType === "NUMBER") &&
          typeof rr.minScore === "number" &&
          typeof rr.maxScore === "number" &&
          typeof rr.text === "string"
        ) {
          findingBands.push({
            minScore: rr.minScore,
            maxScore: rr.maxScore,
            text: rr.text,
          });
        } else if (
          qType === "MULTI_CHOICE" &&
          typeof rr.optionKey === "string" &&
          typeof rr.text === "string"
        ) {
          findingOptionTexts[rr.optionKey] = rr.text;
        }
      }
    }

    return {
      uid: genUid(),
      stableKey,
      sectionStableKey,
      label: typeof r.label === "string" ? r.label : "",
      helpText: typeof r.helpText === "string" ? r.helpText : "",
      isRequired: typeof r.isRequired === "boolean" ? r.isRequired : true,
      type: typeof r.type === "string" ? r.type : "SLIDER_LIKERT",
      sortOrder:
        typeof r.sortOrder === "number" && Number.isFinite(r.sortOrder)
          ? r.sortOrder
          : idx + 1,
      scaleMin: typeof scale.min === "number" ? scale.min : 0,
      scaleMax: typeof scale.max === "number" ? scale.max : 3,
      scaleStep: typeof scale.step === "number" ? scale.step : 1,
      anchorMin:
        typeof scale.anchorMin === "string" ? scale.anchorMin : "Not true",
      anchorMax:
        typeof scale.anchorMax === "string"
          ? scale.anchorMax
          : "Completely true",
      options,
      maxChoices:
        typeof r.maxChoices === "number" && Number.isFinite(r.maxChoices)
          ? r.maxChoices
          : null,
      isInherited,
      isNewToDraft: !isInherited,
      findingBands,
      findingOptionTexts,
      // Wave W — tolerant hydration: only a well-shaped {questionKey,
      // optionKey} (both non-empty strings) becomes a draft rule; anything
      // else hydrates to null (unconditional).
      showIf: (() => {
        const s = r.showIf as
          | { questionKey?: unknown; optionKey?: unknown }
          | null
          | undefined;
        return s &&
          typeof s === "object" &&
          typeof s.questionKey === "string" &&
          s.questionKey !== "" &&
          typeof s.optionKey === "string" &&
          s.optionKey !== ""
          ? { questionKey: s.questionKey, optionKey: s.optionKey }
          : null;
      })(),
    };
  });
}

// ────────────────────────────────────────────────────────────────────────
// Sortable question card
// ────────────────────────────────────────────────────────────────────────
interface SortableQuestionCardProps {
  question: QuestionDraft;
  isFocused: boolean;
  isReadOnly: boolean;
  isUnlocked: boolean;
  onFocus: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /**
   * Wave W — stableKeys of questions whose showIf references THIS question.
   * Deleting the gate makes them unconditional; the confirm names them and
   * the parent clears their rules after the delete.
   */
  showIfDependentKeys?: readonly string[];
}

// ED4 (spec 19af §3.4) — `buildDeleteConfirmText` (Wave T D4) and
// `buildShowIfDependentsWarning` (Wave W) moved VERBATIM into the shared
// `question-commands` module (imported above) so the model's question
// commands and both editor views prompt identically.

function SortableQuestionCard({
  question,
  isFocused,
  isReadOnly,
  isUnlocked,
  onFocus,
  onDuplicate,
  onDelete,
  showIfDependentKeys = [],
}: SortableQuestionCardProps) {
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

  const focusedClass = isFocused
    ? "ring-2 ring-primary border-primary"
    : "border-border hover:bg-muted/30";

  return (
    <li
      ref={setNodeRef}
      style={style}
      data-testid={`question-card-${question.stableKey || question.uid}`}
      aria-current={isFocused ? "true" : undefined}
      className={`flex items-start gap-2 px-3 py-3 rounded-md border bg-card ${focusedClass}`}
    >
      <button
        type="button"
        aria-label={`Drag to reorder ${question.stableKey}`}
        data-testid={`drag-handle-${question.stableKey}`}
        disabled={isReadOnly}
        className="mt-1 cursor-grab disabled:cursor-not-allowed text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="inline-flex items-center px-1.5 py-0.5 text-[0.625rem] font-mono font-semibold uppercase tracking-wide rounded bg-muted text-muted-foreground"
            aria-label={`Question stable key ${question.stableKey}`}
          >
            {question.stableKey || (
              <span className="italic normal-case">(assigned on save)</span>
            )}
          </span>
          <span className="inline-flex items-center px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide rounded bg-success/10 text-success">
            {question.type}
          </span>
        </div>
        <div className="text-sm text-foreground">
          {question.label || (
            <span className="italic text-muted-foreground">(no label yet)</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          type="button"
          onClick={onFocus}
          disabled={isReadOnly}
          aria-pressed={isFocused}
          className={`text-xs font-medium px-2 py-1 rounded ${
            isFocused
              ? "text-primary font-semibold"
              : "text-foreground hover:bg-muted"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          disabled={isReadOnly}
          className="text-xs font-medium px-2 py-1 rounded text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Duplicate
        </button>
        <button
          type="button"
          onClick={() => {
            if (isReadOnly) return;
            const ok = window.confirm(
              (isUnlocked && question.isInherited
                ? buildDeleteConfirmText(question)
                : `Delete question ${question.stableKey}?`) +
                buildShowIfDependentsWarning(showIfDependentKeys),
            );
            if (ok) onDelete();
          }}
          disabled={isReadOnly}
          className="text-xs font-medium px-2 py-1 rounded text-destructive hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Delete
        </button>
      </div>
    </li>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Main QuestionsTab component
// ────────────────────────────────────────────────────────────────────────
export function QuestionsTab({
  sections,
  questions,
  onAddQuestion,
  onUpdateQuestion,
  onDeleteQuestion,
  onDuplicateQuestion,
  onReorderQuestions,
  isReadOnly,
  isUnlocked,
  publishedOptionKeys,
  findingsEnabled = false,
  conditionalEnabled = false,
  selectedSectionStableKey,
  setSelectedSectionStableKey,
  focusedQuestionUid,
  setFocusedQuestionUid,
  resetSelection,
}: QuestionsTabProps) {
  // Group questions by section.
  const questionsBySection = useMemo(() => {
    const out: Record<string, QuestionDraft[]> = {};
    for (const s of sections) {
      out[s.stableKey] = [];
    }
    for (const q of questions) {
      if (!out[q.sectionStableKey]) out[q.sectionStableKey] = [];
      out[q.sectionStableKey].push(q);
    }
    // Sort within section by sortOrder for display.
    for (const k of Object.keys(out)) {
      out[k] = [...out[k]].sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return out;
  }, [questions, sections]);

  // ── ED3 — selection now lives in `useEditorSelection` (owned by the
  // controller) and PERSISTS across this tab's Radix unmount/remount, so it
  // no longer re-initializes on its own. Reproduce the pre-ED3 remount reset:
  // on each mount, select the first section + focus that section's first
  // question — resolved against the LIVE sections/questions at entry time,
  // exactly what the old local `useState(() => sections[0])` initializer plus
  // the section-change effect below produced on every remount. Mount-only by
  // design; the section-change effect below handles subsequent USER section
  // switches. Setting the focus DIRECTLY (not null) is deliberate: when the
  // persisted section equals the reset section, the section-change effect
  // would not re-run to derive it.
  useEffect(() => {
    const firstSection = sections[0]?.stableKey ?? null;
    const firstQuestionUid = firstSection
      ? (questionsBySection[firstSection] ?? [])[0]?.uid ?? null
      : null;
    resetSelection(firstSection, firstQuestionUid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Default focused question when the section changes.
  useEffect(() => {
    if (!selectedSectionStableKey) {
      setFocusedQuestionUid(null);
      return;
    }
    const list = questionsBySection[selectedSectionStableKey] ?? [];
    // If currently focused question is still in this section, keep it.
    if (focusedQuestionUid && list.some((q) => q.uid === focusedQuestionUid)) {
      return;
    }
    setFocusedQuestionUid(list[0]?.uid ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSectionStableKey]);

  const selectedSection =
    sections.find((s) => s.stableKey === selectedSectionStableKey) ?? null;
  const sectionQuestions = useMemo(
    () =>
      selectedSectionStableKey
        ? questionsBySection[selectedSectionStableKey] ?? []
        : [],
    [questionsBySection, selectedSectionStableKey],
  );
  const focusedQuestion =
    sectionQuestions.find((q) => q.uid === focusedQuestionUid) ?? null;

  // ── Wave W — canonical order + gate/dependent maps (C1) ──
  // Order comes from THE shared helper (buildSectionPages' order: sections
  // by editor array position, questions by sortOrder within) keyed by uid so
  // unsaved rows (blank stableKey) can't collide.
  const showIfOrderByUid = useMemo(() => {
    if (!conditionalEnabled) return new Map<string, number>();
    return canonicalQuestionOrderIndex(
      sections.map((s, i) => ({ stableKey: s.stableKey, sortOrder: i })),
      questions.map((q) => ({
        stableKey: q.uid,
        sortOrder: q.sortOrder,
        sectionStableKey: q.sectionStableKey,
      })),
    );
  }, [conditionalEnabled, sections, questions]);

  // Eligible gates for the FOCUSED question: strictly-earlier MULTI_CHOICE
  // with a persisted stableKey (unsaved rows can't be referenced yet) and no
  // showIf of their own (chains are publish-rejected — don't author them).
  const focusedShowIfGates = useMemo<ShowIfGateOption[]>(() => {
    if (!conditionalEnabled || !focusedQuestion) return [];
    const ownOrder = showIfOrderByUid.get(focusedQuestion.uid);
    if (ownOrder === undefined) return [];
    return questions
      .filter(
        (q) =>
          q.type === "MULTI_CHOICE" &&
          q.stableKey !== "" &&
          q.uid !== focusedQuestion.uid &&
          q.showIf === null &&
          (showIfOrderByUid.get(q.uid) ?? Infinity) < ownOrder,
      )
      .sort(
        (a, b) =>
          (showIfOrderByUid.get(a.uid) ?? 0) - (showIfOrderByUid.get(b.uid) ?? 0),
      )
      .map((q) => ({
        stableKey: q.stableKey,
        label: q.label,
        options: q.options.map((o) => ({ key: o.key, label: o.label })),
      }));
  }, [conditionalEnabled, focusedQuestion, questions, showIfOrderByUid]);

  // Questions whose showIf references a given question's stableKey. ED4 —
  // the predicate is the SHARED `findShowIfDependents` (also used by the
  // model's `deleteQuestion` command); the flag gate stays presentation-side.
  const showIfDependentsOf = useCallback(
    (gate: QuestionDraft): QuestionDraft[] => {
      if (!conditionalEnabled) return [];
      return findShowIfDependents(questions, gate);
    },
    [conditionalEnabled, questions],
  );

  const clearShowIfFor = useCallback(
    (uids: string[]) => {
      for (const uid of uids) onUpdateQuestion(uid, { showIf: null });
    },
    [onUpdateQuestion],
  );

  // ─── Drag-and-drop sensors ──────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      if (!selectedSectionStableKey) return;
      const list = sectionQuestions;
      const oldIndex = list.findIndex((q) => q.uid === String(active.id));
      const newIndex = list.findIndex((q) => q.uid === String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      const newOrderUids = arrayMove(list, oldIndex, newIndex).map(
        (q) => q.uid,
      );
      onReorderQuestions(selectedSectionStableKey, newOrderUids);
    },
    [sectionQuestions, selectedSectionStableKey, onReorderQuestions],
  );

  // Completion counts for the section navigator.
  const countByStableKey = useMemo(() => {
    const out: Record<string, { answered: number; total: number }> = {};
    for (const s of sections) {
      const list = questionsBySection[s.stableKey] ?? [];
      const total = list.length;
      const answered = list.filter((q) => q.label.trim().length > 0).length;
      out[s.stableKey] = { answered, total };
    }
    return out;
  }, [questionsBySection, sections]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[20%_50%_30%] gap-4">
        {/* LEFT — Section navigator */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <section
            className="wf-card space-y-2"
            style={{ padding: "1rem" }}
            data-testid="questions-section-nav"
          >
            <h3 className="wf-card-title">
              Sections
            </h3>
            <ul className="space-y-1">
              {sections.length === 0 ? (
                <li className="text-xs italic text-muted-foreground py-2">
                  No sections yet. Add sections on the Sections tab first.
                </li>
              ) : null}
              {sections.map((s) => {
                const isSel = selectedSectionStableKey === s.stableKey;
                const c = countByStableKey[s.stableKey] ?? {
                  answered: 0,
                  total: 0,
                };
                return (
                  <li key={s.uid}>
                    <button
                      type="button"
                      data-testid={`section-nav-item-${s.stableKey}`}
                      aria-current={isSel ? "true" : undefined}
                      onClick={() => setSelectedSectionStableKey(s.stableKey)}
                      className={`w-full flex items-center gap-2 px-2 py-2 rounded text-left text-sm ${
                        isSel
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-foreground hover:bg-muted"
                      }`}
                    >
                      <span className="inline-flex items-center px-1.5 py-0.5 text-[0.625rem] font-mono font-semibold uppercase tracking-wide rounded bg-muted text-muted-foreground">
                        {s.stableKey}
                      </span>
                      <span className="flex-1 min-w-0 truncate">
                        {s.name || (
                          <span className="italic text-muted-foreground">
                            (no name)
                          </span>
                        )}
                      </span>
                      <span
                        data-testid={`section-nav-count-${s.stableKey}`}
                        className="text-[0.6875rem] text-muted-foreground whitespace-nowrap"
                      >
                        {c.answered}/{c.total}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>

        {/* MIDDLE — Question list for selected section */}
        <section
          className="wf-card space-y-3"
          style={{ padding: "1rem" }}
          data-testid="questions-question-list"
        >
          <header className="flex items-center justify-between gap-2">
            <h3 className="wf-card-title">
              {selectedSection
                ? `${selectedSection.stableKey} — ${
                    selectedSection.name || "(no name)"
                  }`
                : "Select a section"}
            </h3>
            <button
              type="button"
              onClick={() => {
                if (!selectedSectionStableKey) return;
                onAddQuestion(selectedSectionStableKey);
              }}
              disabled={isReadOnly || !selectedSectionStableKey}
              className="wf-btn wf-btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              + Add Question
            </button>
          </header>

          {sectionQuestions.length === 0 ? (
            <p className="text-xs italic text-muted-foreground text-center py-6">
              No questions in this section.{" "}
              {!isReadOnly && selectedSectionStableKey ? (
                <>Click <strong>+ Add Question</strong> to start.</>
              ) : null}
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={sectionQuestions.map((q) => q.uid)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="space-y-2">
                  {sectionQuestions.map((q) => {
                    const deps = showIfDependentsOf(q);
                    return (
                      <SortableQuestionCard
                        key={q.uid}
                        question={q}
                        isFocused={focusedQuestionUid === q.uid}
                        isReadOnly={isReadOnly}
                        isUnlocked={isUnlocked}
                        onFocus={() => setFocusedQuestionUid(q.uid)}
                        onDuplicate={() => onDuplicateQuestion(q.uid)}
                        onDelete={() => {
                          onDeleteQuestion(q.uid);
                          // Wave W — the deleted gate's dependents become
                          // unconditional (named in the confirm above).
                          if (deps.length > 0) {
                            clearShowIfFor(deps.map((d) => d.uid));
                          }
                        }}
                        showIfDependentKeys={deps.map((d) => d.stableKey)}
                      />
                    );
                  })}
                </ul>
              </SortableContext>
            </DndContext>
          )}

          <p className="text-[0.6875rem] italic text-muted-foreground">
            Drag rows to reorder.{" "}
            <code className="font-mono bg-muted px-1 rounded text-[0.625rem]">
              sortOrder
            </code>{" "}
            persists per-question.{" "}
            <code className="font-mono bg-muted px-1 rounded text-[0.625rem]">
              stableKey
            </code>{" "}
            is immutable.
          </p>
        </section>

        {/* RIGHT — Per-question config form */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <QuestionInspector
            question={focusedQuestion}
            isReadOnly={isReadOnly}
            isUnlocked={isUnlocked}
            findingsEnabled={findingsEnabled}
            conditionalEnabled={conditionalEnabled}
            showIfGates={focusedShowIfGates}
            showIfDependents={
              focusedQuestion ? showIfDependentsOf(focusedQuestion) : []
            }
            onClearDependents={clearShowIfFor}
            publishedOptionKeys={publishedOptionKeys}
            onUpdate={(patch) => {
              if (focusedQuestion) onUpdateQuestion(focusedQuestion.uid, patch);
            }}
          />
        </aside>
      </div>

      {/* v1.5 informational cards (legacy, flag OFF only — Wave T ships
          TEXT for real and TEXTAREA/COMPOUND were never engine types) */}
      {!isUnlocked && (
      <section
        className="wf-card space-y-3"
        style={{ padding: "1.25rem", background: "hsl(var(--muted) / 0.1)" }}
        data-testid="v15-deferred-panel"
        aria-label="v1.5 question types"
      >
        <div className="text-xs italic text-muted-foreground">
          These types ship in <strong>v1.5</strong>. v1 active types
          (SLIDER_LIKERT + NUMBER + MULTI_CHOICE) cover all 4 default INVITED
          templates. TEXT/TEXTAREA/COMPOUND join when QSP v2&rsquo;s compound
          questions need them in production.
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-md border border-border bg-card p-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide rounded bg-muted text-muted-foreground">
                TEXT
              </span>
              <span className="inline-flex items-center px-1 py-px text-[0.625rem] font-bold uppercase tracking-wider rounded bg-warning/20 text-warning">
                v1.5
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              <strong>Single-line free text.</strong> Validation: maxLength,
              optional placeholder. Stored as{" "}
              <code className="font-mono">{`{ textValue: string }`}</code>.
            </p>
          </div>
          <div className="rounded-md border border-border bg-card p-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide rounded bg-muted text-muted-foreground">
                TEXTAREA
              </span>
              <span className="inline-flex items-center px-1 py-px text-[0.625rem] font-bold uppercase tracking-wider rounded bg-warning/20 text-warning">
                v1.5
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              <strong>Multi-line free text.</strong> Validation: maxLength,
              optional placeholder, rows. Stored as{" "}
              <code className="font-mono">{`{ textValue: string }`}</code>.
            </p>
          </div>
          <div className="rounded-md border border-border bg-card p-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide rounded bg-muted text-muted-foreground">
                COMPOUND
              </span>
              <span className="inline-flex items-center px-1 py-px text-[0.625rem] font-bold uppercase tracking-wider rounded bg-warning/20 text-warning">
                v1.5
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              <strong>Numeric + text combined.</strong> Stored as{" "}
              <code className="font-mono">{`{ numericValue, textValue }`}</code>
              . Used by QSP v2 &mdash; &ldquo;rate + explain&rdquo; pattern.
              Validation: both required when isRequired true.
            </p>
          </div>
        </div>
      </section>
      )}
    </div>
  );
}
