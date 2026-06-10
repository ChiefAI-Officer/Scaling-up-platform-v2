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
 * framing). These presentational pieces take the copy as props so the wording
 * stays owned by each flow.
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
  /** Actual number of questions (NOT hardcoded). */
  questionCount: number;
  /** e.g. "1–5" — derived from the slider scale. */
  scaleLabel: string;
  /** Flow-specific sub for the "honest & confidential" row. */
  confidentialSub: string;
  /** Flow-specific sub for the "category scores" row. */
  scoresSub: string;
}

/**
 * The "what to expect" value-prop list (3 rows: icon + bold label + muted sub).
 * Time + question count + scale are derived from real data; the confidential /
 * scores subs differ per flow (public vs invited).
 */
export function WelcomeExpectations({
  timeLabel,
  questionCount,
  scaleLabel,
  confidentialSub,
  scoresSub,
}: WelcomeExpectationsProps) {
  return (
    <ul className="su-welcome-expect" data-testid="welcome-expectations">
      <li className="su-welcome-expect-item">
        <span className="su-welcome-expect-ic" aria-hidden="true">
          {"⏱"}
        </span>
        <span className="su-welcome-expect-text">
          <b>{timeLabel}</b>
          <span>
            {questionCount} short {questionCount === 1 ? "statement" : "statements"}, rated {scaleLabel}.
          </span>
        </span>
      </li>
      <li className="su-welcome-expect-item">
        <span className="su-welcome-expect-ic" aria-hidden="true">
          {"🔒"}
        </span>
        <span className="su-welcome-expect-text">
          <b>Honest &amp; confidential</b>
          <span>{confidentialSub}</span>
        </span>
      </li>
      <li className="su-welcome-expect-item">
        <span className="su-welcome-expect-ic" aria-hidden="true">
          {"📊"}
        </span>
        <span className="su-welcome-expect-text">
          <b>Your category scores</b>
          <span>{scoresSub}</span>
        </span>
      </li>
    </ul>
  );
}

/** The three stat chips (questions / sections / scale) — all from real data. */
export function WelcomeStats({
  questionCount,
  sectionCount,
  scaleLabel,
}: {
  questionCount: number;
  sectionCount: number;
  scaleLabel: string;
}) {
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
      <div className="su-welcome-chip">
        <b>{scaleLabel}</b>
        <span>scale</span>
      </div>
    </div>
  );
}

/**
 * Derive a human scale label ("1–5", "0–3") from the first SLIDER_LIKERT
 * question's scale. Falls back to "rating" when no slider scale is present
 * (e.g. an all-qualitative survey).
 */
export function deriveScaleLabel(
  questions: Array<{ type: string; scale?: { min: number; max: number } }>,
): string {
  const slider = questions.find(
    (q) => q.type === "SLIDER_LIKERT" && q.scale && typeof q.scale.min === "number" && typeof q.scale.max === "number",
  );
  if (slider?.scale) {
    return `${slider.scale.min}–${slider.scale.max}`;
  }
  return "rating";
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
