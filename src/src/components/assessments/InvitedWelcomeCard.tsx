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
  type InvitedWelcomeConfigV1,
} from "@/lib/assessments/invited-welcome-config";

const NAMED_ANSWER_DISCLOSURE =
  "Your coach or facilitator and authorized Scaling Up staff can review your named individual answers.";

export function InvitedWelcomeCard({
  config,
  campaignName,
  questions,
  sections,
  onStart,
  headingId = "invite-title",
  preview = false,
}: {
  config: InvitedWelcomeConfigV1;
  campaignName: string;
  questions: WelcomeQuestion[];
  sections: unknown[];
  onStart: () => void;
  headingId?: string;
  preview?: boolean;
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
        sharingSub={NAMED_ANSWER_DISCLOSURE}
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
