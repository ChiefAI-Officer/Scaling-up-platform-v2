"use client";

/**
 * Assessment participant — shared WELCOME ("Screen 1") building blocks.
 *
 * The approved participant intro redesign has two distinct screens:
 *   1. a de-bared WELCOME / invitation (this module), and
 *   2. a DISTINCT section intro (rendered by SectionPager).
 *
 * Both the PUBLIC quiz (PublicQuizClient) and the INVITED survey
 * (OrgSurveyClient) render the same value-prop "what to expect" list + stat
 * chips, but with FLOW-SPECIFIC copy (public lead-magnet vs invited team
 * framing). The complete question bank derives the truthful expectation and
 * optional scale; each flow owns its specific supporting copy.
 *
 * Scope (ADR-0005): every class lives under `.su-welcome-*`, styled ONLY inside
 * the `.su-assessment-brand` scope (the participant lane wrapper). No global
 * selectors, no design-token changes, zero leak to the admin/coach `.wf-scope`
 * UI.
 */

import React from "react";

/** Branded app-shell header — white Scaling Up logo on the purple bar. */
export function WelcomeShellHeader({ caption }: { caption?: string }) {
  return (
    <header className="su-welcome-shell" role="banner">
      <img
        className="su-welcome-logo"
        src="/brand/su-logo-white.svg"
        alt="Scaling Up"
      />
      {caption ? <span className="su-welcome-shell-caption">{caption}</span> : null}
    </header>
  );
}

export interface WelcomeExpectationsProps {
  /** e.g. "About 10 minutes" — derived from the question count. */
  timeLabel: string;
  /** Complete-bank expectation copy (NOT hardcoded). */
  expectationText: string;
  /** Flow-specific label that states how answers or results are shared. */
  sharingLabel: string;
  /** Flow-specific recipient disclosure. */
  sharingSub: string;
  /** Flow-specific sub for the "category scores" row. */
  scoresSub: string;
  /** Flow-specific title for the category-scores row. */
  scoresLabel?: string;
}

/**
 * The "what to expect" value-prop list (3 rows: icon + bold label + muted sub).
 * Time + complete-bank expectation text are derived from real data; the
 * sharing label/sub and scores sub differ per flow (public vs invited).
 */
export function WelcomeExpectations({
  timeLabel,
  expectationText,
  sharingLabel,
  sharingSub,
  scoresSub,
  scoresLabel = "Your category scores",
}: WelcomeExpectationsProps) {
  return (
    <ul className="su-welcome-expect" data-testid="welcome-expectations">
      <li className="su-welcome-expect-item">
        <span className="su-welcome-expect-ic" aria-hidden="true">
          {"⏱"}
        </span>
        <span className="su-welcome-expect-text">
          <b>{timeLabel}</b>
          <span>{expectationText}</span>
        </span>
      </li>
      <li className="su-welcome-expect-item">
        <span className="su-welcome-expect-ic" aria-hidden="true">
          {"👥"}
        </span>
        <span className="su-welcome-expect-text">
          <b>{sharingLabel}</b>
          <span>{sharingSub}</span>
        </span>
      </li>
      <li className="su-welcome-expect-item">
        <span className="su-welcome-expect-ic" aria-hidden="true">
          {"📊"}
        </span>
        <span className="su-welcome-expect-text">
          <b>{scoresLabel}</b>
          <span>{scoresSub}</span>
        </span>
      </li>
    </ul>
  );
}

/** Stat chips for questions and sections, plus an optional complete-bank scale. */
export function WelcomeStats({
  questionCount,
  sectionCount,
  scaleLabel,
}: {
  questionCount: number;
  sectionCount: number;
  scaleLabel: string | null;
}): React.ReactElement {
  return (
    <div className="su-welcome-meta" aria-label="Assessment details" data-testid="welcome-stats">
      <div className="su-welcome-chip">
        <b>{questionCount}</b>
        <span>{questionCount === 1 ? "question" : "questions"}</span>
      </div>
      <div className="su-welcome-chip">
        <b>{sectionCount}</b>
        <span>{sectionCount === 1 ? "section" : "sections"}</span>
      </div>
      {scaleLabel ? (
        <div className="su-welcome-chip">
          <b>{scaleLabel}</b>
          <span>scale</span>
        </div>
      ) : null}
    </div>
  );
}

export interface WelcomeQuestion {
  type: string;
  scale?: { min: number; max: number };
}

export interface WelcomePresentation {
  expectationText: string;
  scaleLabel: string | null;
}

const SUPPORTED_QUESTION_TYPES = new Set([
  "SLIDER_LIKERT",
  "TEXT",
  "NUMBER",
  "MULTI_CHOICE",
]);

function questionCountLabel(questionCount: number): string {
  return `${questionCount} ${questionCount === 1 ? "question" : "questions"}`;
}

export function deriveWelcomePresentation(
  questions: WelcomeQuestion[],
): WelcomePresentation {
  const countLabel = questionCountLabel(questions.length);
  const neutral = {
    expectationText: `${countLabel}.`,
    scaleLabel: null,
  };

  if (
    questions.length === 0 ||
    questions.some((question) => !SUPPORTED_QUESTION_TYPES.has(question.type))
  ) {
    return neutral;
  }

  const responseTypes = new Set(questions.map((question) => question.type));
  if (responseTypes.size > 1) {
    return {
      expectationText: `${countLabel} using a mix of response formats.`,
      scaleLabel: null,
    };
  }

  if (!responseTypes.has("SLIDER_LIKERT")) {
    return neutral;
  }

  const firstScale = questions[0].scale;
  const allScalesValid = questions.every(({ scale }) =>
    Boolean(
      scale &&
        Number.isFinite(scale.min) &&
        Number.isFinite(scale.max) &&
        scale.max > scale.min,
    ),
  );
  if (!firstScale || !allScalesValid) {
    return neutral;
  }

  const sameScale = questions.every(
    ({ scale }) =>
      scale?.min === firstScale.min && scale?.max === firstScale.max,
  );

  if (!sameScale) {
    return {
      expectationText: `${countLabel} using a mix of response formats.`,
      scaleLabel: null,
    };
  }

  const scaleLabel = `${firstScale.min}–${firstScale.max}`;
  return {
    expectationText:
      `${questions.length} short ` +
      `${questions.length === 1 ? "statement" : "statements"}, rated ${scaleLabel}.`,
    scaleLabel,
  };
}

/**
 * Derive an honest time estimate from the question count (~10 questions/min,
 * rounded to a friendly band). Always "About N minutes".
 */
export function deriveTimeEstimate(questionCount: number): string {
  if (questionCount <= 0) return "A few minutes";
  // Bucket to friendly numbers: small banks stay ~5, larger ones scale.
  if (questionCount <= 15) return "About 5 minutes";
  if (questionCount <= 30) return "About 10 minutes";
  if (questionCount <= 50) return "About 15 minutes";
  return `About ${Math.round(questionCount / 10) * 5} minutes`;
}
