"use client";

/**
 * QuestionCanvas — ED4 (spec 19af §3.3), Task 5.
 *
 * Center pane of the three-pane workspace: renders the FOCUSED question exactly
 * as a respondent sees it (section heading → label → help → required → the real
 * `QuestionInput`), so the author sees the live widget while editing settings in
 * the inspector.
 *
 * INVARIANT (§3.3 / co-validate C4): the preview answer-state is LOCAL and
 * THROWAWAY. It lives in this component's own `useState`, is never written to
 * the model, never sets a dirty flag, and never emits a request — this component
 * receives NO model/mutation prop, so it structurally cannot. Focus changes
 * reset it: the parent (`ThreePaneWorkspace`) keys this component on the focused
 * question's uid, so a focus change REMOUNTS it and the local value returns to
 * undefined. Interactive in BOTH draft and published states (it can't mutate
 * anything, G4). Always renders regardless of show-if (you focused it to author
 * it — show-if is validated in Test Mode, not here).
 *
 * The widget uses a DISTINCT `idPrefix` ("canvas-q-") so it never collides on
 * DOM ids with the inspector's simultaneous FindingsPreview widget (which keeps
 * the default "q-"), co-validate C5.
 */

import { useState } from "react";
import { QuestionInput } from "@/components/assessments/question-input";
import type { QuestionDraftRow } from "./question-serialization";
import { toQuestionForInput } from "./question-widget-mapper";

type QuestionDraft = QuestionDraftRow;

const CANVAS_ID_PREFIX = "canvas-q-";

export interface QuestionCanvasProps {
  /** The focused question, or null when nothing is focused. */
  question: QuestionDraft | null;
  /** Display name of the focused question's section (heading), if resolvable. */
  sectionName: string | null;
}

export function QuestionCanvas({ question, sectionName }: QuestionCanvasProps) {
  // Local, throwaway preview answer — never touches the model (INVARIANT).
  const [previewValue, setPreviewValue] = useState<
    number | string | string[] | undefined
  >(undefined);

  if (!question) {
    return (
      <section
        className="wf-card space-y-3"
        style={{ padding: "1rem" }}
        data-testid="question-canvas-empty"
      >
        <p className="text-xs italic text-muted-foreground py-2">
          Select a question to preview it.
        </p>
      </section>
    );
  }

  const forInput = toQuestionForInput(question, {
    labelFallback: "(untitled question)",
    keyFallback: "__canvas__",
  });

  return (
    <section
      className="wf-card space-y-3"
      style={{ padding: "1rem" }}
      data-testid="question-canvas"
    >
      {sectionName ? (
        <p
          className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground"
          data-testid="question-canvas-section"
        >
          {sectionName}
        </p>
      ) : null}
      <div className="survey-question">
        <label
          className="survey-question-label block font-medium text-foreground"
          htmlFor={`${CANVAS_ID_PREFIX}${forInput.stableKey}`}
        >
          {question.label || (
            <span className="italic text-muted-foreground">
              (no label yet)
            </span>
          )}
          {question.isRequired ? (
            <span className="text-destructive" aria-hidden="true">
              {" "}
              *
            </span>
          ) : null}
        </label>
        {question.helpText ? (
          <p className="survey-question-help text-sm text-muted-foreground">
            {question.helpText}
          </p>
        ) : null}
        <QuestionInput
          question={forInput}
          value={previewValue}
          onChange={(_key, v) => setPreviewValue(v)}
          idPrefix={CANVAS_ID_PREFIX}
        />
      </div>
    </section>
  );
}
