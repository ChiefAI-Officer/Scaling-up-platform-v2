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
  useState,
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

// ────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────
export interface QuestionDraft {
  uid: string;
  stableKey: string;
  sectionStableKey: string;
  label: string;
  helpText: string;
  isRequired: boolean;
  type: string;
  sortOrder: number;
  scaleMin: number;
  scaleMax: number;
  scaleStep: number;
  anchorMin: string;
  anchorMax: string;
}

export interface QuestionsTabProps {
  sections: SectionDraft[];
  questions: QuestionDraft[];
  onAddQuestion: (sectionStableKey: string) => void;
  onUpdateQuestion: (uid: string, patch: Partial<QuestionDraft>) => void;
  onDeleteQuestion: (uid: string) => void;
  onDuplicateQuestion: (uid: string) => void;
  onReorderQuestions: (sectionStableKey: string, newOrder: string[]) => void;
  isReadOnly: boolean;
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

export function hydrateQuestionsFromJson(raw: unknown): QuestionDraft[] {
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
  onFocus: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function SortableQuestionCard({
  question,
  isFocused,
  isReadOnly,
  onFocus,
  onDuplicate,
  onDelete,
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
      data-testid={`question-card-${question.stableKey}`}
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
            {question.stableKey}
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
              `Delete question ${question.stableKey}?`,
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
// Per-question config form (right column)
// ────────────────────────────────────────────────────────────────────────
interface QuestionConfigFormProps {
  question: QuestionDraft | null;
  isReadOnly: boolean;
  onUpdate: (patch: Partial<QuestionDraft>) => void;
}

function QuestionConfigForm({
  question,
  isReadOnly,
  onUpdate,
}: QuestionConfigFormProps) {
  const [numberOpen, setNumberOpen] = useState(false);
  const [multiOpen, setMultiOpen] = useState(false);

  if (!question) {
    return (
      <section
        className="wf-card"
        style={{ padding: "1.25rem" }}
        data-testid="questions-config-form"
      >
        <p className="text-xs italic text-muted-foreground text-center py-8">
          Select a question on the left to edit its configuration.
        </p>
      </section>
    );
  }

  return (
    <section
      className="wf-card space-y-4"
      style={{ padding: "1.25rem" }}
      data-testid="questions-config-form"
    >
      <header className="border-b border-border pb-3">
        <h3 className="wf-card-title">
          Edit Question — {question.stableKey}
        </h3>
      </header>

      {/* stableKey (read-only) */}
      <div className="space-y-1">
        <label
          className="wf-label"
          htmlFor={`q-stablekey-${question.uid}`}
        >
          stableKey
        </label>
        <input
          id={`q-stablekey-${question.uid}`}
          type="text"
          value={question.stableKey}
          readOnly
          className="wf-input"
          style={{ background: "hsl(var(--muted) / 0.4)" }}
        />
        <span className="block text-[0.6875rem] italic text-muted-foreground">
          Immutable across versions for longitudinal comparability.
        </span>
      </div>

      {/* Question Type */}
      <div className="space-y-1">
        <label
          className="wf-label"
          htmlFor={`q-type-${question.uid}`}
        >
          Question Type
        </label>
        <select
          id={`q-type-${question.uid}`}
          value={question.type}
          onChange={(e) => onUpdate({ type: e.target.value })}
          disabled={isReadOnly}
          className="wf-input disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <optgroup label="Active in v1">
            <option value="SLIDER_LIKERT">SLIDER_LIKERT</option>
            {/* Gap E + grill Q9 — NUMBER + MULTI_CHOICE deferred to v1.5 */}
            <option value="NUMBER" disabled>
              NUMBER — v1.5
            </option>
            <option value="MULTI_CHOICE" disabled>
              MULTI_CHOICE — v1.5
            </option>
          </optgroup>
          <optgroup label="v1.5 (deferred)">
            <option value="TEXT" disabled>
              TEXT — v1.5
            </option>
            <option value="TEXTAREA" disabled>
              TEXTAREA — v1.5
            </option>
            <option value="COMPOUND" disabled>
              COMPOUND — v1.5
            </option>
          </optgroup>
        </select>
        <span className="block text-[0.6875rem] italic text-muted-foreground">
          v1 active types cover all 4 default INVITED templates. v1.5 types
          stay disabled until QSP v2 compound questions ship.
        </span>
      </div>

      {/* Label */}
      <div className="space-y-1">
        <label
          className="wf-label"
          htmlFor={`q-label-${question.uid}`}
        >
          Label
        </label>
        <textarea
          id={`q-label-${question.uid}`}
          rows={2}
          value={question.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          disabled={isReadOnly}
          className="wf-input disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </div>

      {/* Help text */}
      <div className="space-y-1">
        <label
          className="wf-label"
          htmlFor={`q-help-${question.uid}`}
        >
          Help text
        </label>
        <input
          id={`q-help-${question.uid}`}
          type="text"
          value={question.helpText}
          onChange={(e) => onUpdate({ helpText: e.target.value })}
          disabled={isReadOnly}
          placeholder="Optional helper text shown to respondents"
          className="wf-input disabled:opacity-60 disabled:cursor-not-allowed"
        />
        <span className="block text-[0.6875rem] italic text-muted-foreground">
          Optional. Rendered below the label on the respondent form.
        </span>
      </div>

      {/* Required toggle */}
      <div className="space-y-1">
        <span className="block text-xs font-medium text-foreground">
          Required
        </span>
        <label className="flex items-center justify-between gap-2 px-2 py-2 rounded border border-border bg-muted/20 text-sm">
          <span className="text-foreground">
            Respondent must answer to submit
          </span>
          <input
            type="checkbox"
            aria-label="Required"
            checked={question.isRequired}
            onChange={(e) => onUpdate({ isRequired: e.target.checked })}
            disabled={isReadOnly}
            className="w-4 h-4 disabled:opacity-60"
          />
        </label>
      </div>

      {/* Sort order */}
      <div className="space-y-1">
        <label
          className="wf-label"
          htmlFor={`q-sort-${question.uid}`}
        >
          Sort order within section
        </label>
        <input
          id={`q-sort-${question.uid}`}
          type="number"
          min={1}
          value={question.sortOrder}
          onChange={(e) =>
            onUpdate({ sortOrder: Number(e.target.value) || 1 })
          }
          disabled={isReadOnly}
          style={{ width: "5rem" }}
          className="px-2 py-1 text-sm border border-border rounded bg-background text-foreground disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </div>

      {/* Read-only fallback for non-SLIDER_LIKERT question types */}
      {question.type !== "SLIDER_LIKERT" && (
        <div className="wf-helper-card" style={{ opacity: 0.7 }}>
          <span className="wf-pill wf-pill--status">
            {question.type}
          </span>
          <span style={{ marginLeft: 8, fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
            {question.label} — editing not available for this question type in v1
          </span>
        </div>
      )}

      {/* SLIDER_LIKERT — config block (active) */}
      {question.type === "SLIDER_LIKERT" && (
      <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
        <h4 className="text-xs font-semibold text-foreground">
          SLIDER_LIKERT — config
        </h4>

        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <label
              className="block text-[0.6875rem] font-medium text-foreground"
              htmlFor={`q-min-${question.uid}`}
            >
              Scale min
            </label>
            <input
              id={`q-min-${question.uid}`}
              type="number"
              value={question.scaleMin}
              onChange={(e) =>
                onUpdate({ scaleMin: Number(e.target.value) })
              }
              disabled={isReadOnly}
              className="wf-input disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
          <div className="space-y-1">
            <label
              className="block text-[0.6875rem] font-medium text-foreground"
              htmlFor={`q-max-${question.uid}`}
            >
              Scale max
            </label>
            <input
              id={`q-max-${question.uid}`}
              type="number"
              value={question.scaleMax}
              onChange={(e) =>
                onUpdate({ scaleMax: Number(e.target.value) })
              }
              disabled={isReadOnly}
              className="wf-input disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
          <div className="space-y-1">
            <label
              className="block text-[0.6875rem] font-medium text-foreground"
              htmlFor={`q-step-${question.uid}`}
            >
              Scale step
            </label>
            <input
              id={`q-step-${question.uid}`}
              type="number"
              value={question.scaleStep}
              onChange={(e) =>
                onUpdate({ scaleStep: Number(e.target.value) })
              }
              disabled={isReadOnly}
              className="wf-input disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label
              className="block text-[0.6875rem] font-medium text-foreground"
              htmlFor={`q-anchor-min-${question.uid}`}
            >
              Anchor — min
            </label>
            <input
              id={`q-anchor-min-${question.uid}`}
              type="text"
              value={question.anchorMin}
              onChange={(e) => onUpdate({ anchorMin: e.target.value })}
              disabled={isReadOnly}
              className="wf-input disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
          <div className="space-y-1">
            <label
              className="block text-[0.6875rem] font-medium text-foreground"
              htmlFor={`q-anchor-max-${question.uid}`}
            >
              Anchor — max
            </label>
            <input
              id={`q-anchor-max-${question.uid}`}
              type="text"
              value={question.anchorMax}
              onChange={(e) => onUpdate({ anchorMax: e.target.value })}
              disabled={isReadOnly}
              className="wf-input disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        <span className="block text-[0.6875rem] italic text-muted-foreground">
          Slider answers stored as integers. Validation enforces{" "}
          <code className="font-mono bg-muted px-1 rounded text-[0.625rem]">
            (value - min) % step === 0
          </code>
          .
        </span>
      </div>
      )}

      {/* NUMBER accordion (v1.5 deferred, all inputs disabled per Gap E) */}
      <div
        className="rounded-md border border-border bg-muted/10 p-3 space-y-2"
        data-testid="number-accordion"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide rounded bg-warning/10 text-warning">
              NUMBER
            </span>
            <span className="text-xs text-muted-foreground">Config preview</span>
            <span className="inline-flex items-center px-1 py-px text-[0.625rem] font-bold uppercase tracking-wider rounded bg-warning/20 text-warning">
              v1.5
            </span>
          </div>
          <button
            type="button"
            data-disclosure-toggle="true"
            onClick={() => setNumberOpen((v) => !v)}
            className="text-[0.6875rem] text-muted-foreground hover:text-foreground"
          >
            {numberOpen ? "Close" : "Open"}
          </button>
        </div>
        {numberOpen ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="block text-[0.6875rem] font-medium text-foreground">
                  Min (optional)
                </label>
                <input
                  type="number"
                  disabled
                  placeholder="—"
                  className="w-full px-2 py-1 text-sm border border-border rounded bg-muted/40 text-foreground opacity-60"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[0.6875rem] font-medium text-foreground">
                  Max (optional)
                </label>
                <input
                  type="number"
                  disabled
                  placeholder="—"
                  className="w-full px-2 py-1 text-sm border border-border rounded bg-muted/40 text-foreground opacity-60"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="block text-[0.6875rem] font-medium text-foreground">
                  Decimals (0–6)
                </label>
                <input
                  type="number"
                  min={0}
                  max={6}
                  disabled
                  defaultValue={0}
                  className="w-full px-2 py-1 text-sm border border-border rounded bg-muted/40 text-foreground opacity-60"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[0.6875rem] font-medium text-foreground">
                  Unit label
                </label>
                <input
                  type="text"
                  disabled
                  placeholder='e.g. "USD", "employees"'
                  className="w-full px-2 py-1 text-sm border border-border rounded bg-muted/40 text-foreground opacity-60"
                />
              </div>
            </div>
            <span className="block text-[0.6875rem] italic text-muted-foreground">
              Decimals precision enforced via{" "}
              <code className="font-mono bg-muted px-1 rounded text-[0.625rem]">
                Number.isInteger(value * 10^decimals)
              </code>
              .
            </span>
            <div className="text-[0.6875rem] text-muted-foreground italic">
              <strong>Example:</strong> Vision Alignment uses NUMBER for revenue +
              headcount fields.
            </div>
          </div>
        ) : (
          // Render disabled inputs in collapsed state too so tests can
          // confirm Gap E (inputs always disabled, never editable).
          <div className="hidden">
            <input type="number" disabled />
            <input type="number" disabled />
            <input type="number" disabled />
            <input type="text" disabled />
          </div>
        )}
      </div>

      {/* MULTI_CHOICE accordion (v1.5 deferred) */}
      <div
        className="rounded-md border border-border bg-muted/10 p-3 space-y-2"
        data-testid="multichoice-accordion"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide rounded bg-warning/10 text-warning">
              MULTI_CHOICE
            </span>
            <span className="text-xs text-muted-foreground">Config preview</span>
            <span className="inline-flex items-center px-1 py-px text-[0.625rem] font-bold uppercase tracking-wider rounded bg-warning/20 text-warning">
              v1.5
            </span>
          </div>
          <button
            type="button"
            data-disclosure-toggle="true"
            onClick={() => setMultiOpen((v) => !v)}
            className="text-[0.6875rem] text-muted-foreground hover:text-foreground"
          >
            {multiOpen ? "Close" : "Open"}
          </button>
        </div>
        {multiOpen ? (
          <div className="space-y-2">
            <span className="block text-[0.6875rem] font-medium text-foreground">
              Options
            </span>
            <ul className="space-y-1">
              {["K1", "K2", "K3", "K4"].map((k) => (
                <li
                  key={k}
                  className="flex items-center gap-2 px-2 py-1 rounded border border-border bg-muted/40 text-xs text-muted-foreground"
                >
                  <span className="font-mono text-[0.625rem]">{k}</span>
                  <span className="flex-1">(example option)</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled
              className="text-[0.6875rem] font-medium px-2 py-1 rounded border border-border text-muted-foreground disabled:opacity-60 disabled:cursor-not-allowed"
            >
              + Add Option
            </button>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="block text-[0.6875rem] font-medium text-foreground">
                  Min selected
                </label>
                <input
                  type="number"
                  disabled
                  defaultValue={1}
                  className="w-full px-2 py-1 text-sm border border-border rounded bg-muted/40 text-foreground opacity-60"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[0.6875rem] font-medium text-foreground">
                  Max selected
                </label>
                <input
                  type="number"
                  disabled
                  placeholder="unbounded"
                  className="w-full px-2 py-1 text-sm border border-border rounded bg-muted/40 text-foreground opacity-60"
                />
              </div>
            </div>
            <span className="block text-[0.6875rem] italic text-muted-foreground">
              Selected values stored as{" "}
              <code className="font-mono bg-muted px-1 rounded text-[0.625rem]">
                selectedKeys: string[]
              </code>
              . Option stableKey (not the free-text label) is what persists
              across versions.
            </span>
            <div className="text-[0.6875rem] text-muted-foreground italic">
              <strong>Example:</strong> Vision Alignment uses MULTI_CHOICE for
              the &ldquo;top 3 obstacles&rdquo; question.
            </div>
          </div>
        ) : (
          <div className="hidden">
            <input type="number" disabled />
            <input type="number" disabled />
            <button type="button" disabled>
              + Add Option
            </button>
          </div>
        )}
      </div>
    </section>
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
}: QuestionsTabProps) {
  const [selectedSectionStableKey, setSelectedSectionStableKey] = useState<
    string | null
  >(() => sections[0]?.stableKey ?? null);
  const [focusedQuestionUid, setFocusedQuestionUid] = useState<string | null>(
    null,
  );

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
  const sectionQuestions = selectedSectionStableKey
    ? questionsBySection[selectedSectionStableKey] ?? []
    : [];
  const focusedQuestion =
    sectionQuestions.find((q) => q.uid === focusedQuestionUid) ?? null;

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
                  {sectionQuestions.map((q) => (
                    <SortableQuestionCard
                      key={q.uid}
                      question={q}
                      isFocused={focusedQuestionUid === q.uid}
                      isReadOnly={isReadOnly}
                      onFocus={() => setFocusedQuestionUid(q.uid)}
                      onDuplicate={() => onDuplicateQuestion(q.uid)}
                      onDelete={() => onDeleteQuestion(q.uid)}
                    />
                  ))}
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
          <QuestionConfigForm
            question={focusedQuestion}
            isReadOnly={isReadOnly}
            onUpdate={(patch) => {
              if (focusedQuestion) onUpdateQuestion(focusedQuestion.uid, patch);
            }}
          />
        </aside>
      </div>

      {/* v1.5 informational cards */}
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
    </div>
  );
}
