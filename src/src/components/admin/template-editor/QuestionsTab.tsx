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
  useRef,
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
import type { QuestionDraftRow, FindingBandDraft } from "./question-serialization";
import {
  sliderBandCoverage,
  buildFindingRecommendations,
} from "./question-serialization";
import { canonicalQuestionOrderIndex } from "@/lib/assessments/section-pages";
import { resolveFindings } from "@/lib/assessments/findings";
import {
  QuestionInput,
  type QuestionForInput,
} from "@/components/assessments/question-input";

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

/**
 * Wave T D4 — deleting an INHERITED question (its stableKey exists in a
 * published version) is a history-affecting act; the confirm names the key
 * and the three consequence classes. New-to-draft rows keep the legacy
 * simple confirm.
 */
function buildDeleteConfirmText(question: QuestionDraft): string {
  return [
    `Delete inherited question ${question.stableKey}?`,
    "",
    "This question exists in a published version of this template. Deleting it means:",
    `• cross-version trend history for ${question.stableKey} ends with the last published version;`,
    "• a locked Esperto import crosswalk that maps this key will refuse imports against the next published version;",
    "• any peer benchmark set on this question will be pruned.",
    "",
    "Continue?",
  ].join("\n");
}

/**
 * Wave W — appended to the delete confirm when other questions are shown
 * conditionally on the one being deleted.
 */
function buildShowIfDependentsWarning(keys: readonly string[]): string {
  if (keys.length === 0) return "";
  return [
    "",
    `${keys.length} question${keys.length === 1 ? "" : "s"} shown conditionally on this one will become always-visible: ${keys.join(", ")}.`,
  ].join("\n");
}

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
// Per-question config form (right column)
// ────────────────────────────────────────────────────────────────────────
/** Wave W — a gate the focused question may condition on (preceding MULTI_CHOICE). */
export interface ShowIfGateOption {
  stableKey: string;
  label: string;
  options: ReadonlyArray<{ key: string; label: string }>;
}

interface QuestionConfigFormProps {
  question: QuestionDraft | null;
  isReadOnly: boolean;
  isUnlocked: boolean;
  findingsEnabled: boolean;
  /** Wave W — whether the "Show only when…" panel renders (flag-gated). */
  conditionalEnabled: boolean;
  /** Wave W — eligible gates for the FOCUSED question (canonical order). */
  showIfGates: ReadonlyArray<ShowIfGateOption>;
  /** Wave W — questions whose showIf references the FOCUSED question. */
  showIfDependents: ReadonlyArray<QuestionDraft>;
  /** Wave W — clear the showIf of the given question uids (dependent hygiene). */
  onClearDependents: (uids: string[]) => void;
  publishedOptionKeys: Record<string, readonly string[]>;
  onUpdate: (patch: Partial<QuestionDraft>) => void;
}

/** Wave U — how many findings rules a draft question currently carries. */
function countFindingRules(q: QuestionDraft): number {
  if (q.type === "SLIDER_LIKERT" || q.type === "NUMBER") {
    return q.findingBands.filter((b) => b.text.trim() !== "").length;
  }
  if (q.type === "MULTI_CHOICE") {
    return Object.values(q.findingOptionTexts).filter((t) => t.trim() !== "")
      .length;
  }
  return 0;
}

/**
 * Wave U D21 — ANY retype drops that question's findings rules (even the
 * band-compatible SLIDER→NUMBER — re-author deliberately).
 */
function buildTypeChangeFindingsConfirmText(
  ruleCount: number,
  fromType: string,
  toType: string,
): string {
  return [
    `Change this question's type from ${fromType} to ${toType}?`,
    "",
    `It carries ${ruleCount} finding rule${ruleCount === 1 ? "" : "s"} — changing the type removes ${
      ruleCount === 1 ? "it" : "them all"
    }. Re-author findings for the new type deliberately.`,
    "",
    "Continue?",
  ].join("\n");
}

/**
 * Wave T D9 — removing an option whose key exists in a published version
 * orphans its `S5_why_<optionKey>` conditional followup pairing and breaks
 * the option's historical vote-share continuity.
 */
function buildOptionRemoveConfirmText(
  optionKey: string,
  questionStableKey: string,
): string {
  return [
    `Remove option "${optionKey}" from ${questionStableKey}?`,
    "",
    "This option key exists in a published version. Removing it:",
    `• breaks its "S5_why_${optionKey}"-style conditional followup pairing;`,
    "• ends the option's historical vote-share continuity across versions.",
    "",
    "Continue?",
  ].join("\n");
}

/**
 * Wave T D9 (co-validate C4) — changing an inherited slider's scale
 * (min/max/step) drifts its measurement semantics across versions.
 */
function buildScaleChangeConfirmText(questionStableKey: string): string {
  return [
    `Change the scale of inherited question ${questionStableKey}?`,
    "",
    "This question exists in a published version. Changing scale min/max/step drifts its measurement semantics across versions — answers before and after will be on different scales.",
    "",
    "Continue?",
  ].join("\n");
}

/**
 * Wave U3 (spec 19aa D7) — the test-a-value preview inside the Findings panel.
 *
 * Lets an author answer THIS question with the real respondent widget
 * (`QuestionInput` — same slider scale/step, same MULTI_CHOICE checkboxes) and
 * see which finding text would fire. The fired list is computed by the pure
 * `resolveFindings` over the EXACT rules a save would emit
 * (`buildFindingRecommendations` — the shared helper), so the preview provably
 * agrees with what a published version resolves (no drift, D7). Live +
 * tolerant: recomputes as the author types, even on half-authored/coverage-gap
 * rules. The no-answer ⇒ nothing-fires case is shown explicitly so authors
 * understand the hidden⇒omitted rule. Never gated separately — it lives inside
 * the already-flag-gated FindingsPanel (reuses the live Wave U flag; authoring
 * only, no send / prod-data effect). MULTI_CHOICE fires in the question's
 * authored option order regardless of tick order (matches the resolver).
 */
function FindingsPreview({ question }: { question: QuestionDraft }) {
  const [sample, setSample] = useState<
    number | string | string[] | undefined
  >(undefined);

  const previewKey = question.stableKey || "__preview__";

  const forInput: QuestionForInput = {
    stableKey: previewKey,
    type: question.type,
    label: question.label || "Sample answer",
    isRequired: false,
    ...(question.type === "SLIDER_LIKERT"
      ? {
          scale: {
            min: question.scaleMin,
            max: question.scaleMax,
            step: question.scaleStep,
            anchorMin: question.anchorMin,
            anchorMax: question.anchorMax,
          },
        }
      : {}),
    ...(question.type === "MULTI_CHOICE"
      ? {
          options: question.options
            .filter((o) => o.key !== "")
            .map((o) => ({ key: o.key, label: o.label || o.key })),
          ...(question.maxChoices !== null
            ? { maxChoices: question.maxChoices }
            : {}),
        }
      : {}),
  };

  const fired = useMemo(() => {
    const recs = buildFindingRecommendations(question) ?? [];
    const fakeQ = {
      stableKey: previewKey,
      type: question.type,
      label: question.label || previewKey,
      sortOrder: 0,
      recommendations: recs,
      options: question.options.map((o) => ({ key: o.key })),
    };
    const answers = new Map<string, unknown>();
    if (sample !== undefined) answers.set(previewKey, sample);
    return resolveFindings([fakeQ], answers);
  }, [question, sample, previewKey]);

  const answered =
    sample !== undefined &&
    !(typeof sample === "string" && sample === "") &&
    !(Array.isArray(sample) && sample.length === 0);

  return (
    <div
      className="mt-2 rounded border border-dashed border-border p-2 space-y-2"
      data-testid="q-findings-preview"
    >
      <p className="text-[0.6875rem] font-semibold text-muted-foreground">
        Test a value — preview which finding fires
      </p>
      <QuestionInput
        question={forInput}
        value={sample}
        onChange={(_key, v) => setSample(v)}
      />
      <div
        data-testid="q-findings-preview-result"
        className="text-[0.6875rem]"
      >
        {!answered ? (
          <span className="italic text-muted-foreground">
            Enter a sample answer to preview which finding fires.
          </span>
        ) : fired.length === 0 ? (
          <span className="italic text-muted-foreground">
            No finding fires for this answer.
          </span>
        ) : (
          <ul className="space-y-1">
            {fired.map((f, i) => (
              <li key={i} className="text-foreground">
                <span className="font-semibold">Fires:</span> {f.text}
              </li>
            ))}
          </ul>
        )}
      </div>
      {question.type === "SLIDER_LIKERT" && (
        <p className="text-[0.6875rem] italic text-muted-foreground">
          Scored on-screen reports render slider recommendations via the per-row
          path; this previews the resolved band text that freezes on submission.
        </p>
      )}
    </div>
  );
}

/**
 * Wave U (spec 19u U-4/D8) — the collapsible per-question Findings panel.
 * SLIDER/NUMBER: band rows (min | max | text) with add/remove; sliders show
 * an advisory coverage hint (publish enforces full tiling — D11). NUMBER
 * bands may leave gaps (D4). MULTI_CHOICE: one optional text per option.
 * Collapsed by default; the header badge shows the current rule count.
 */
function FindingsPanel({
  question,
  isReadOnly,
  onUpdate,
}: {
  question: QuestionDraft;
  isReadOnly: boolean;
  onUpdate: (patch: Partial<QuestionDraft>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ruleCount = countFindingRules(question);
  const isBandType =
    question.type === "SLIDER_LIKERT" || question.type === "NUMBER";

  const updateBand = (idx: number, patch: Partial<FindingBandDraft>) => {
    onUpdate({
      findingBands: question.findingBands.map((b, i) =>
        i === idx ? { ...b, ...patch } : b,
      ),
    });
  };

  const coverage =
    question.type === "SLIDER_LIKERT"
      ? sliderBandCoverage(
          question.scaleMin,
          question.scaleMax,
          question.scaleStep,
          question.findingBands,
        )
      : null;

  return (
    <div
      className="rounded-md border border-border bg-muted/20 p-3 space-y-2"
      data-testid="q-findings-panel"
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-foreground">
          Findings{ruleCount > 0 ? ` (${ruleCount})` : ""}
        </h4>
        <button
          type="button"
          data-testid="q-findings-toggle"
          onClick={() => setOpen((v) => !v)}
          className="text-[0.6875rem] text-muted-foreground hover:text-foreground"
        >
          {open ? "Hide" : ruleCount > 0 ? "Edit" : "Add"}
        </button>
      </div>
      {!open && (
        <p className="text-[0.6875rem] italic text-muted-foreground">
          {isBandType
            ? "Report text shown when the answer falls in a score range."
            : "Report text shown when an option is selected."}
        </p>
      )}
      {open && isBandType && (
        <div className="space-y-2">
          <ul className="space-y-2">
            {question.findingBands.map((band, idx) => (
              <li key={idx} className="space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    data-testid={`q-finding-band-min-${idx}`}
                    aria-label={`Band ${idx + 1} min`}
                    value={band.minScore ?? ""}
                    onChange={(e) =>
                      updateBand(idx, {
                        minScore:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    disabled={isReadOnly}
                    style={{ width: "4.5rem" }}
                    className="px-2 py-1 text-sm border border-border rounded bg-background text-foreground disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  <span className="text-[0.6875rem] text-muted-foreground">to</span>
                  <input
                    type="number"
                    data-testid={`q-finding-band-max-${idx}`}
                    aria-label={`Band ${idx + 1} max`}
                    value={band.maxScore ?? ""}
                    onChange={(e) =>
                      updateBand(idx, {
                        maxScore:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    disabled={isReadOnly}
                    style={{ width: "4.5rem" }}
                    className="px-2 py-1 text-sm border border-border rounded bg-background text-foreground disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    data-testid={`q-finding-band-remove-${idx}`}
                    onClick={() =>
                      onUpdate({
                        findingBands: question.findingBands.filter(
                          (_, i) => i !== idx,
                        ),
                      })
                    }
                    disabled={isReadOnly}
                    className="ml-auto text-xs font-medium px-2 py-1 rounded text-destructive hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Remove
                  </button>
                </div>
                <textarea
                  data-testid={`q-finding-band-text-${idx}`}
                  aria-label={`Band ${idx + 1} report text`}
                  rows={2}
                  maxLength={2000}
                  placeholder="Report text for answers in this range…"
                  value={band.text}
                  onChange={(e) => updateBand(idx, { text: e.target.value })}
                  disabled={isReadOnly}
                  className="wf-input disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </li>
            ))}
          </ul>
          <button
            type="button"
            data-testid="q-finding-band-add"
            onClick={() =>
              onUpdate({
                findingBands: [
                  ...question.findingBands,
                  { minScore: null, maxScore: null, text: "" },
                ],
              })
            }
            disabled={isReadOnly}
            className="text-[0.6875rem] font-medium px-2 py-1 rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Add band
          </button>
          {coverage && !coverage.complete && (
            <p
              data-testid="q-finding-coverage"
              className="text-[0.6875rem] font-medium text-warning"
            >
              {coverage.message} — sliders must cover the whole scale to
              publish.
            </p>
          )}
          {question.type === "NUMBER" && (
            <p className="text-[0.6875rem] italic text-muted-foreground">
              Gaps are fine — an answer outside every range simply shows no
              finding.
            </p>
          )}
        </div>
      )}
      {open && question.type === "MULTI_CHOICE" && (
        <div className="space-y-2">
          {question.options.length === 0 && (
            <p className="text-[0.6875rem] italic text-muted-foreground">
              Add options first — each option can carry its own finding text.
            </p>
          )}
          {question.options.map((opt, idx) => (
            <div key={opt.key !== "" ? opt.key : `new-${idx}`} className="space-y-1">
              <label className="block text-[0.6875rem] font-medium text-foreground">
                {opt.label || (opt.key !== "" ? opt.key : `Option ${idx + 1}`)}
              </label>
              {opt.key === "" ? (
                <p className="text-[0.6875rem] italic text-muted-foreground">
                  Save the draft first to give this option a key, then add its
                  finding text.
                </p>
              ) : (
                <textarea
                  data-testid={`q-finding-option-${opt.key}`}
                  aria-label={`Finding text for option ${opt.label || opt.key}`}
                  rows={2}
                  maxLength={2000}
                  placeholder="Report text when this option is selected (optional)…"
                  value={question.findingOptionTexts[opt.key] ?? ""}
                  onChange={(e) =>
                    onUpdate({
                      findingOptionTexts: {
                        ...question.findingOptionTexts,
                        [opt.key]: e.target.value,
                      },
                    })
                  }
                  disabled={isReadOnly}
                  className="wf-input disabled:opacity-60 disabled:cursor-not-allowed"
                />
              )}
            </div>
          ))}
        </div>
      )}
      {open && <FindingsPreview question={question} />}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Wave W (spec 19w §2.6) — "Show only when…" panel
// ────────────────────────────────────────────────────────────────────────
/**
 * Collapsible per-question show-if authoring (the Findings-panel idiom).
 * One rule per question: pick a PRECEDING MULTI_CHOICE gate, then one of
 * its options — the question renders only while that option is selected.
 * Interlocks with Required (D4/C6): required questions can't be conditional
 * and vice versa; publish stays the backstop. A dangling rule (its gate no
 * longer eligible — deleted/retyped/reordered in the draft) is surfaced
 * with a warning + Clear; runtime fails open, publish rejects the residue.
 */
function ShowIfPanel({
  question,
  gates,
  isReadOnly,
  onUpdate,
}: {
  question: QuestionDraft;
  gates: ReadonlyArray<ShowIfGateOption>;
  isReadOnly: boolean;
  onUpdate: (patch: Partial<QuestionDraft>) => void;
}) {
  const [open, setOpen] = useState(false);
  const rule = question.showIf;
  const hasCompleteRule = !!rule && rule.questionKey !== "" && rule.optionKey !== "";
  const selectedGate = rule
    ? gates.find((g) => g.stableKey === rule.questionKey) ?? null
    : null;
  const isDangling = !!rule && rule.questionKey !== "" && !selectedGate;

  return (
    <div
      className="rounded-md border border-border bg-muted/10 p-3 space-y-2"
      data-testid="q-showif-panel"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">
            Show only when…
          </span>
          {hasCompleteRule && (
            <span className="inline-flex items-center px-1.5 py-0.5 text-[0.625rem] font-semibold rounded bg-primary/10 text-primary">
              conditional
            </span>
          )}
        </div>
        <button
          type="button"
          data-testid="q-showif-toggle"
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-medium px-2 py-1 rounded text-foreground hover:bg-muted"
          aria-expanded={open}
        >
          {open ? "Hide" : "Configure"}
        </button>
      </div>

      {open && question.isRequired && (
        <p
          className="text-xs italic text-muted-foreground"
          data-testid="q-showif-required-note"
        >
          Required questions can&apos;t be conditional — a hidden required
          question would block every submission. Untick Required first.
        </p>
      )}

      {open && !question.isRequired && (
        <div className="space-y-2">
          {isDangling && (
            <p
              className="text-xs text-destructive"
              data-testid="q-showif-dangling"
            >
              This rule references &ldquo;{rule?.questionKey}&rdquo;, which is
              no longer an earlier multiple-choice question. Publishing will be
              blocked until the rule is cleared or the gate restored.
            </p>
          )}

          {gates.length === 0 && !rule && (
            <p
              className="text-xs italic text-muted-foreground"
              data-testid="q-showif-no-gates"
            >
              No eligible gate yet — add a MULTI_CHOICE question EARLIER in the
              survey (brand-new questions become selectable after the first
              save assigns their key).
            </p>
          )}

          {(gates.length > 0 || rule) && (
            <>
              <div className="space-y-1">
                <label
                  className="wf-label"
                  htmlFor={`q-showif-gate-${question.uid}`}
                >
                  Question
                </label>
                <select
                  id={`q-showif-gate-${question.uid}`}
                  data-testid="q-showif-gate"
                  value={selectedGate ? selectedGate.stableKey : ""}
                  onChange={(e) =>
                    onUpdate({
                      showIf:
                        e.target.value === ""
                          ? null
                          : { questionKey: e.target.value, optionKey: "" },
                    })
                  }
                  disabled={isReadOnly}
                  className="wf-input disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="">(always shown)</option>
                  {gates.map((g) => (
                    <option key={g.stableKey} value={g.stableKey}>
                      {g.label || g.stableKey}
                    </option>
                  ))}
                </select>
              </div>

              {selectedGate && (
                <div className="space-y-1">
                  <label
                    className="wf-label"
                    htmlFor={`q-showif-option-${question.uid}`}
                  >
                    Option
                  </label>
                  <select
                    id={`q-showif-option-${question.uid}`}
                    data-testid="q-showif-option"
                    value={rule?.optionKey ?? ""}
                    onChange={(e) =>
                      onUpdate({
                        showIf: {
                          questionKey: selectedGate.stableKey,
                          optionKey: e.target.value,
                        },
                      })
                    }
                    disabled={isReadOnly}
                    className="wf-input disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="">(pick an option)</option>
                    {selectedGate.options
                      .filter((o) => o.key !== "")
                      .map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.label || o.key}
                        </option>
                      ))}
                  </select>
                  <span className="block text-[0.6875rem] italic text-muted-foreground">
                    Shown only while this option is selected. Half-picked rules
                    are not saved.
                  </span>
                </div>
              )}

              {rule && (
                <button
                  type="button"
                  data-testid="q-showif-clear"
                  onClick={() => onUpdate({ showIf: null })}
                  disabled={isReadOnly}
                  className="text-xs font-medium px-2 py-1 rounded text-destructive hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Clear rule
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function QuestionConfigForm({
  question,
  isReadOnly,
  isUnlocked,
  findingsEnabled,
  conditionalEnabled,
  showIfGates,
  showIfDependents,
  onClearDependents,
  publishedOptionKeys,
  onUpdate,
}: QuestionConfigFormProps) {
  const [numberOpen, setNumberOpen] = useState(false);
  const [multiOpen, setMultiOpen] = useState(false);
  // D9 scale-change warning — acknowledged once per question per session.
  const scaleAckUidsRef = useRef<Set<string>>(new Set());

  // Wave T — scale edits on an INHERITED slider warn once (measurement-
  // semantics drift), then apply silently for that question. Cancel
  // discards the field change. Locked mode keeps today's silent behavior.
  const handleScaleUpdate = (
    patch: Pick<Partial<QuestionDraft>, "scaleMin" | "scaleMax" | "scaleStep">,
  ) => {
    if (!question) return;
    if (
      isUnlocked &&
      question.isInherited &&
      !scaleAckUidsRef.current.has(question.uid)
    ) {
      const ok = window.confirm(
        buildScaleChangeConfirmText(question.stableKey),
      );
      if (!ok) return;
      scaleAckUidsRef.current.add(question.uid);
    }
    onUpdate(patch);
  };

  const handleRemoveOption = (idx: number) => {
    if (!question) return;
    const opt = question.options[idx];
    if (!opt) return;
    const published = publishedOptionKeys[question.stableKey] ?? [];
    const hasRule =
      findingsEnabled &&
      opt.key !== "" &&
      (question.findingOptionTexts[opt.key] ?? "").trim() !== "";
    // Wave W — other questions shown conditionally on THIS option lose
    // their rule with it (confirm-drop, never silent).
    const optionDependents =
      conditionalEnabled && opt.key !== ""
        ? showIfDependents.filter((d) => d.showIf?.optionKey === opt.key)
        : [];
    if (opt.key !== "" && (published.includes(opt.key) || optionDependents.length > 0)) {
      const ok = window.confirm(
        buildOptionRemoveConfirmText(opt.key, question.stableKey) +
          (hasRule
            ? `\n\nIt also carries a finding rule, which will be removed with it.`
            : "") +
          (optionDependents.length > 0
            ? `\n\n${optionDependents.length} question${optionDependents.length === 1 ? "" : "s"} shown conditionally on this option will become always-visible: ${optionDependents.map((d) => d.stableKey).join(", ")}.`
            : ""),
      );
      if (!ok) return;
    }
    // Wave U — removing an option drops its finding rule with it (silently
    // for new-to-draft options; named in the confirm above for published).
    const patch: Partial<QuestionDraft> = {
      options: question.options.filter((_, i) => i !== idx),
    };
    if (opt.key !== "" && question.findingOptionTexts[opt.key] !== undefined) {
      const texts = { ...question.findingOptionTexts };
      delete texts[opt.key];
      patch.findingOptionTexts = texts;
    }
    onUpdate(patch);
    if (optionDependents.length > 0) {
      onClearDependents(optionDependents.map((d) => d.uid));
    }
  };

  // Wave U D21 — ANY retype drops the question's findings rules, behind a
  // confirm naming the loss. (Retype is only possible on new-to-draft
  // questions — the dropdown is disabled for inherited ones.)
  const handleTypeChange = (nextType: string) => {
    if (!question || nextType === question.type) return;
    // Wave W — retyping a gate away from MULTI_CHOICE strands its
    // dependents' rules; confirm names them, then their rules are cleared.
    const typeDependents =
      conditionalEnabled &&
      question.type === "MULTI_CHOICE" &&
      nextType !== "MULTI_CHOICE"
        ? showIfDependents
        : [];
    const ruleCount = findingsEnabled ? countFindingRules(question) : 0;
    if (ruleCount > 0 || typeDependents.length > 0) {
      const ok = window.confirm(
        (ruleCount > 0
          ? buildTypeChangeFindingsConfirmText(ruleCount, question.type, nextType)
          : `Change question type ${question.type} → ${nextType}?`) +
          (typeDependents.length > 0
            ? `\n\n${typeDependents.length} question${typeDependents.length === 1 ? "" : "s"} shown conditionally on this one will become always-visible: ${typeDependents.map((d) => d.stableKey).join(", ")}.`
            : ""),
      );
      if (!ok) return;
      if (ruleCount > 0) {
        onUpdate({ type: nextType, findingBands: [], findingOptionTexts: {} });
      } else {
        onUpdate({ type: nextType });
      }
      if (typeDependents.length > 0) {
        onClearDependents(typeDependents.map((d) => d.uid));
      }
      return;
    }
    onUpdate({ type: nextType });
  };

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
          value={
            question.stableKey === ""
              ? "(assigned on save)"
              : question.stableKey
          }
          readOnly
          className={
            question.stableKey === ""
              ? "wf-input italic text-muted-foreground"
              : "wf-input"
          }
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
        {isUnlocked ? (
          /* Wave T D1/D3 — all 4 engine types enabled while new-to-draft;
             type is LOCKED (delete + add) once the key is published. The
             fake TEXTAREA/COMPOUND placeholders are removed flag-on. */
          <select
            id={`q-type-${question.uid}`}
            value={question.type}
            onChange={(e) => handleTypeChange(e.target.value)}
            disabled={isReadOnly || question.isInherited}
            className="wf-input disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <option value="SLIDER_LIKERT">SLIDER_LIKERT</option>
            <option value="TEXT">TEXT</option>
            <option value="NUMBER">NUMBER</option>
            <option value="MULTI_CHOICE">MULTI_CHOICE</option>
          </select>
        ) : (
          <select
            id={`q-type-${question.uid}`}
            value={question.type}
            onChange={(e) => handleTypeChange(e.target.value)}
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
        )}
        {isUnlocked ? (
          question.isInherited ? (
            <span className="block text-[0.6875rem] italic text-muted-foreground">
              Type is locked once published — a different type is a new
              question (delete + add).
            </span>
          ) : null
        ) : (
          <span className="block text-[0.6875rem] italic text-muted-foreground">
            v1 active types cover all 4 default INVITED templates. v1.5 types
            stay disabled until QSP v2 compound questions ship.
          </span>
        )}
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
            disabled={
              isReadOnly || (conditionalEnabled && question.showIf !== null)
            }
            className="w-4 h-4 disabled:opacity-60"
          />
        </label>
        {conditionalEnabled && question.showIf !== null && (
          <span
            className="block text-[0.6875rem] italic text-muted-foreground"
            data-testid="q-required-showif-note"
          >
            Conditional questions are always optional — clear the
            &ldquo;Show only when&hellip;&rdquo; rule to make this required.
          </span>
        )}
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

      {/* Read-only fallback for non-SLIDER_LIKERT question types (legacy,
          flag-off only — Wave T unlocks per-type editing) */}
      {!isUnlocked && question.type !== "SLIDER_LIKERT" && (
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
                handleScaleUpdate({ scaleMin: Number(e.target.value) })
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
                handleScaleUpdate({ scaleMax: Number(e.target.value) })
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
                handleScaleUpdate({ scaleStep: Number(e.target.value) })
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

      {/* ── Wave T (flag ON) — per-type config blocks ── */}
      {isUnlocked && question.type === "TEXT" && (
        <div
          className="rounded-md border border-border bg-muted/20 p-3 space-y-1"
          data-testid="text-config-note"
        >
          <h4 className="text-xs font-semibold text-foreground">
            TEXT — free text
          </h4>
          <p className="text-[0.6875rem] italic text-muted-foreground">
            Renders as a multi-line answer box on the respondent form.
            Answers are capped at 10,000 characters.
          </p>
        </div>
      )}

      {isUnlocked && question.type === "NUMBER" && (
        <div
          className="rounded-md border border-border bg-muted/20 p-3 space-y-1"
          data-testid="number-config-note"
        >
          <h4 className="text-xs font-semibold text-foreground">
            NUMBER — numeric entry
          </h4>
          <p className="text-[0.6875rem] italic text-muted-foreground">
            Free numeric entry with finite-number validation at submit.
            Put units or bounds guidance in the Help text.
          </p>
        </div>
      )}

      {isUnlocked && question.type === "MULTI_CHOICE" && (
        <div
          className="rounded-md border border-border bg-muted/20 p-3 space-y-2"
          data-testid="multichoice-config"
        >
          <h4 className="text-xs font-semibold text-foreground">
            MULTI_CHOICE — options
          </h4>
          {question.options.length === 0 && (
            <p className="text-[0.6875rem] italic text-warning">
              At least one option is required to save.
            </p>
          )}
          <ul className="space-y-1">
            {question.options.map((opt, idx) => (
              <li key={idx} className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 text-[0.625rem] font-mono rounded bg-muted text-muted-foreground whitespace-nowrap ${
                    opt.isNew && opt.key === "" ? "italic" : "font-semibold"
                  }`}
                >
                  {opt.isNew && opt.key === "" ? "auto from label" : opt.key}
                </span>
                <input
                  type="text"
                  data-testid={`q-option-label-${idx}`}
                  aria-label={`Option ${idx + 1} label`}
                  value={opt.label}
                  onChange={(e) =>
                    onUpdate({
                      options: question.options.map((o, i) =>
                        i === idx ? { ...o, label: e.target.value } : o,
                      ),
                    })
                  }
                  disabled={isReadOnly}
                  className="wf-input flex-1 disabled:opacity-60 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  data-testid={`q-option-remove-${idx}`}
                  onClick={() => handleRemoveOption(idx)}
                  disabled={isReadOnly}
                  className="text-xs font-medium px-2 py-1 rounded text-destructive hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            data-testid="q-option-add"
            onClick={() =>
              onUpdate({
                options: [
                  ...question.options,
                  { key: "", label: "", isNew: true },
                ],
              })
            }
            disabled={isReadOnly}
            className="text-[0.6875rem] font-medium px-2 py-1 rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Add option
          </button>
          <div className="space-y-1">
            <label
              className="block text-[0.6875rem] font-medium text-foreground"
              htmlFor={`q-maxchoices-${question.uid}`}
            >
              Max choices
            </label>
            <input
              id={`q-maxchoices-${question.uid}`}
              data-testid="q-maxchoices"
              type="number"
              min={1}
              value={question.maxChoices ?? ""}
              onChange={(e) =>
                onUpdate({
                  maxChoices:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
              disabled={isReadOnly}
              style={{ width: "5rem" }}
              className="px-2 py-1 text-sm border border-border rounded bg-background text-foreground disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <span className="block text-[0.6875rem] italic text-muted-foreground">
              Blank = unlimited. Enforced live on the respondent form.
            </span>
          </div>
        </div>
      )}

      {/* ── Wave U (spec 19u U-4) — Findings panel (flag-gated; never on TEXT).
          Editable on inherited questions (D9 reword-class — the whole point
          is adding findings to existing LVA/QSP questions). ── */}
      {findingsEnabled && question.type !== "TEXT" && (
        <FindingsPanel
          question={question}
          isReadOnly={isReadOnly}
          onUpdate={onUpdate}
        />
      )}

      {/* ── Wave W (spec 19w §2.6) — "Show only when…" panel (flag-gated;
          any type may be conditional; editable on inherited questions —
          showIf is reword-class, it changes form flow, never identity). ── */}
      {conditionalEnabled && (
        <ShowIfPanel
          question={question}
          gates={showIfGates}
          isReadOnly={isReadOnly}
          onUpdate={onUpdate}
        />
      )}

      {/* ── Legacy v1.5 accordions (flag OFF only) ── */}
      {!isUnlocked && (
        <>
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
        </>
      )}
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

  // Questions whose showIf references a given question's stableKey.
  const showIfDependentsOf = useCallback(
    (gate: QuestionDraft): QuestionDraft[] => {
      if (!conditionalEnabled || gate.stableKey === "") return [];
      return questions.filter(
        (q) => q.uid !== gate.uid && q.showIf?.questionKey === gate.stableKey,
      );
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
          <QuestionConfigForm
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
