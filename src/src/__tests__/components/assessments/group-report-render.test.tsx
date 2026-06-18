/**
 * Assessment v7.6 Wave F #22 — Group report renderer tests (T7).
 *
 * Pure presentational tests for the team-level (group) report renderers:
 *   - QualitativeGroupReport  (LVA / QSP — aggregates raw answers)
 *   - ScoredGroupReport       (Rockefeller / Five-Dysfunctions — reads frozen
 *                              result, CEO excluded from team avg)
 *   - GroupReport             (dispatcher keyed on report.reportType)
 *
 * These build small in-test CampaignGroupReport fixtures (the model is a plain
 * discriminated structure; the loader is tested separately under
 * __tests__/lib/assessments) and assert on text/roles, NOT styling. They cover:
 *   - the qualitative matrix (CEO column marked "(CEO)", per-row n, blank cell
 *     for a non-answerer), omit-empty free text, sorted rating, %-labels, the
 *     "as of" provenance line;
 *   - the scored alignment profile (CEO | Team avg | Dev), the N<2 "—" row,
 *     the tier band;
 *   - the dispatcher picking the right renderer by reportType;
 *   - the no-CEO graceful degrade (placeholder + no CEO column);
 *   - the empty state (respondentCount === 0).
 */

import { render, screen, within } from "@testing-library/react";
import { GroupReport } from "@/components/assessments/GroupReport";
import { QualitativeGroupReport } from "@/components/assessments/QualitativeGroupReport";
import { ScoredGroupReport } from "@/components/assessments/ScoredGroupReport";
import type { CampaignGroupReport } from "@/lib/assessments/group-report-model";
import type { GroupReportProvenance } from "@/components/assessments/GroupReport";

// ── Shared provenance props ──────────────────────────────────────────────────

function provenance(
  overrides: Partial<GroupReportProvenance> = {},
): GroupReportProvenance {
  return {
    assessmentName: "Leadership Vision Alignment",
    companyName: "Acme Corp",
    generatedAt: new Date("2026-06-18T10:58:00Z"),
    completedCount: 3,
    invitedCount: 4,
    versionLabel: "lva-v2",
    ceoName: "John CEOExec",
    ...overrides,
  };
}

// ── Respondent cohort (CEO first) ─────────────────────────────────────────────

const RESPONDENTS = [
  { respondentId: "r-ceo", name: "John CEOExec", jobTitle: "CEO", isCEO: true, isOrphan: false },
  { respondentId: "r-hr", name: "Kathy HR", jobTitle: "HR", isCEO: false, isOrphan: false },
  { respondentId: "r-svc", name: "Jeff Services", jobTitle: "Services", isCEO: false, isOrphan: false },
];

// ── Qualitative fixture (every presentation kind) ─────────────────────────────

function qualitativeReport(
  overrides: Partial<CampaignGroupReport> = {},
): CampaignGroupReport {
  return {
    reportType: "qualitative",
    respondents: RESPONDENTS,
    respondentCount: 3,
    degraded: false,
    questionsByKey: {},
    answersByRespondent: new Map(),
    qualitative: {
      sections: [
        {
          stableKey: "S1_financials",
          name: "The Vision on the Future",
          presentation: "metric-table",
          rows: [
            {
              stableKey: "S1_revenue",
              label: "Revenue in three years ($M)",
              mean: 10,
              n: 3,
              perRespondent: [
                { respondentId: "r-ceo", value: 10 },
                { respondentId: "r-hr", value: 10 },
                { respondentId: "r-svc", value: 10 },
              ],
            },
            {
              stableKey: "S1_employees",
              label: "Number of employees",
              mean: 20,
              n: 2,
              perRespondent: [
                { respondentId: "r-ceo", value: 20 },
                { respondentId: "r-hr", value: 20 },
                { respondentId: "r-svc", value: null }, // non-answerer → blank cell
              ],
            },
          ],
        },
        {
          stableKey: "S2_vision",
          name: "What the team says",
          presentation: "qa",
          questions: [
            {
              stableKey: "S2_success",
              label: "What are the key reasons for success?",
              kind: "text",
              // Kathy answered nothing → omit-empty (only answerers appear).
              answers: [
                { respondentId: "r-ceo", name: "John CEOExec", isCEO: true, text: "Disciplined execution" },
                { respondentId: "r-svc", name: "Jeff Services", isCEO: false, text: "Customer retention" },
              ],
            },
          ],
        },
        {
          stableKey: "S3_strengths",
          name: "Organizational Strengths & Weaknesses",
          presentation: "rating",
          // already sorted by mean desc by the model
          factors: [
            { stableKey: "F_recruit", label: "Recruitment of new staff", strong: 2, avg: 1, weak: 0, mean: 2.7, n: 3 },
            { stableKey: "F_culture", label: "Culture", strong: 0, avg: 2, weak: 1, mean: 1.7, n: 3 },
            { stableKey: "F_cash", label: "Cash", strong: 0, avg: 1, weak: 2, mean: 1.3, n: 3 },
          ],
        },
        {
          stableKey: "S4_obstacles",
          name: "Biggest Obstacles to growth",
          presentation: "choices",
          question: { stableKey: "Q_obstacles", label: "Biggest obstacles" },
          n: 3,
          options: [
            { key: "culture", label: "Culture", count: 2, pct: 67, n: 3 },
            { key: "strategy", label: "Strategy", count: 2, pct: 67, n: 3 },
            { key: "tech", label: "Technology", count: 0, pct: 0, n: 3 },
          ],
        },
      ],
    },
    ...overrides,
  };
}

// ── Scored fixture (Rockefeller-shaped) ──────────────────────────────────────

function scoredReport(
  overrides: Partial<CampaignGroupReport> = {},
): CampaignGroupReport {
  return {
    reportType: "scored",
    respondents: RESPONDENTS,
    respondentCount: 4,
    degraded: false,
    questionsByKey: {},
    answersByRespondent: new Map(),
    scored: {
      sections: [
        { stableKey: "people", name: "People", ceo: 3.1, teamAvg: 5.3, dev: -2.2, n: 3 },
        { stableKey: "strategy", name: "Strategy", ceo: 2.0, teamAvg: 7.1, dev: -5.1, n: 3 },
        { stableKey: "execution", name: "Execution", ceo: 6.2, teamAvg: 5.4, dev: 0.8, n: 3 },
        // N<2 — only the CEO contributed → teamAvg/dev null
        { stableKey: "cash", name: "Cash", ceo: 1.6, teamAvg: null, dev: null, n: 0 },
      ],
      questions: [
        { stableKey: "q_values", label: "We have a written core-values list", ceo: 4, teamMean: 5.3, n: 3 },
        { stableKey: "q_kpi", label: "KPIs reviewed weekly", ceo: 6.2, teamMean: 5.4, n: 3 },
      ],
      tier: {
        ceo: "On Track",
        teamDistribution: [
          { label: "On Track", count: 2 },
          { label: "Needs Focus", count: 1 },
        ],
      },
    },
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// Dispatcher
// ══════════════════════════════════════════════════════════════════════════

describe("GroupReport dispatcher", () => {
  it("renders the qualitative renderer for reportType=qualitative", () => {
    render(<GroupReport report={qualitativeReport()} {...provenance()} />);
    expect(screen.getByTestId("qualitative-group-report")).toBeInTheDocument();
    expect(screen.queryByTestId("scored-group-report")).not.toBeInTheDocument();
  });

  it("renders the scored renderer for reportType=scored", () => {
    render(
      <GroupReport
        report={scoredReport()}
        {...provenance({ assessmentName: "Rockefeller Habits", versionLabel: "rock-v2" })}
      />,
    );
    expect(screen.getByTestId("scored-group-report")).toBeInTheDocument();
    expect(screen.queryByTestId("qualitative-group-report")).not.toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Cover + provenance (shared)
// ══════════════════════════════════════════════════════════════════════════

describe("Cover + as-of provenance line", () => {
  it("renders the Group Report cover with assessment + company name", () => {
    render(<QualitativeGroupReport report={qualitativeReport()} {...provenance()} />);
    expect(screen.getByTestId("group-report-cover")).toBeInTheDocument();
    expect(screen.getByText(/Group Report/i)).toBeInTheDocument();
    expect(screen.getByText(/Leadership Vision Alignment/i)).toBeInTheDocument();
    expect(screen.getByText(/Acme Corp/)).toBeInTheDocument();
  });

  it("renders the 'As of' line with completed/invited, version, and CEO name", () => {
    render(<QualitativeGroupReport report={qualitativeReport()} {...provenance()} />);
    const asof = screen.getByTestId("group-report-asof");
    expect(asof).toHaveTextContent(/As of/i);
    expect(asof).toHaveTextContent(/3 of 4/);
    expect(asof).toHaveTextContent(/completed/i);
    expect(asof).toHaveTextContent(/lva-v2/);
    expect(asof).toHaveTextContent(/John CEOExec/);
  });

  it("renders the Wave-E footer (Generated by Scaling Up Platform)", () => {
    render(<QualitativeGroupReport report={qualitativeReport()} {...provenance()} />);
    const footer = screen.getByTestId("group-report-footer");
    expect(footer).toHaveTextContent(/Generated by Scaling Up Platform/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Qualitative
// ══════════════════════════════════════════════════════════════════════════

describe("QualitativeGroupReport", () => {
  it("renders a metric-table matrix with the CEO column marked (CEO), per-row n, and a blank cell for a non-answerer", () => {
    render(<QualitativeGroupReport report={qualitativeReport()} {...provenance()} />);
    const table = screen.getByTestId("group-metric-table-S1_financials");

    // CEO column header is marked "(CEO)"
    const ceoHeader = within(table).getByText(/John CEOExec/);
    expect(ceoHeader).toHaveTextContent(/\(CEO\)/);

    // a Mean column + an n column header exist
    expect(within(table).getByText(/^Mean$/)).toBeInTheDocument();

    // the "Number of employees" row: n=2 and Jeff's cell is blank (—)
    const row = within(table).getByTestId("group-metric-row-S1_employees");
    expect(row).toHaveTextContent("2"); // n
    const blank = within(row).getByTestId("group-metric-blank-r-svc");
    expect(blank).toHaveTextContent("—");
  });

  it("omits empty free-text answers (only answerers appear, CEO first)", () => {
    render(<QualitativeGroupReport report={qualitativeReport()} {...provenance()} />);
    const qa = screen.getByTestId("group-qa-question-S2_success");
    expect(within(qa).getByText("Disciplined execution")).toBeInTheDocument();
    expect(within(qa).getByText("Customer retention")).toBeInTheDocument();
    // Kathy answered nothing → not present
    expect(within(qa).queryByText(/Kathy HR/)).not.toBeInTheDocument();
  });

  it("renders rating factors in the given (mean-desc) order with mean + n", () => {
    render(<QualitativeGroupReport report={qualitativeReport()} {...provenance()} />);
    const ratingSection = screen.getByTestId("group-rating-S3_strengths");
    const factorLabels = within(ratingSection)
      .getAllByTestId(/group-rating-factor-/)
      .map((el) => el.getAttribute("data-factor"));
    expect(factorLabels).toEqual(["F_recruit", "F_culture", "F_cash"]);
    // means rendered
    expect(within(ratingSection).getByText("2.7")).toBeInTheDocument();
    // a Strong/Average/Weak legend present
    expect(within(ratingSection).getByText(/Strong/)).toBeInTheDocument();
    expect(within(ratingSection).getByText(/Average/)).toBeInTheDocument();
    expect(within(ratingSection).getByText(/Weak/)).toBeInTheDocument();
  });

  it("renders choices as %-labels (not codes), including 0%", () => {
    render(<QualitativeGroupReport report={qualitativeReport()} {...provenance()} />);
    const choices = screen.getByTestId("group-choices-S4_obstacles");
    // labels not keys
    expect(within(choices).getByText("Culture")).toBeInTheDocument();
    expect(within(choices).getByText("Technology")).toBeInTheDocument();
    expect(within(choices).queryByText("tech")).not.toBeInTheDocument();
    // includes 0%
    expect(within(choices).getByText("0%")).toBeInTheDocument();
    expect(within(choices).getAllByText("67%").length).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Scored
// ══════════════════════════════════════════════════════════════════════════

describe("ScoredGroupReport", () => {
  it("renders the alignment profile with CEO | Team avg | Dev headers", () => {
    render(
      <ScoredGroupReport
        report={scoredReport()}
        {...provenance({ assessmentName: "Rockefeller Habits", versionLabel: "rock-v2" })}
      />,
    );
    const table = screen.getByTestId("group-scored-profile");
    expect(within(table).getByText("CEO")).toBeInTheDocument();
    expect(within(table).getByText(/Team avg/i)).toBeInTheDocument();
    expect(within(table).getByText(/Dev/i)).toBeInTheDocument();
    // it's a real table with column headers
    expect(within(table).getAllByRole("columnheader").length).toBeGreaterThanOrEqual(4);
  });

  it("renders a '—' for the N<2 section (Cash) instead of a deviation", () => {
    render(
      <ScoredGroupReport
        report={scoredReport()}
        {...provenance({ assessmentName: "Rockefeller Habits", versionLabel: "rock-v2" })}
      />,
    );
    const cashRow = screen.getByTestId("group-scored-section-cash");
    const dev = within(cashRow).getByTestId("group-scored-dev-cash");
    expect(dev).toHaveTextContent("—");
  });

  it("renders the CEO tier and the team tier-distribution band", () => {
    render(
      <ScoredGroupReport
        report={scoredReport()}
        {...provenance({ assessmentName: "Rockefeller Habits", versionLabel: "rock-v2" })}
      />,
    );
    expect(screen.getByTestId("group-scored-ceo-tier")).toHaveTextContent("On Track");
    const band = screen.getByTestId("group-scored-tier-band");
    expect(band).toHaveTextContent(/On Track/);
    expect(band).toHaveTextContent(/Needs Focus/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Graceful degrade (G2) + empty state
// ══════════════════════════════════════════════════════════════════════════

describe("Graceful degrade — no CEO", () => {
  it("renders the team aggregate WITHOUT a CEO column + shows the no-CEO note", () => {
    // Realistic no-CEO cohort: the model emits NO CEO respondent and NO
    // isCEO-flagged answer anywhere (the loader builds answer lists from the
    // cohort, which here has no CEO).
    const nonCeo = RESPONDENTS.filter((r) => !r.isCEO);
    const noCeo = qualitativeReport({
      respondents: nonCeo,
      respondentCount: 2,
      qualitative: {
        sections: [
          {
            stableKey: "S1_financials",
            name: "The Vision on the Future",
            presentation: "metric-table",
            rows: [
              {
                stableKey: "S1_revenue",
                label: "Revenue in three years ($M)",
                mean: 10,
                n: 2,
                perRespondent: [
                  { respondentId: "r-hr", value: 10 },
                  { respondentId: "r-svc", value: 10 },
                ],
              },
            ],
          },
          {
            stableKey: "S2_vision",
            name: "What the team says",
            presentation: "qa",
            questions: [
              {
                stableKey: "S2_success",
                label: "What are the key reasons for success?",
                kind: "text",
                answers: [
                  { respondentId: "r-svc", name: "Jeff Services", isCEO: false, text: "Customer retention" },
                ],
              },
            ],
          },
        ],
      },
    });
    render(
      <QualitativeGroupReport
        report={noCeo}
        {...provenance({ completedCount: 2 })}
      />,
    );
    // the no-CEO callout is shown
    expect(screen.getByTestId("group-report-no-ceo-note")).toBeInTheDocument();
    // no column is marked "(CEO)"
    expect(screen.queryByText(/\(CEO\)/)).not.toBeInTheDocument();
  });
});

describe("Empty state", () => {
  it("renders a clean 'No completed submissions yet' panel when respondentCount === 0", () => {
    const empty = qualitativeReport({
      respondents: [],
      respondentCount: 0,
      qualitative: { sections: [] },
    });
    render(<QualitativeGroupReport report={empty} {...provenance({ completedCount: 0 })} />);
    expect(screen.getByTestId("group-report-empty")).toBeInTheDocument();
    expect(screen.getByText(/No completed submissions yet/i)).toBeInTheDocument();
  });

  it("renders the empty state through the dispatcher for scored too", () => {
    const empty = scoredReport({
      respondents: [],
      respondentCount: 0,
      scored: { sections: [], questions: [], tier: { ceo: null, teamDistribution: [] } },
    });
    render(<GroupReport report={empty} {...provenance({ completedCount: 0 })} />);
    expect(screen.getByTestId("group-report-empty")).toBeInTheDocument();
  });
});
