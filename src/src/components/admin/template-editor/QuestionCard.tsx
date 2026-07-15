"use client";

/**
 * QuestionCard — ED6 (spec 19ah), Task 7.
 *
 * The single-column builder's per-question row. COLLAPSED it is a fixed-height
 * one-line summary (drag handle · position · type badge · prompt · state badges ·
 * Duplicate/Delete); a plain slider shows NO state badges and reads like a
 * Google Forms row. FOCUSED it also renders an expanded body slot
 * (`card-body-<uid>`) that Task 11 fills with the live preview + bare inspector.
 *
 * `React.memo` with an explicit prop comparator (`areEqual`) is load-bearing:
 * the parent rebuilds the whole `Map<uid, CardViewModel>` every render, so the
 * `vm` object identity always changes — comparing its PRIMITIVE fields (plus
 * `isFocused`/`isReadOnly`) is what lets editing one card skip re-rendering the
 * other 60 (co-validate §15.6; proven by the Task 9 render-count guard). All
 * handlers are stable (`useEditorCommands` + the selection setter), so they are
 * intentionally excluded from the comparison.
 */

import React from "react";

import type { CardViewModel } from "./single-column-view-model";

const TYPE_LABEL: Record<string, string> = {
  SLIDER_LIKERT: "SLIDER",
  NUMBER: "NUMBER",
  MULTI_CHOICE: "MULTI_CHOICE",
  TEXT: "TEXT",
};

export interface QuestionCardProps {
  vm: CardViewModel;
  isFocused: boolean;
  isReadOnly: boolean;
  /** Stable — the selection setter. */
  onFocus: (uid: string) => void;
  /** Stable — `useEditorCommands.duplicateQuestion`. */
  onDuplicate: (uid: string) => void;
  /** Stable — `useEditorCommands.deleteQuestion` (confirm + focus inside). */
  onDelete: (uid: string) => void;
  /** Stable — registers the row's focus button for the parent's focus effect. */
  registerFocusRef: (uid: string, el: HTMLButtonElement | null) => void;
}

function Badge({ label, glyph }: { label: string; glyph: string }) {
  return (
    <span
      data-testid={`card-badge-${label.toLowerCase()}`}
      className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[0.6rem] text-muted-foreground"
    >
      <span aria-hidden="true">{glyph}</span>
      {label}
    </span>
  );
}

function QuestionCardImpl({
  vm,
  isFocused,
  isReadOnly,
  onFocus,
  onDuplicate,
  onDelete,
  registerFocusRef,
}: QuestionCardProps) {
  const { uid, stableKey, type, label, position, badges } = vm;
  return (
    <div
      data-testid={`question-card-${uid}`}
      aria-current={isFocused ? "true" : undefined}
      className={`rounded-lg border bg-card ${
        isFocused
          ? "border-l-4 border-l-primary shadow-md"
          : "border-border"
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        {!isReadOnly && (
          <span
            data-testid={`drag-handle-${uid}`}
            aria-hidden="true"
            className="cursor-grab select-none text-muted-foreground"
          >
            ⠿
          </span>
        )}
        <span className="w-4 text-right text-xs tabular-nums text-muted-foreground">
          {position}
        </span>
        <span className="rounded border border-border px-1.5 py-0.5 text-[0.6rem] font-medium text-muted-foreground">
          {TYPE_LABEL[type] ?? type}
        </span>
        <button
          type="button"
          ref={(el) => registerFocusRef(uid, el)}
          data-testid={`card-focus-${uid}`}
          onClick={() => onFocus(uid)}
          className="flex-1 truncate text-left text-sm hover:underline"
        >
          {label.trim() || (stableKey ? stableKey : "(untitled)")}
        </button>
        <span className="flex shrink-0 gap-1">
          {badges.findings && <Badge label="Findings" glyph="✎" />}
          {badges.showIf && <Badge label="Show-if" glyph="⚑" />}
          {badges.required && <Badge label="Required" glyph="＊" />}
          {badges.unassigned && <Badge label="Unassigned" glyph="⚠" />}
        </span>
        {!isReadOnly && (
          <span className="flex shrink-0 gap-2 text-xs">
            <button
              type="button"
              data-testid={`card-duplicate-${uid}`}
              onClick={() => onDuplicate(uid)}
              className="text-muted-foreground hover:text-foreground"
            >
              Duplicate
            </button>
            <button
              type="button"
              data-testid={`card-delete-${uid}`}
              onClick={() => onDelete(uid)}
              className="text-destructive hover:underline"
            >
              Delete
            </button>
          </span>
        )}
      </div>
      {isFocused && <div data-testid={`card-body-${uid}`} />}
    </div>
  );
}

function areEqual(a: QuestionCardProps, b: QuestionCardProps): boolean {
  if (a.isFocused !== b.isFocused || a.isReadOnly !== b.isReadOnly) return false;
  const x = a.vm;
  const y = b.vm;
  return (
    x.uid === y.uid &&
    x.stableKey === y.stableKey &&
    x.type === y.type &&
    x.label === y.label &&
    x.position === y.position &&
    x.badges.findings === y.badges.findings &&
    x.badges.showIf === y.badges.showIf &&
    x.badges.required === y.badges.required &&
    x.badges.unassigned === y.badges.unassigned
    // handlers are stable (useEditorCommands + selection setter) — excluded.
  );
}

export const QuestionCard = React.memo(QuestionCardImpl, areEqual);
