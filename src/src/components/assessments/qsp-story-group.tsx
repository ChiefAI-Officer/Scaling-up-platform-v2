"use client";

import React from "react";
import { QuestionInput } from "@/components/assessments/question-input";
import {
  initialVisibleStoryCount,
  type AssessmentAnswers,
  type QspStoryQuestions,
} from "@/lib/assessments/qsp-story-group";

interface QspStoryGroupProps {
  questions: QspStoryQuestions;
  prompt: string;
  answers: AssessmentAnswers;
  onAnswerChange: (
    stableKey: string,
    value: number | string | string[],
  ) => void;
  disabled?: boolean;
}

export function QspStoryGroup({
  questions,
  prompt,
  answers,
  onAnswerChange,
  disabled = false,
}: QspStoryGroupProps) {
  const [announcement, setAnnouncement] = React.useState("");
  const promptId = React.useId();
  const restoredCount = initialVisibleStoryCount(questions, answers);
  const [visibleCount, setVisibleCount] = React.useState(restoredCount);

  React.useEffect(() => {
    // Draft hydration may arrive after mount. Visibility grows monotonically
    // for this mount, so clearing a restored field never collapses the UI.
    setVisibleCount((current) =>
      current >= restoredCount ? current : restoredCount,
    );
  }, [restoredCount]);

  function revealNext() {
    if (disabled || visibleCount >= questions.length) return;
    const nextCount = visibleCount + 1;
    const nextQuestion = questions[nextCount - 1];
    setVisibleCount(nextCount);
    setAnnouncement(`Person and story ${nextCount} of 3 added.`);
    requestAnimationFrame(() => {
      document.getElementById(`q-${nextQuestion.stableKey}`)?.focus();
    });
  }

  return (
    <div
      className="qsp-story-group"
      role="group"
      aria-labelledby={promptId}
      data-testid="qsp-story-group"
    >
      <div className="qsp-story-prompt-row">
        <span className="qsp-story-prompt-mark" aria-hidden="true">Q</span>
        <div>
          <div id={promptId} className="qsp-story-prompt">{prompt}</div>
          <p className="qsp-story-help">
            Share up to three people and the examples that stood out.
          </p>
        </div>
      </div>

      <div className="qsp-story-entries">
        {questions.slice(0, visibleCount).map((question, index) => (
          <div className="qsp-story-entry" key={question.stableKey}>
            <label
              className="qsp-story-entry-label"
              htmlFor={`q-${question.stableKey}`}
            >
              <span>Person and story</span>
              <span className="qsp-story-count">{index + 1} of 3</span>
            </label>
            <QuestionInput
              question={question}
              value={answers[question.stableKey]}
              onChange={onAnswerChange}
              disabled={disabled}
            />
          </div>
        ))}
      </div>

      {visibleCount < questions.length ? (
        <button
          type="button"
          className="qsp-story-add"
          onClick={revealNext}
          disabled={disabled}
        >
          + Add another person
        </button>
      ) : null}

      <p className="sr-only" aria-live="polite">{announcement}</p>
    </div>
  );
}
