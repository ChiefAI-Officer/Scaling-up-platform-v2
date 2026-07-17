"use client";

/**
 * FormQuestionCard — ED9 (spec 19al-plan), Task 7.
 *
 * The Google-Forms-style single-column builder's per-question row. COLLAPSED
 * it is a compact one-line summary — drag handle · position · a friendly,
 * color-coded type pill · the prompt as a focus button · glyph state badges
 * (＊ Required, ⚑ Show-if, ✎ Findings, ⚠ Unassigned) with `title` tooltips.
 * Text "Duplicate"/"Delete" links are GONE from the collapsed row (D3) — they
 * move into the focused footer action bar (candidate #2).
 *
 * FOCUSED it composes the pieces already extracted by earlier ED9 tasks —
 * never rebuilding them: a title `<input>` beside `QuestionTypePicker`
 * (Task 5), a help-text input, the live `QuestionCanvas` preview (ED4),
 * `QuestionSettings` (Task 4, the per-type config body), the Wave U
 * `FindingsPanel` / Wave W `ShowIfPanel` (both now named exports of
 * `QuestionInspector`, Task 4), and a footer action bar (Duplicate/Delete
 * icons + a Required switch). The three destructive edits a question's
 * config surface performs (retype / option-remove / inherited-scale-change)
 * are constructed ONCE here via `useQuestionEditorActions` (Task 3) and
 * handed to the picker + settings as `actions` — one command-layer instance
 * per question, never forked (co-validate Codex#1).
 *
 * The footer Required switch reuses the EXACT Wave W show-if⇒optional
 * interlock (`QuestionInspector.tsx` ~L787): disabled + hinted whenever the
 * question carries a `showIf` rule while conditional authoring is enabled —
 * a conditional question can never be required.
 *
 * `React.memo` + `formQuestionCardPropsAreEqual` mirror `QuestionCard`'s own
 * render-guard contract verbatim (co-validate §15.6): the parent rebuilds the
 * whole per-card view-model map every render, so only comparing the vm's
 * PRIMITIVE fields (+ isReadOnly + a cheap section signature) lets editing
 * one card skip re-rendering the other N. The focused card is NEVER
 * memo-skipped — it renders the live expanded body. `question` is `null` for
 * every non-focused card by contract (the parent hands the full draft only
 * to the focused one, exactly as `SingleColumnFormBuilder` does today), so
 * it never needs comparing: the `isFocused` check already forces a
 * re-render whenever it would matter.
 */

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, Trash2 } from "lucide-react";

import type { CardViewModel } from "./single-column-view-model";
import type { QuestionDraftRow } from "./question-serialization";
import type { ShowIfGateOption } from "./QuestionInspector";
import { FindingsPanel, ShowIfPanel } from "./QuestionInspector";
import { QuestionSettings } from "./QuestionSettings";
import { QuestionTypePicker } from "./QuestionTypePicker";
import { QuestionCanvas } from "./QuestionCanvas";
import { shapeSignature } from "./question-widget-mapper";
import { QUESTION_TYPE_LABELS } from "./enum-labels";
import { useQuestionEditorActions } from "./hooks/useQuestionEditorActions";

export interface FormQuestionCardSection {
  stableKey: string;
  name: string;
}

export interface FormQuestionCardProps {
  vm: CardViewModel;
  /** The full draft — passed ONLY for the focused card (parent contract). */
  question: QuestionDraftRow | null;
  isFocused: boolean;
  isReadOnly: boolean;
  /** Wave T — per-type question editing unlocked. */
  isUnlocked: boolean;
  /** Wave U — findings-logic authoring panel. */
  findingsEnabled: boolean;
  /** Wave W — conditional (show-if) authoring panel. */
  conditionalEnabled: boolean;
  /** All sections (for the move-to-section select). */
  sections: readonly FormQuestionCardSection[];
  /** Wave W — eligible gates for the FOCUSED question (canonical order). */
  showIfGates: ReadonlyArray<ShowIfGateOption>;
  /** Wave W — questions whose showIf references the FOCUSED question. */
  showIfDependents: ReadonlyArray<QuestionDraftRow>;
  /** Wave T — union of published option keys per question stableKey. */
  publishedOptionKeys: Record<string, readonly string[]>;
  /** Stable — the selection setter. */
  onFocus: (uid: string) => void;
  /** Stable — `useEditorCommands.duplicateQuestion`. */
  onDuplicate: (uid: string) => void;
  /** Stable — `useEditorCommands.deleteQuestion` (confirm + focus inside). */
  onDelete: (uid: string) => void;
  /** Stable — `useEditorCommands.moveQuestion` (confirm-if-inherited inside). */
  onMove: (uid: string, targetSectionKey: string) => void;
  /** Wave W — clear the showIf of the given question uids (dependent hygiene). */
  onClearDependents: (uids: string[]) => void;
  /** Apply a patch to the focused question. */
  onUpdate: (patch: Partial<QuestionDraftRow>) => void;
  /** Stable — registers the row's focus button for the parent's focus effect. */
  registerFocusRef: (uid: string, el: HTMLButtonElement | null) => void;
  children?: React.ReactNode;
}

/** Candidate #3 — a friendly, color-coded type pill (shadcn semantic tokens
 *  only, per CLAUDE.md; the categories are purely decorative groupings, not
 *  status semantics, but reusing the existing named hues keeps them
 *  theme-aware in both light and dark). */
const TYPE_PILL_CLASSES: Record<string, string> = {
  SLIDER_LIKERT: "bg-primary/10 text-primary",
  MULTI_CHOICE: "bg-info/10 text-info",
  NUMBER: "bg-warning/10 text-warning",
  TEXT: "bg-success/10 text-success",
};
const DEFAULT_TYPE_PILL_CLASS = "bg-muted text-muted-foreground";

function typePillClassName(type: string): string {
  return TYPE_PILL_CLASSES[type] ?? DEFAULT_TYPE_PILL_CLASS;
}

function FormQuestionCardImpl({
  vm,
  question,
  isFocused,
  isReadOnly,
  isUnlocked,
  findingsEnabled,
  conditionalEnabled,
  sections,
  showIfGates,
  showIfDependents,
  publishedOptionKeys,
  onFocus,
  onDuplicate,
  onDelete,
  onMove,
  onClearDependents,
  onUpdate,
  registerFocusRef,
  children,
}: FormQuestionCardProps) {
  const { uid, stableKey, type, label, position, sectionStableKey, badges } = vm;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: uid, disabled: isReadOnly });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  // ED9 T3 — the shared destructive-edit command layer, constructed ONCE per
  // question and handed to both QuestionTypePicker (changeType) and
  // QuestionSettings (removeOption/updateScale). Called unconditionally
  // (Rules of Hooks) even for a collapsed card — cheap (a ref + 3 closures)
  // and never invoked with real data until the card is focused.
  const actions = useQuestionEditorActions({
    isUnlocked,
    findingsEnabled,
    conditionalEnabled,
    showIfDependents,
    onClearDependents,
    publishedOptionKeys,
    onUpdate,
  });

  const sectionDisplayName = question
    ? sections.find((s) => s.stableKey === question.sectionStableKey)?.name.trim() ||
      null
    : null;

  const requiredDisabled = conditionalEnabled && question?.showIf != null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`form-question-card-${uid}`}
      aria-current={isFocused ? "true" : undefined}
      className={`rounded-lg border bg-card ${
        isFocused ? "border-l-4 border-l-primary shadow-md" : "border-border"
      }`}
    >
      <div
        className={`flex items-center gap-2 px-3 py-2 ${isFocused ? "text-muted-foreground" : ""}`}
      >
        {!isReadOnly && (
          <button
            type="button"
            data-testid={`form-drag-handle-${uid}`}
            aria-label={`Drag to reorder ${label.trim() || stableKey || "question"}`}
            className="inline-flex h-6 w-6 items-center justify-center cursor-grab select-none text-muted-foreground"
            {...attributes}
            {...listeners}
          >
            ⠿
          </button>
        )}
        <span className="w-4 text-right text-xs tabular-nums text-muted-foreground">
          {position}
        </span>
        <span
          className={`rounded px-1.5 py-0.5 text-[0.6rem] font-medium ${typePillClassName(type)}`}
        >
          {QUESTION_TYPE_LABELS[type] ?? type}
        </span>
        <button
          type="button"
          ref={(el) => registerFocusRef(uid, el)}
          data-testid={`form-card-focus-${uid}`}
          onClick={() => onFocus(uid)}
          className="flex-1 truncate text-left text-sm hover:underline"
        >
          {label.trim() || (stableKey ? stableKey : "(untitled)")}
        </button>
        <span className="flex shrink-0 items-center gap-1.5 text-sm">
          {badges.required && (
            <span title="Required" aria-label="Required" className="text-muted-foreground">
              ＊
            </span>
          )}
          {badges.showIf && (
            <span title="Show-if" aria-label="Show-if" className="text-muted-foreground">
              ⚑
            </span>
          )}
          {badges.findings && (
            <span title="Findings" aria-label="Findings" className="text-muted-foreground">
              ✎
            </span>
          )}
          {badges.unassigned && (
            <span title="Unassigned" aria-label="Unassigned" className="text-warning">
              ⚠
            </span>
          )}
        </span>
        {!isReadOnly && sections.length > 1 && (
          <select
            data-testid={`form-card-move-${uid}`}
            aria-label="Move to section"
            value={sectionStableKey}
            onChange={(e) => {
              if (e.target.value !== sectionStableKey) onMove(uid, e.target.value);
            }}
            className="shrink-0 rounded border border-border bg-transparent px-1 py-0.5 text-xs"
          >
            {sections.map((s) => (
              <option key={s.stableKey} value={s.stableKey}>
                {s.name.trim() || s.stableKey}
              </option>
            ))}
          </select>
        )}
      </div>

      {isFocused && question && (
        <div
          data-testid={`form-card-body-${uid}`}
          className="space-y-4 border-t border-border p-4"
        >
          <div className="flex items-start gap-2">
            <input
              type="text"
              data-testid={`form-card-title-${uid}`}
              aria-label="Question title"
              placeholder="Question"
              value={question.label}
              onChange={(e) => onUpdate({ label: e.target.value })}
              disabled={isReadOnly}
              className="flex-1 rounded border border-transparent bg-transparent px-1 py-1 text-lg font-medium text-foreground outline-none focus:border-border disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <QuestionTypePicker
              question={question}
              isReadOnly={isReadOnly}
              isUnlocked={isUnlocked}
              changeType={actions.changeType}
            />
          </div>

          <input
            type="text"
            data-testid={`form-card-help-${uid}`}
            aria-label="Help text"
            placeholder="Help text (optional)"
            value={question.helpText}
            onChange={(e) => onUpdate({ helpText: e.target.value })}
            disabled={isReadOnly}
            className="w-full rounded border border-border bg-transparent px-2 py-1 text-sm text-muted-foreground outline-none disabled:opacity-60 disabled:cursor-not-allowed"
          />

          <QuestionCanvas
            key={`${uid}:${shapeSignature(question)}`}
            question={question}
            sectionName={sectionDisplayName}
          />

          <QuestionSettings
            question={question}
            isReadOnly={isReadOnly}
            isUnlocked={isUnlocked}
            publishedOptionKeys={publishedOptionKeys}
            onUpdate={onUpdate}
            actions={actions}
          />

          {findingsEnabled && question.type !== "TEXT" && (
            <FindingsPanel
              question={question}
              isReadOnly={isReadOnly}
              onUpdate={onUpdate}
            />
          )}

          {conditionalEnabled && (
            <ShowIfPanel
              question={question}
              gates={showIfGates}
              isReadOnly={isReadOnly}
              onUpdate={onUpdate}
            />
          )}

          {!isReadOnly && (
            <div
              data-testid={`form-card-footer-${uid}`}
              className="flex items-center justify-between gap-2 border-t border-border pt-3"
            >
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  data-testid={`form-card-duplicate-${uid}`}
                  aria-label="Duplicate question"
                  title="Duplicate"
                  onClick={() => onDuplicate(uid)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Copy className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  data-testid={`form-card-delete-${uid}`}
                  aria-label="Delete question"
                  title="Delete"
                  onClick={() => onDelete(uid)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">Required</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={question.isRequired}
                    data-testid={`form-card-required-${uid}`}
                    onClick={() => onUpdate({ isRequired: !question.isRequired })}
                    disabled={requiredDisabled}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      question.isRequired ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-background shadow transition-transform ${
                        question.isRequired ? "translate-x-4" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
                {requiredDisabled && (
                  <span
                    data-testid={`form-card-required-hint-${uid}`}
                    className="text-[0.6875rem] italic text-muted-foreground"
                  >
                    Conditional questions are always optional — clear the “Show
                    only when…” rule to make this required.
                  </span>
                )}
              </div>
            </div>
          )}

          {children}
        </div>
      )}
    </div>
  );
}

function sectionsSig(sections: readonly FormQuestionCardSection[]): string {
  return sections.map((s) => `${s.stableKey} ${s.name}`).join("|");
}

/**
 * React.memo's re-render gate — mirrors `questionCardPropsAreEqual` exactly
 * (same fields, same reasoning). `question`/`showIfGates`/`showIfDependents`/
 * `isUnlocked`/`findingsEnabled`/`conditionalEnabled`/`publishedOptionKeys`
 * only matter to the FOCUSED body, and the focused card is never memo-skipped
 * (the `isFocused` check below returns `false` first), so they're excluded
 * here exactly as `children` was excluded from `QuestionCard`'s guard.
 */
export function formQuestionCardPropsAreEqual(
  a: FormQuestionCardProps,
  b: FormQuestionCardProps,
): boolean {
  if (a.isFocused || b.isFocused) return false;
  if (a.isReadOnly !== b.isReadOnly) return false;
  const x = a.vm;
  const y = b.vm;
  if (
    x.uid !== y.uid ||
    x.stableKey !== y.stableKey ||
    x.type !== y.type ||
    x.label !== y.label ||
    x.position !== y.position ||
    x.sectionStableKey !== y.sectionStableKey ||
    x.badges.findings !== y.badges.findings ||
    x.badges.showIf !== y.badges.showIf ||
    x.badges.required !== y.badges.required ||
    x.badges.unassigned !== y.badges.unassigned
  ) {
    return false;
  }
  if (a.sections.length !== b.sections.length) return false;
  return sectionsSig(a.sections) === sectionsSig(b.sections);
}

export const FormQuestionCard = React.memo(
  FormQuestionCardImpl,
  formQuestionCardPropsAreEqual,
);
