/**
 * Jeff July-10 #63/#67/#73/#78/#81 — report chrome: Scaling Up mark BEFORE the
 * coach byline, on BOTH the cover masthead and the page footer.
 *
 * The coach block is a SUBORDINATE PROVENANCE BYLINE, not a co-brand peer (see
 * the superseded-G7 note in docs/specs/v7.6/13-assessment-brand-and-results-report.md).
 * On the cover that is expressed in CSS (the brandbar stacks, SU mark on top).
 * In the footer it must be expressed in the DOM, because the footer's layout is
 * order-sensitive in BOTH directions:
 *
 *   - desktop (>720px): `justify-content: space-between` — first child sits far LEFT
 *   - narrow  (<=720px): `flex-direction: column`        — first child sits ON TOP
 *
 * The narrow case is NOT only a phone concern: A4 print at 14mm margins is ~688
 * CSS px, i.e. BELOW the 720px breakpoint, so the printed/saved PDF — the artifact
 * clients actually keep — takes the column path too. Before this change every
 * printed report rendered the coach ABOVE the Scaling Up mark, the exact inverse
 * of the requested layout.
 *
 * `order: -1` would fix both widths visually while leaving the DOM lying, so
 * screen-reader/tab order would stay wrong and this test could not exist. Hence
 * a real DOM reorder, asserted here via compareDocumentPosition.
 *
 * The COVER masthead is guarded here too. Its DOM order was already correct, so
 * these cover assertions are regression guards rather than a driven change —
 * but they became load-bearing with this item: now that the cover brandbar is
 * `flex-direction: column`, DOM order IS the visual top-to-bottom order, so
 * swapping the JSX would silently put the coach ABOVE the Scaling Up mark
 * exactly as the pre-change footer did.
 *
 * KNOWN LIMIT, accepted deliberately: `next/jest` stubs CSS, so no test here
 * can observe `flex-direction` itself. If the `.su-report-cover .su-brandbar`
 * rule in su-report.css were deleted, these tests would still pass and the
 * cover would silently revert to a horizontal row. That rule is covered by
 * screenshot/PDF review at merge, not by unit tests (a CSS-source string guard
 * was considered and rejected: it pins implementation text without proving
 * behaviour).
 *
 * Order-assertion precedent: __tests__/lib/assessments/invitation-email.test.ts.
 */

import { render, screen } from "@testing-library/react";
import { BrandedReport } from "@/components/assessments/BrandedReport";
import { QualitativeReport } from "@/components/assessments/QualitativeReport";
import { GroupReport } from "@/components/assessments/GroupReport";
import type { RespondentReport } from "@/lib/assessments/respondent-report";
import type { ScoreResult } from "@/lib/assessments/scoring";
import type { CampaignGroupReport } from "@/lib/assessments/group-report-model";
import type { GroupReportProvenance } from "@/components/assessments/GroupReport";

const COACH = {
  coachLogoUrl: "https://cdn.example.com/coach.png",
  coachName: "Dana Coach",
};

/**
 * Asserts the Scaling Up mark precedes the coach block in DOCUMENT ORDER.
 * DOCUMENT_POSITION_FOLLOWING (4) === "the argument follows the reference node".
 */
function expectSuLogoBeforeCoach(scope: HTMLElement) {
  const suLogo = scope.querySelector("img.su-logo");
  const coach = scope.querySelector(".su-report-coach");
  expect(suLogo).not.toBeNull();
  expect(coach).not.toBeNull();
  const rel = suLogo!.compareDocumentPosition(coach!);
  expect(rel & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

// ── Fixtures ────────────────────────────────────────────────────────────────

function scoredReport(overrides: Partial<RespondentReport> = {}): RespondentReport {
  const result: ScoreResult = {
    perQuestion: [{ stableKey: "q1", value: 3, achieved: true }],
    perSection: [
      {
        stableKey: "s1",
        name: "The executive team is healthy",
        totalPoints: 6,
        averagePoints: 2,
        achievedCount: 1,
        totalCount: 1,
      },
    ],
    overallTotal: 6,
    overallAverage: 2,
    countAchieved: 1,
    tier: { label: "Strong", message: "Aligned." },
    tierMetricValue: 2,
    unansweredKeys: [],
  };
  return {
    respondentName: "Sarah Chen",
    jobTitle: "Chief Executive Officer",
    companyName: "Northwind Logistics",
    assessmentName: "Rockefeller Habits Checklist",
    templateAlias: "RockHabits",
    campaignLabel: null,
    submittedAt: new Date("2026-05-01T12:00:00Z"),
    result,
    sections: [
      { stableKey: "s1", name: "The executive team is healthy", questions: [{ stableKey: "q1" }] },
    ],
    questionByKey: { q1: "Members understand each other's styles" },
    questionsByKey: {
      q1: {
        type: "SLIDER_LIKERT",
        label: "Members understand each other's styles",
        sectionStableKey: "s1",
        min: 0,
        max: 3,
      },
    },
    rawAnswers: [{ stableKey: "q1", value: 3 }],
    scoringConfig: {
      tierMetric: "countAchieved",
      passThreshold: 1,
      tiers: [{ minMetric: 0, label: "Strong", message: "Aligned." }],
    },
    provenance: {
      submissionId: "sub-123",
      versionId: "ver-456",
      contentHash: "abcdef0123456789",
      templateName: "Rockefeller Habits Checklist",
    },
    degraded: false,
    ...COACH,
    ...overrides,
  } as RespondentReport;
}

function qualitativeRespondentReport(): RespondentReport {
  return scoredReport({
    assessmentName: "Leadership Vision Alignment",
    templateAlias: "leadership-vision-alignment",
    result: {} as ScoreResult,
    sections: [],
    questionByKey: {},
    questionsByKey: {},
    rawAnswers: [],
    scoringConfig: {},
  });
}

const RESPONDENTS = [
  { respondentId: "r-ceo", name: "John CEOExec", jobTitle: "CEO", isCEO: true, isOrphan: false },
  { respondentId: "r-hr", name: "Kathy HR", jobTitle: "HR", isCEO: false, isOrphan: false },
];

function scoredGroupReport(): CampaignGroupReport {
  return {
    reportType: "scored",
    provenance: { groupRenderVersion: "lva-fidelity-v1", scaleDegraded: false },
    respondents: RESPONDENTS,
    respondentCount: 2,
    degraded: false,
    questionsByKey: {},
    answersByRespondent: new Map(),
    scored: {
      sections: [
        { stableKey: "people", name: "People", ceo: 3.1, teamAvg: 5.3, dev: -2.2, n: 2 },
      ],
      questions: [
        { stableKey: "q_values", label: "We have a written core-values list", ceo: 4, teamMean: 5.3, n: 2 },
      ],
      tier: { ceo: "On Track", teamDistribution: [{ label: "On Track", count: 2 }] },
    },
  } as unknown as CampaignGroupReport;
}

function provenance(overrides: Partial<GroupReportProvenance> = {}): GroupReportProvenance {
  return {
    assessmentName: "Rockefeller Habits Checklist",
    companyName: "Northwind Logistics",
    generatedAt: new Date("2026-05-01T12:00:00Z"),
    completedCount: 2,
    invitedCount: 3,
    versionLabel: "rock-v3",
    ceoName: "John CEOExec",
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("report footer — SU mark precedes the coach byline (#63/#67/#73/#78/#81)", () => {
  it("BrandedReport (scored) puts the SU logo before the coach block", () => {
    render(<BrandedReport report={scoredReport()} />);
    expectSuLogoBeforeCoach(screen.getByTestId("report-footer"));
  });

  it("QualitativeReport puts the SU logo before the coach block", () => {
    render(<QualitativeReport report={qualitativeRespondentReport()} />);
    expectSuLogoBeforeCoach(screen.getByTestId("report-footer"));
  });

  it("GroupReport puts the SU logo before the coach block", () => {
    render(<GroupReport report={scoredGroupReport()} {...provenance()} {...COACH} />);
    expectSuLogoBeforeCoach(screen.getByTestId("group-report-footer"));
  });

  it("keeps the SU logo first even when the coach has a name but no logo image", () => {
    render(
      <BrandedReport report={scoredReport({ coachLogoUrl: null, coachName: "Dana Coach" })} />,
    );
    const footer = screen.getByTestId("report-footer");
    expect(footer.querySelector("[data-testid='coach-logo']")).toBeNull();
    expectSuLogoBeforeCoach(footer);
  });

  it("still renders the SU logo when there is no coach at all", () => {
    render(<BrandedReport report={scoredReport({ coachLogoUrl: null, coachName: null })} />);
    const footer = screen.getByTestId("report-footer");
    expect(footer.querySelector("img.su-logo")).not.toBeNull();
    expect(footer.querySelector(".su-report-coach")).toBeNull();
  });
});

describe("report cover masthead — SU mark precedes the coach byline", () => {
  // The cover brandbar is `flex-direction: column`, so DOM order is the visual
  // top-to-bottom order: these guard the literal ask ("coach photo BELOW the
  // Scaling Up logo") against a JSX reorder. They do NOT prove the CSS rule is
  // present — see the KNOWN LIMIT note at the top of this file.

  it("BrandedReport (scored) emits the SU logo before the coach byline", () => {
    render(<BrandedReport report={scoredReport()} />);
    expectSuLogoBeforeCoach(screen.getByTestId("report-cover"));
  });

  it("QualitativeReport emits the SU logo before the coach byline", () => {
    render(<QualitativeReport report={qualitativeRespondentReport()} />);
    expectSuLogoBeforeCoach(screen.getByTestId("report-cover"));
  });

  it("GroupReport emits the SU logo before the coach byline", () => {
    render(<GroupReport report={scoredGroupReport()} {...provenance()} {...COACH} />);
    expectSuLogoBeforeCoach(screen.getByTestId("group-report-cover"));
  });

  it("renders the coach NAME beside the image on the cover (#63b/#67a/#73a/#81a)", () => {
    render(<BrandedReport report={scoredReport()} />);
    const cover = screen.getByTestId("report-cover");
    const wrapper = cover.querySelector(".su-report-coach");
    // Name and image share one inline-flex wrapper = "name next to the photo".
    expect(wrapper?.querySelector("[data-testid='coach-logo']")).not.toBeNull();
    expect(wrapper?.querySelector("[data-testid='coach-name']")?.textContent).toBe(
      "Coached by Dana Coach",
    );
  });
});
