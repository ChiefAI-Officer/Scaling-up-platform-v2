import React from "react";
import { render, screen, within } from "@testing-library/react";
import {
  deriveWelcomePresentation,
  WelcomeExpectations,
  WelcomeStats,
  type WelcomeQuestion,
} from "@/components/assessments/assessment-welcome";
import { buildLvaContent } from "../../../prisma/seed-lva-assessment";
import { buildQspV1Content } from "../../../prisma/seed-qsp-v1-assessment";
import { buildQspV2Content } from "../../../prisma/seed-qsp-v2-assessment";
import { buildScalingUpFullContent } from "../../../prisma/seed-scaling-up-full-assessment";
import { buildRockefellerContent } from "../../../prisma/seed-rockefeller-assessment";
import { buildFiveDysfunctionsContent } from "../../../prisma/seed-five-dysfunctions";
import { buildQuickAssessmentContent } from "../../../prisma/seed-scaling-up-quick-assessment";

function asWelcomeQuestions(questions: unknown[]): WelcomeQuestion[] {
  return questions as WelcomeQuestion[];
}

describe("deriveWelcomePresentation", () => {
  it.each([
    ["LVA", buildLvaContent().questions, "67 questions using a mix of response formats."],
    ["QSP v1", buildQspV1Content().questions, "28 questions using a mix of response formats."],
    ["QSP v2", buildQspV2Content().questions, "22 questions using a mix of response formats."],
    [
      "Scaling Up Full",
      buildScalingUpFullContent().questions,
      "63 questions using a mix of response formats.",
    ],
  ])("suppresses the scale for mixed bank %s", (_name, questions, expectationText) => {
    expect(deriveWelcomePresentation(asWelcomeQuestions(questions))).toEqual({
      expectationText,
      scaleLabel: null,
    });
  });

  it.each([
    ["Rockefeller Habits", buildRockefellerContent().questions, "40 short statements, rated 0–3.", "0–3"],
    ["Five Dysfunctions", buildFiveDysfunctionsContent().questions, "38 short statements, rated 1–5.", "1–5"],
    ["Scaling Up Quick", buildQuickAssessmentContent().questions, "32 short statements, rated 0–10.", "0–10"],
  ])(
    "preserves the scale for uniform bank %s",
    (_name, questions, expectationText, scaleLabel) => {
      expect(deriveWelcomePresentation(asWelcomeQuestions(questions))).toEqual({
        expectationText,
        scaleLabel,
      });
    },
  );

  it("suppresses differing slider ranges", () => {
    expect(
      deriveWelcomePresentation([
        { type: "SLIDER_LIKERT", scale: { min: 0, max: 3 } },
        { type: "SLIDER_LIKERT", scale: { min: 1, max: 5 } },
      ]),
    ).toEqual({
      expectationText: "2 questions using a mix of response formats.",
      scaleLabel: null,
    });
  });

  it.each([
    ["empty bank", [], "0 questions."],
    ["homogeneous text bank", [{ type: "TEXT" }], "1 question."],
    ["unknown type", [{ type: "RANKING" }], "1 question."],
    [
      "invalid scale",
      [{ type: "SLIDER_LIKERT", scale: { min: 5, max: 1 } }],
      "1 question.",
    ],
    [
      "non-finite scale",
      [{ type: "SLIDER_LIKERT", scale: { min: 0, max: Number.NaN } }],
      "1 question.",
    ],
    [
      "later invalid scale",
      [
        { type: "SLIDER_LIKERT", scale: { min: 0, max: 3 } },
        { type: "SLIDER_LIKERT", scale: { min: 3, max: 3 } },
      ],
      "2 questions.",
    ],
  ])("uses neutral copy for %s", (_name, questions, expectationText) => {
    expect(deriveWelcomePresentation(questions as WelcomeQuestion[])).toEqual({
      expectationText,
      scaleLabel: null,
    });
  });
});

describe("Welcome presentation rendering", () => {
  it("renders mixed copy and only question/section chips without a scale", () => {
    render(
      <>
        <WelcomeExpectations
          timeLabel="About 35 minutes"
          expectationText="67 questions using a mix of response formats."
          sharingLabel="How your answers are shared"
          sharingSub="Authorized people can review your answers."
          scoresSub="Scores detail."
        />
        <WelcomeStats questionCount={67} sectionCount={8} scaleLabel={null} />
      </>,
    );

    expect(
      within(screen.getByTestId("welcome-expectations")).getByText(
        "67 questions using a mix of response formats.",
      ),
    ).toBeInTheDocument();
    const expectations = screen.getByTestId("welcome-expectations");
    expect(
      within(expectations).getByText("How your answers are shared"),
    ).toBeInTheDocument();
    expect(
      within(expectations).getByText(
        "Authorized people can review your answers.",
      ),
    ).toBeInTheDocument();
    expect(within(expectations).getByText("👥")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(
      within(expectations).queryByText(/honest & confidential/i),
    ).not.toBeInTheDocument();
    const stats = screen.getByTestId("welcome-stats");
    expect(stats.querySelectorAll(".su-welcome-chip")).toHaveLength(2);
    expect(within(stats).queryByText("scale")).not.toBeInTheDocument();
  });

  it("preserves uniform copy and the scale chip", () => {
    render(
      <>
        <WelcomeExpectations
          timeLabel="About 15 minutes"
          expectationText="40 short statements, rated 0–3."
          sharingLabel="How your results are shared"
          sharingSub="Authorized people can review your report."
          scoresSub="Scores detail."
        />
        <WelcomeStats questionCount={40} sectionCount={10} scaleLabel="0–3" />
      </>,
    );

    expect(
      within(screen.getByTestId("welcome-expectations")).getByText(
        "40 short statements, rated 0–3.",
      ),
    ).toBeInTheDocument();
    const stats = screen.getByTestId("welcome-stats");
    expect(stats.querySelectorAll(".su-welcome-chip")).toHaveLength(3);
    expect(within(stats).getByText("0–3")).toBeInTheDocument();
  });
});
