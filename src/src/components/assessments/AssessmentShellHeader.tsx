// src/src/components/assessments/AssessmentShellHeader.tsx
"use client";
import React from "react";

/**
 * Branded participant "app shell" header for the assessment flows.
 *
 * Presentational only — it renders whatever section position it is given. It is
 * mounted INSIDE {@link SectionPager}, which feeds it the pager's OWN current
 * section index + total, so the progress bar can never drift from the
 * questions on screen (single source of section state — claudex r1 #8).
 *
 * Look: purple appbar (matches the approved /tmp/su-assessment-mockups/quiz.html)
 * with the white Scaling Up logo, a "Assessment · Company" caption, "Section N
 * of M" text, and the authoritative linear progressbar (answered/total questions).
 *
 * Scope: every class lives under `.su-assessment-brand` (the pager root already
 * provides that scope) so there is zero leak to the blue admin/coach UI.
 */
export interface AssessmentShellHeaderProps {
  /** 1-based index of the section currently on screen. */
  currentSection: number;
  /** Total number of sections. */
  totalSections: number;
  /** Assessment / campaign / template name (left caption). Optional. */
  assessmentName?: string;
  /** Company / organization name (right caption). Rendered only when provided. */
  companyName?: string;
  /** Number of questions answered so far (drives the progressbar). */
  answeredCount: number;
  /** Total number of questions across all sections (progressbar max). */
  totalQuestions: number;
}

export function AssessmentShellHeader({
  currentSection,
  totalSections,
  assessmentName,
  companyName,
  answeredCount,
  totalQuestions,
}: AssessmentShellHeaderProps) {
  const total = Math.max(0, Math.floor(totalSections));
  const active = Math.min(Math.max(0, Math.floor(currentSection)), total);

  return (
    <header className="su-shell-header" role="banner">
      <img className="su-shell-logo" src="/brand/su-logo-white.svg" alt="Scaling Up" />

      {assessmentName ? (
        <span className="su-shell-where" aria-live="polite">
          <span className="su-shell-assessment">{assessmentName}</span>
          {companyName ? (
            <>
              <span className="su-shell-where-sep" aria-hidden="true"> · </span>
              <b className="su-shell-company">{companyName}</b>
            </>
          ) : null}
          <span className="su-shell-section"> — Section {active} of {total}</span>
        </span>
      ) : (
        <span className="su-shell-where" aria-live="polite">
          <span className="su-shell-section">Section {active} of {total}</span>
        </span>
      )}

      <div
        role="progressbar"
        aria-label="Progress"
        aria-valuemin={0}
        aria-valuemax={totalQuestions}
        aria-valuenow={answeredCount}
        className="survey-progress su-shell-progress"
      >
        <div className="survey-progress-fill" style={{ width: totalQuestions ? `${(answeredCount / totalQuestions) * 100}%` : "0%" }} />
      </div>
    </header>
  );
}
