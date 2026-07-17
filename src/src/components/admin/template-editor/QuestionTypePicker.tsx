"use client";

/**
 * QuestionTypePicker — ED9 Task 5 (spec 19al-plan).
 *
 * The single-column builder's inline type control: a small icon+label button
 * that opens a menu of exactly the 4 live engine types — SLIDER_LIKERT,
 * TEXT, NUMBER, MULTI_CHOICE (same set + order as `QuestionInspector`'s
 * unlocked `<select>`; the dormant TEXTAREA/COMPOUND v1.5 placeholders never
 * appear here). Selecting a DIFFERENT type calls the SHARED `changeType`
 * command (Task 3, `useQuestionEditorActions`) — the exact same confirm(s) +
 * findings/show-if cleanup as the inspector's dropdown, never forked.
 *
 * `changeType` is passed in already-bound by the parent's OWN
 * `useQuestionEditorActions()` instance — this component never calls the
 * hook itself, so a single question can never end up with two independent
 * scale-ack/confirm instances (double-confirm risk).
 *
 * Renders a non-interactive locked chip instead of the menu when:
 *   - `question.isInherited` — published; Wave T's rule is retype = a new
 *     question (delete + add), never an in-place type change; or
 *   - `isReadOnly` — the surface itself doesn't allow edits; or
 *   - `!isUnlocked` — the Wave T 4-type unlock is off. This picker IS the
 *     Wave-T-unlocked idiom; it is not a substitute for the legacy
 *     v1.5-placeholder `<select>` QuestionInspector renders flag-off.
 */

import { useRef, useState } from "react";
import {
  SlidersHorizontal,
  ListChecks,
  Hash,
  AlignLeft,
  Lock,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";

import type { QuestionDraftRow } from "./question-serialization";
import { QUESTION_TYPE_LABELS } from "./enum-labels";
import { useOnClickOutside } from "./hooks/useOnClickOutside";

type QuestionDraft = QuestionDraftRow;

/** The 4 live engine types, in the same order as the inspector's unlocked `<select>`. */
const ENGINE_TYPES = [
  "SLIDER_LIKERT",
  "TEXT",
  "NUMBER",
  "MULTI_CHOICE",
] as const;

const TYPE_ICONS: Record<string, LucideIcon> = {
  SLIDER_LIKERT: SlidersHorizontal,
  MULTI_CHOICE: ListChecks,
  NUMBER: Hash,
  TEXT: AlignLeft,
};

function typeLabel(type: string): string {
  return QUESTION_TYPE_LABELS[type] ?? type;
}

export interface QuestionTypePickerProps {
  question: QuestionDraft;
  isReadOnly: boolean;
  isUnlocked: boolean;
  /** Bound `changeType` from the parent's `useQuestionEditorActions()`. */
  changeType: (question: QuestionDraft, nextType: string) => void;
}

export function QuestionTypePicker(props: QuestionTypePickerProps) {
  const { question, isReadOnly, isUnlocked, changeType } = props;
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(containerRef, () => setOpen(false), open);

  const locked = isReadOnly || question.isInherited || !isUnlocked;
  const CurrentIcon = TYPE_ICONS[question.type];

  if (locked) {
    return (
      <span
        data-testid="type-locked"
        title="Type is locked once published — a different type is a new question (delete + add)."
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground"
      >
        {CurrentIcon ? (
          <CurrentIcon className="h-3.5 w-3.5" aria-hidden="true" />
        ) : null}
        <span className="text-foreground">{typeLabel(question.type)}</span>
        <Lock className="h-3 w-3" aria-hidden="true" />
        <span>Locked once published</span>
      </span>
    );
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        data-testid="question-type-picker"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground hover:bg-muted"
      >
        {CurrentIcon ? (
          <CurrentIcon className="h-3.5 w-3.5" aria-hidden="true" />
        ) : null}
        <span>{typeLabel(question.type)}</span>
        <ChevronDown className="h-3 w-3" aria-hidden="true" />
      </button>
      {open && (
        <ul
          data-testid="question-type-picker-menu"
          className="absolute left-0 z-50 mt-1 min-w-[9rem] list-none rounded-md border border-border bg-card p-1 shadow-lg"
        >
          {ENGINE_TYPES.map((nextType) => {
            const Icon = TYPE_ICONS[nextType];
            return (
              <li key={nextType}>
                <button
                  type="button"
                  data-testid={`question-type-option-${nextType}`}
                  onClick={() => {
                    setOpen(false);
                    if (nextType !== question.type) {
                      changeType(question, nextType);
                    }
                  }}
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs text-foreground hover:bg-muted"
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {typeLabel(nextType)}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
