/**
 * Wave U (spec 19u U-5/D6) — report rendering of the frozen
 * `result.findings` snapshot.
 *
 * Scored (BrandedReport): NON-SLIDER snapshot entries merge into the
 * existing "What to work on next" block (slider entries IGNORED — sliders
 * keep rendering from the per-row `recommendation`); flag OFF or no
 * snapshot → byte-identical output.
 *
 * Qualitative (QualitativeReport): the consolidated findings section renders
 * ALL snapshot entries grouped by section, after the last section; flag OFF
 * or empty snapshot → the section is absent and output is byte-identical.
 */
import { render, screen, within } from "@testing-library/react";
import { BrandedReport } from "@/components/assessments/BrandedReport";
import { QualitativeReport } from "@/components/assessments/QualitativeReport";
import type { RespondentReport } from "@/lib/assessments/respondent-report";
import type { ScoreResult } from "@/lib/assessments/scoring";

// ── Fixtures ────────────────────────────────────────────────────────────────

function baseReport(overrides: Partial<RespondentReport> = {}): RespondentReport {
  return {
    respondentName: "John CEOExec",
    respondentEmail: "john@example.com",
    jobTitle: "CEO",
    companyName: "Northwind Logistics",
    assessmentName: "Walk Instrument",
    templateAlias: "some-scored-template",
    campaignLabel: null,
    submittedAt: new Date("2026-07-05T10:00:00Z"),
    result: {} as ScoreResult,
    sections: [],
    questionByKey: {},
    questionsByKey: {},
    rawAnswers: [],
    scoringConfig: {},
    provenance: {
      submissionId: "sub-1",
      versionId: "ver-1",
      contentHash: "abc123",
      templateName: "Walk Instrument",
    },
    degraded: false,
    ...overrides,
    reportStyle: overrides.reportStyle ?? "CLASSIC",
  };
}

const FINDINGS = [
  {
    stableKey: "Q_SLIDER",
    questionType: "SLIDER_LIKERT",
    sectionStableKey: "S1",
    questionLabel: "Slider",
    text: "SLIDER SNAPSHOT ENTRY — must NOT double-render on scored",
  },
  {
    stableKey: "Q_NUMBER",
    questionType: "NUMBER",
    sectionStableKey: "S1",
    questionLabel: "Headcount",
    text: "NUMBER finding text",
  },
  {
    stableKey: "Q_MULTI",
    questionType: "MULTI_CHOICE",
    sectionStableKey: "S9_ghost",
    questionLabel: "Obstacles",
    text: "MC orphan finding text",
  },
];

/** Scored report fixture: one section, one slider with a per-row rec. */
function scoredReport(withFindings: boolean): RespondentReport {
  const result = {
    perQuestion: [
      {
        stableKey: "Q_SLIDER",
        label: "Slider",
        value: 7,
        achieved: true,
        recommendation: "LEGACY ROW RECOMMENDATION",
      },
    ],
    perSection: [
      { stableKey: "S1", name: "General", averagePoints: 7, totalPoints: 7 },
    ],
    overallTotal: 7,
    overallAverage: 7,
    countAchieved: 1,
    tier: null,
    tierMetricValue: 7,
    unansweredKeys: [],
    ...(withFindings ? { findings: FINDINGS } : {}),
  } as unknown as ScoreResult;
  return baseReport({
    result,
    sections: [{ stableKey: "S1", name: "General" }],
    questionsByKey: {
      Q_SLIDER: { type: "SLIDER_LIKERT", label: "Slider", sectionStableKey: "S1" },
    },
  });
}

/** Qualitative report fixture (LVA-alias). */
function qualReport(withFindings: boolean): RespondentReport {
  return baseReport({
    templateAlias: "leadership-vision-alignment",
    assessmentName: "Leadership Vision Alignment",
    result: (withFindings ? { findings: FINDINGS } : {}) as unknown as ScoreResult,
    sections: [
      { stableKey: "S1", name: "The vision on the future" },
      { stableKey: "S2", name: "Strengths" },
    ],
    questionsByKey: {
      S1_q: { type: "TEXT", label: "Q", sectionStableKey: "S1" },
    },
    rawAnswers: [{ stableKey: "S1_q", value: "an answer" }],
  });
}

// ── Scored merge ────────────────────────────────────────────────────────────

describe("BrandedReport — scored findings merge", () => {
  it("keeps the flag-off classic root exact and contains the enabled report score table", () => {
    const { rerender } = render(<BrandedReport report={scoredReport(false)} />);
    const root = screen.getByTestId("branded-report");
    expect(root).toHaveAttribute("class", "su-public-brand su-report");
    expect(root).not.toHaveAttribute("data-responsive-report");

    rerender(
      <BrandedReport report={scoredReport(false)} responsiveEnabled />,
    );
    expect(root).toHaveClass("min-w-0");
    expect(root).toHaveClass("max-w-full");
    expect(root).toHaveAttribute("data-responsive-report", "");
    const region = screen.getByRole("region", {
      name: "Score summary table",
    });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toHaveClass("su-report-data-region");
    expect(
      within(region).getByTestId("report-scores-table"),
    ).toBeInTheDocument();
  });

  it("server decision ON: non-slider findings merge into 'What to work on next'; slider snapshot entries are IGNORED", () => {
    render(<BrandedReport report={scoredReport(true)} reportFindingsAvailable />);
    const recs = screen.getByTestId("report-recommendations");
    // Legacy slider rec still renders exactly once.
    expect(recs.textContent).toContain("LEGACY ROW RECOMMENDATION");
    // NUMBER finding merged into its section group.
    expect(recs.textContent).toContain("NUMBER finding text");
    // Orphan (unknown section) MC finding lands in the generic group.
    expect(recs.textContent).toContain("MC orphan finding text");
    // The slider SNAPSHOT entry must not render (no double display).
    expect(recs.textContent).not.toContain("SLIDER SNAPSHOT ENTRY");
  });

  it("flag OFF: output is identical to a report with no snapshot at all", () => {
    const { container: withSnapshot } = render(
      <BrandedReport report={scoredReport(true)} reportFindingsAvailable={false} />
    );
    const { container: withoutSnapshot } = render(
      <BrandedReport report={scoredReport(false)} reportFindingsAvailable={false} />
    );
    expect(withSnapshot.innerHTML).toBe(withoutSnapshot.innerHTML);
    expect(withSnapshot.textContent).not.toContain("NUMBER finding text");
  });

  it("an omitted decision fails closed", () => {
    render(<BrandedReport report={scoredReport(true)} />);
    expect(screen.getByTestId("report-recommendations").textContent).not.toContain(
      "NUMBER finding text"
    );
  });

  it("flag ON with pre-Wave-U frozen result (no findings key): renders unchanged", () => {
    render(<BrandedReport report={scoredReport(false)} reportFindingsAvailable />);
    const recs = screen.getByTestId("report-recommendations");
    expect(recs.textContent).toContain("LEGACY ROW RECOMMENDATION");
    expect(recs.textContent).not.toContain("NUMBER finding text");
  });

  it("applies the same server decision to a curated renderer", () => {
    const report = {
      ...scoredReport(true),
      templateAlias: "scaling-up-full",
      reportStyle: "MODERN_DASHBOARD" as const,
    };
    const { rerender } = render(
      <BrandedReport report={report} reportStylesAvailable reportFindingsAvailable={false} />,
    );
    expect(screen.queryByText("NUMBER finding text")).toBeNull();
    rerender(<BrandedReport report={report} reportStylesAvailable reportFindingsAvailable />);
    expect(screen.getByText("NUMBER finding text")).toBeInTheDocument();
  });
});

// ── Qualitative section ─────────────────────────────────────────────────────

describe("QualitativeReport — findings section", () => {
  it("server decision ON: renders ALL snapshot kinds grouped by section, after the last section, before the footer", () => {
    render(<QualitativeReport report={qualReport(true)} reportFindingsAvailable />);
    const section = screen.getByTestId("qual-section-findings");
    expect(section.textContent).toContain("What to work on next");
    expect(section.textContent).toContain("Your recommendations");
    // Slider entries DO render on qualitative (all rule kinds — D6).
    expect(section.textContent).toContain("SLIDER SNAPSHOT ENTRY");
    expect(section.textContent).toContain("NUMBER finding text");
    // Known section name resolved; orphan trails without a heading.
    expect(section.textContent).toContain("The vision on the future");
    expect(section.textContent).toContain("MC orphan finding text");
    // Placement: after the last qual section, before the footer.
    const sections = Array.from(
      section.parentElement!.querySelectorAll("[data-testid^='qual-section-']")
    );
    expect(sections[sections.length - 1]).toBe(section);
    // Per-item testid present.
    expect(screen.getAllByTestId("qual-finding-Q_NUMBER")).toHaveLength(1);
  });

  it("flag OFF: section absent; output identical to a report with no snapshot", () => {
    const { container: a } = render(<QualitativeReport report={qualReport(true)} reportFindingsAvailable={false} />);
    const { container: b } = render(<QualitativeReport report={qualReport(false)} reportFindingsAvailable={false} />);
    expect(a.innerHTML).toBe(b.innerHTML);
    expect(a.querySelector("[data-testid='qual-section-findings']")).toBeNull();
  });

  it("flag ON with empty/absent snapshot: section absent", () => {
    const { container } = render(<QualitativeReport report={qualReport(false)} reportFindingsAvailable />);
    expect(container.querySelector("[data-testid='qual-section-findings']")).toBeNull();
  });

  it("malformed snapshot never crashes the render", () => {
    const report = qualReport(false);
    (report.result as unknown as Record<string, unknown>).findings = {
      not: "an array",
    };
    expect(() => render(<QualitativeReport report={report} reportFindingsAvailable />)).not.toThrow();
  });
});
