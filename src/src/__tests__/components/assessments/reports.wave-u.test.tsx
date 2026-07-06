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
import { render, screen } from "@testing-library/react";
import { BrandedReport } from "@/components/assessments/BrandedReport";
import { QualitativeReport } from "@/components/assessments/QualitativeReport";
import type { RespondentReport } from "@/lib/assessments/respondent-report";
import type { ScoreResult } from "@/lib/assessments/scoring";

const FLAG = "WAVE_U_FINDINGS_ENABLED";
const KILL = "WAVE_U_FINDINGS_KILL";
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of [FLAG, KILL]) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of [FLAG, KILL]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

// ── Fixtures ────────────────────────────────────────────────────────────────

function baseReport(overrides: Partial<RespondentReport> = {}): RespondentReport {
  return {
    respondentName: "John CEOExec",
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
  it("flag ON: non-slider findings merge into 'What to work on next'; slider snapshot entries are IGNORED", () => {
    process.env[FLAG] = "1";
    render(<BrandedReport report={scoredReport(true)} />);
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
      <BrandedReport report={scoredReport(true)} />
    );
    const { container: withoutSnapshot } = render(
      <BrandedReport report={scoredReport(false)} />
    );
    expect(withSnapshot.innerHTML).toBe(withoutSnapshot.innerHTML);
    expect(withSnapshot.textContent).not.toContain("NUMBER finding text");
  });

  it("KILL overrides ENABLED", () => {
    process.env[FLAG] = "1";
    process.env[KILL] = "1";
    render(<BrandedReport report={scoredReport(true)} />);
    expect(screen.getByTestId("report-recommendations").textContent).not.toContain(
      "NUMBER finding text"
    );
  });

  it("flag ON with pre-Wave-U frozen result (no findings key): renders unchanged", () => {
    process.env[FLAG] = "1";
    render(<BrandedReport report={scoredReport(false)} />);
    const recs = screen.getByTestId("report-recommendations");
    expect(recs.textContent).toContain("LEGACY ROW RECOMMENDATION");
    expect(recs.textContent).not.toContain("NUMBER finding text");
  });
});

// ── Qualitative section ─────────────────────────────────────────────────────

describe("QualitativeReport — findings section", () => {
  it("flag ON: renders ALL snapshot kinds grouped by section, after the last section, before the footer", () => {
    process.env[FLAG] = "1";
    render(<QualitativeReport report={qualReport(true)} />);
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
    const { container: a } = render(<QualitativeReport report={qualReport(true)} />);
    const { container: b } = render(<QualitativeReport report={qualReport(false)} />);
    expect(a.innerHTML).toBe(b.innerHTML);
    expect(a.querySelector("[data-testid='qual-section-findings']")).toBeNull();
  });

  it("flag ON with empty/absent snapshot: section absent", () => {
    process.env[FLAG] = "1";
    const { container } = render(<QualitativeReport report={qualReport(false)} />);
    expect(container.querySelector("[data-testid='qual-section-findings']")).toBeNull();
  });

  it("malformed snapshot never crashes the render", () => {
    process.env[FLAG] = "1";
    const report = qualReport(false);
    (report.result as unknown as Record<string, unknown>).findings = {
      not: "an array",
    };
    expect(() => render(<QualitativeReport report={report} />)).not.toThrow();
  });
});
