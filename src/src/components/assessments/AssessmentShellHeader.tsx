// src/src/components/assessments/AssessmentShellHeader.tsx
"use client";
import React from "react";

/**
 * Branded participant "app shell" header for the assessment flows.
 *
 * Presentational only — it renders whatever section position it is given. It is
 * mounted INSIDE {@link SectionPager}, which feeds it the pager's OWN current
 * section index + total, so the progress strip can never drift from the
 * questions on screen (single source of section state — claudex r1 #8).
 *
 * Look: purple appbar (matches the approved /tmp/su-assessment-mockups/quiz.html)
 * with the white Scaling Up logo, a "Assessment · Company" caption, and a
 * Four-Decisions segmented progress strip (one segment per section, the first
 * `currentSection` lit using the four-decisions colours cycling).
 *
 * Scope: every class lives under `.su-assessment-brand` (the pager root already
 * provides that scope) so there is zero leak to the blue admin/coach UI.
 */
export interface AssessmentShellHeaderProps {
  /** 1-based index of the section currently on screen. */
  currentSection: number;
  /** Total number of sections (one progress segment each). */
  totalSections: number;
  /** Assessment / campaign / template name (left caption). Optional. */
  assessmentName?: string;
  /** Company / organization name (right caption). Rendered only when provided. */
  companyName?: string;
}

// Four Decisions accent colours, cycled across the active progress segments.
const FOUR_DECISIONS = ["#f7a600", "#008bd2", "#946b36", "#95c11f"] as const;

export function AssessmentShellHeader({
  currentSection,
  totalSections,
  assessmentName,
  companyName,
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

      {/* Presentational segmented strip. The pager already renders the
          authoritative role="progressbar" (answered/total questions); a second
          one here would create an ambiguous accessibility tree, so this strip is
          aria-hidden and the "Section N of M" text carries the meaning. */}
      <div className="su-shell-seg" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => {
          const on = i < active;
          return (
            <i
              key={i}
              className={`su-shell-seg-item${on ? " is-active" : ""}`}
              style={on ? { background: FOUR_DECISIONS[i % FOUR_DECISIONS.length] } : undefined}
            />
          );
        })}
      </div>
    </header>
  );
}
