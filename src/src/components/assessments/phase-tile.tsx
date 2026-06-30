// src/src/components/assessments/phase-tile.tsx
"use client";
import React from "react";
import type { GrowthPhase } from "@/lib/assessments/su-full-phase";

/**
 * Wave J-1 — SU-Full growth-phase mid-survey interstitial tile.
 *
 * Faithful to Esperto: right after the CEO completes the S_BACKGROUND FTE
 * questions, the survey shows "You've reached phase N - <Name> phase" plus the
 * verbatim phase narrative, with a single Continue button that proceeds to the
 * next section.
 *
 * Pure / presentational — no data fetching. The caller computes the phase
 * (via `computeGrowthPhase`) and supplies it; this component only renders.
 *
 * Scope: every class lives under `.su-assessment-brand` (ADR-0004/0005) so
 * there is zero leak to the blue admin/coach UI. The component supplies its own
 * scope wrapper so it can be rendered anywhere inside the participant lane.
 */
export interface PhaseTileProps {
  phase: GrowthPhase;
  onContinue: () => void;
}

export function PhaseTile({ phase, onContinue }: PhaseTileProps) {
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  // Move focus to the heading when the tile mounts so keyboard/screen-reader
  // users land on the interstitial content (mirrors the section-pager heading
  // focus on advance).
  React.useEffect(() => {
    requestAnimationFrame(() => headingRef.current?.focus());
  }, []);

  return (
    <div className="su-assessment-brand survey-section">
      <section className="su-phase-tile" aria-labelledby="su-phase-heading">
        <span className="su-phase-eyebrow">Your growth phase</span>
        <h2
          ref={headingRef}
          tabIndex={-1}
          id="su-phase-heading"
          className="su-phase-heading"
        >
          {phase.heading}
        </h2>
        <p className="su-phase-narrative">{phase.narrative}</p>
        <div className="survey-nav su-phase-nav">
          <button
            type="button"
            className="wf-btn wf-btn-primary"
            onClick={onContinue}
          >
            Continue →
          </button>
        </div>
      </section>
    </div>
  );
}
