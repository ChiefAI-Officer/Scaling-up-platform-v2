"use client";

import React from "react";
import {
  WelcomeExpectations,
  WelcomeStats,
  deriveTimeEstimate,
  deriveWelcomePresentation,
  type WelcomeQuestion,
} from "./assessment-welcome";
import {
  interpolateWelcomeHeading,
  type InvitedWelcomeConfig,
} from "@/lib/assessments/invited-welcome-config";

export function AssessmentWelcomeCard({
  config,
  campaignName,
  questions,
  sections,
  onStart,
  headingId = "invite-title",
  preview = false,
  startButtonTestId,
}: {
  config: InvitedWelcomeConfig;
  campaignName: string;
  questions: WelcomeQuestion[];
  sections: unknown[];
  onStart: () => void;
  headingId?: string;
  preview?: boolean;
  startButtonTestId?: string;
}) {
  const presentation = deriveWelcomePresentation(questions);

  return (
    <section className="su-welcome-card" aria-labelledby={headingId}>
      <span className="su-welcome-eyebrow">{config.eyebrow}</span>
      <h1 className="su-welcome-title" id={headingId}>
        {interpolateWelcomeHeading(config.headingTemplate, campaignName)}
      </h1>
      {config.ledeParagraphs.map((paragraph, index) => (
        <p className="su-welcome-lede" key={index}>
          {paragraph}
        </p>
      ))}
      <WelcomeExpectations
        timeLabel={deriveTimeEstimate(questions.length)}
        expectationText={presentation.expectationText}
        sharingLabel={config.sharingHeading}
        sharingSub={config.sharingDescription}
        scoresLabel={config.scoresHeading}
        scoresSub={config.scoresDescription}
      />
      <WelcomeStats
        questionCount={questions.length}
        sectionCount={sections.length}
        scaleLabel={presentation.scaleLabel}
      />
      <div className="su-welcome-cta-row">
        <button
          type="button"
          onClick={onStart}
          className="su-welcome-cta"
          disabled={preview}
          aria-disabled={preview || undefined}
          data-testid={startButtonTestId}
        >
          {config.ctaLabel} →
        </button>
      </div>
      {config.finePrint ? (
        <p className="su-welcome-fine">{config.finePrint}</p>
      ) : null}
    </section>
  );
}
