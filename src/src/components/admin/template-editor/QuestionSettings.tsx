"use client";

/**
 * QuestionSettings — ED9 Task 4 (spec 19al-plan).
 *
 * The per-type config BODY of a question, lifted VERBATIM out of
 * `QuestionInspector`: the read-only fallback (flag-off, non-slider), the
 * active SLIDER_LIKERT "Slider settings" block, and the Wave-T (flag-on)
 * TEXT / NUMBER / MULTI_CHOICE blocks. ED9's single-column Google-Forms
 * question card composes this exact surface, so the two authoring surfaces
 * share ONE source (no fork). Rendered DOM is byte-identical to the pre-T4
 * inspector — pinned by `ed9-golden-snapshots.test.tsx` — and the component's
 * own contract by `QuestionSettings.test.tsx`.
 *
 * Deliberately NOT included (they stay rendered by `QuestionInspector`):
 *  - the Findings / Show-only-when panels (their own reusable exports, T4);
 *  - the flag-OFF legacy v1.5 NUMBER/MULTI accordions (a dead preview surface
 *    the flag-on Forms card never shows — and they sit AFTER the panels, so
 *    lifting them here would reorder the inspector's DOM).
 *
 * The three destructive edits (scale change / option remove — and type change,
 * which the inspector's own dropdown drives) run through the SHARED
 * `useQuestionEditorActions` command layer. To avoid a second hook instance
 * (which would fork the once-per-question scale-ack ref), the inspector calls
 * the hook ONCE and passes the resulting `actions` object down as a prop.
 */

import type { QuestionDraftRow } from "./question-serialization";
import type { QuestionEditorActions } from "./hooks/useQuestionEditorActions";

type QuestionDraft = QuestionDraftRow;

interface QuestionSettingsProps {
  question: QuestionDraft;
  isReadOnly: boolean;
  isUnlocked: boolean;
  onUpdate: (patch: Partial<QuestionDraft>) => void;
  /** The shared command layer (from `useQuestionEditorActions`) — one instance
   *  per inspector, passed down so scale/option-remove confirms don't fork. */
  actions: QuestionEditorActions;
}

export function QuestionSettings({
  question,
  isReadOnly,
  isUnlocked,
  onUpdate,
  actions,
}: QuestionSettingsProps) {
  const { removeOption, updateScale } = actions;

  return (
    <>
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
          Slider settings
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
                updateScale(question, { scaleMin: Number(e.target.value) })
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
                updateScale(question, { scaleMax: Number(e.target.value) })
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
                updateScale(question, { scaleStep: Number(e.target.value) })
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
              Label for the lowest point
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
              Label for the highest point
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
          Respondents pick a whole number between the min and max, moving in
          steps of the step size.
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
            Short text
          </h4>
          <p className="text-[0.6875rem] italic text-muted-foreground">
            Respondents type their answer in a text box (up to 10,000
            characters).
          </p>
        </div>
      )}

      {isUnlocked && question.type === "NUMBER" && (
        <div
          className="rounded-md border border-border bg-muted/20 p-3 space-y-1"
          data-testid="number-config-note"
        >
          <h4 className="text-xs font-semibold text-foreground">
            Number
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
            Answer options
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
                  onClick={() => removeOption(question, idx)}
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
    </>
  );
}
