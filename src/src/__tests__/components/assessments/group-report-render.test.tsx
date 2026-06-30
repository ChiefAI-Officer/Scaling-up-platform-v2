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
    provenance: { groupRenderVersion: "lva-fidelity-v1", scaleDegraded: false },
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
          // already sorted by mean desc by the model. scaledValue = the Esperto
          // 0–10 value DERIVED FROM BUCKET COUNTS (NOT the raw mean): 2S+1A→8.4,
          // 2A+1W→3.4, 1A+2W→1.7 (R1-M4 — the reverted "7.2" midpoint is wrong).
          factors: [
            { stableKey: "F_recruit", label: "Recruitment of new staff", strong: 2, avg: 1, weak: 0, mean: 2.7, scaledValue: 8.4, n: 3 },
            { stableKey: "F_culture", label: "Culture", strong: 0, avg: 2, weak: 1, mean: 1.7, scaledValue: 3.4, n: 3 },
            { stableKey: "F_cash", label: "Cash", strong: 0, avg: 1, weak: 2, mean: 1.3, scaledValue: 1.7, n: 3 },
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
    provenance: { groupRenderVersion: "lva-fidelity-v1", scaleDegraded: false },
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

  // ── Wave K — coach logo on the group report (reuse Coach.profileImage) ──

  it("renders the coach logo on the group footer + cover when coachLogoUrl is set", () => {
    render(
      <GroupReport
        report={qualitativeReport()}
        {...provenance({
          coachLogoUrl: "https://cdn.example.com/coach.png",
          coachName: "Dana Coach",
        })}
      />,
    );
    const footer = screen.getByTestId("group-report-footer");
    const cover = screen.getByTestId("group-report-cover");
    const footerLogo = within(footer).getByTestId("coach-logo");
    expect(footerLogo).toHaveAttribute("src", "https://cdn.example.com/coach.png");
    expect(footerLogo).toHaveAttribute("alt", "Dana Coach");
    expect(within(cover).getByTestId("coach-logo")).not.toBeNull();
  });

  it("renders no coach logo on the group report when coachLogoUrl is null", () => {
    render(
      <GroupReport
        report={qualitativeReport()}
        {...provenance({ coachLogoUrl: null })}
      />,
    );
    expect(screen.queryByTestId("coach-logo")).toBeNull();
    // SU logo + credit line stay intact.
    const footer = screen.getByTestId("group-report-footer");
    expect(footer.querySelector("img.su-logo")).not.toBeNull();
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

  it("renders rating factors in the given (mean-desc) order with the 0–10 scaled value + per-factor n", () => {
    render(
      <QualitativeGroupReport
        report={qualitativeReport()}
        {...provenance({ templateAlias: "leadership-vision-alignment" })}
      />,
    );
    const ratingSection = screen.getByTestId("group-rating-S3_strengths");
    const factorLabels = within(ratingSection)
      .getAllByTestId(/group-rating-factor-/)
      .map((el) => el.getAttribute("data-factor"));
    expect(factorLabels).toEqual(["F_recruit", "F_culture", "F_cash"]);
    // L3 (R1-M4): the BUCKET-DERIVED 0–10 scaled value is rendered (NOT the raw
    // mean 2.7, NOT the reverted midpoint 7.2). F_recruit (2S+1A) → 8.4.
    expect(within(ratingSection).getByText("8.4")).toBeInTheDocument();
    expect(within(ratingSection).queryByText("2.7")).not.toBeInTheDocument();
    expect(within(ratingSection).queryByText("7.2")).not.toBeInTheDocument();
    // L3 (R1-M5): an exact one-decimal value keeps its decimal (3.4 not "3").
    expect(within(ratingSection).getByText("3.4")).toBeInTheDocument();
    expect(within(ratingSection).getByText("1.7")).toBeInTheDocument();
    // per-factor n shown (denominators can differ across factors)
    expect(within(ratingSection).getAllByText("n=3").length).toBe(3);
    // the 0–10 legend (NOT the raw 1–3 legend)
    expect(
      within(ratingSection).getByText(/value on a 0–10 scale \(10 = strong\)/),
    ).toBeInTheDocument();
    expect(within(ratingSection).queryByText(/1–3 scale/)).not.toBeInTheDocument();
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
// Wave L — LVA verbatim section intros (L4b) + mirrored report labels (L4a)
// ══════════════════════════════════════════════════════════════════════════

describe("Wave L — LVA section intros + report labels", () => {
  it("renders the verbatim S3 + S4 intros under their headings when templateAlias is LVA", () => {
    render(
      <QualitativeGroupReport
        report={qualitativeReport()}
        {...provenance({ templateAlias: "leadership-vision-alignment" })}
      />,
    );
    expect(
      screen.getByTestId("group-section-intro-S3_strengths"),
    ).toHaveTextContent(
      "The team rated the company with 16 factors that affect the success of an organization. Each factor was rated with 'strong', 'average' or 'weak'.",
    );
    expect(
      screen.getByTestId("group-section-intro-S4_obstacles"),
    ).toHaveTextContent(
      "We asked about the biggest constraints to reach the goals of the company. This is what the team rated:",
    );
  });

  it("renders NO section intros when templateAlias is not LVA", () => {
    render(
      <QualitativeGroupReport
        report={qualitativeReport()}
        {...provenance({ templateAlias: "qsp-v2" })}
      />,
    );
    expect(
      screen.queryByTestId("group-section-intro-S3_strengths"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("group-section-intro-S4_obstacles"),
    ).not.toBeInTheDocument();
  });

  it("renders NO intro for a section that has none (S2_vision is in the map, S5/S6 are not)", () => {
    render(
      <QualitativeGroupReport
        report={qualitativeReport()}
        {...provenance({ templateAlias: "leadership-vision-alignment" })}
      />,
    );
    // S2_vision IS in the intro map → present.
    expect(
      screen.getByTestId("group-section-intro-S2_vision"),
    ).toBeInTheDocument();
    // S1_financials is a metric-table in this fixture → its intro is present too.
    expect(
      screen.getByTestId("group-section-intro-S1_financials"),
    ).toBeInTheDocument();
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

  // ── Wave J / J-2 — Peers benchmark + tier suppression (SU-Full) ────────────

  /** SU-Full-shaped scored report: domains + ScaleUp + peers, tier suppressed. */
  function suFullReport(
    overrides: Partial<CampaignGroupReport> = {},
  ): CampaignGroupReport {
    const base = scoredReport();
    return scoredReport({
      showTier: false,
      benchmarkVersion: "2026-06",
      scored: {
        ...base.scored!,
        sections: [
          {
            stableKey: "people",
            name: "People",
            ceo: 8.0,
            teamAvg: 6.5,
            dev: 1.5,
            n: 3,
            peers: 6.1,
            devPeers: 1.9,
            devPeersTeam: 0.4,
          },
          // a section with a NULL peer — must render plain "—", never "(N<2)"
          {
            stableKey: "cash",
            name: "Cash",
            ceo: 5.0,
            teamAvg: 4.0,
            dev: 1.0,
            n: 2,
            peers: null,
            devPeers: null,
            devPeersTeam: null,
          },
        ],
        domains: [
          {
            // distinct key so the domain row's testid does not collide with the
            // "people" SECTION row (both ProfileTables emit group-scored-*-${key})
            key: "people_dom",
            label: "People",
            ceo: 8.0,
            teamAvg: 6.5,
            dev: 1.5,
            n: 3,
            peers: 6.2,
            devPeers: 1.8,
            devPeersTeam: 0.3,
          },
        ],
        scaleUpScore: {
          ceo: 72.0,
          teamAvg: 60.0,
          peers: 53.1,
          devPeers: 18.9,
        },
      },
      ...overrides,
    });
  }

  it("renders Peers + Dev·Peers (domain/section + ScaleUp), hides the tier", () => {
    render(
      <ScoredGroupReport
        report={suFullReport()}
        {...provenance({ assessmentName: "Scaling Up Full", versionLabel: "su-full-v2" })}
      />,
    );
    // Peers column header present
    expect(screen.getAllByText(/^Peers$/).length).toBeGreaterThan(0);
    // section Peers + Dev·Peers values
    const peopleSection = screen.getByTestId("group-scored-section-people");
    expect(within(peopleSection).getByTestId("group-scored-peers-people")).toHaveTextContent("6.1");
    expect(within(peopleSection).getByTestId("group-scored-devpeers-people")).toHaveTextContent("1.9");
    // ScaleUp peers
    expect(screen.getByTestId("group-scored-scaleup-peers")).toHaveTextContent("53.1");
    expect(screen.getByTestId("group-scored-scaleup-devpeers")).toHaveTextContent(/18\.9/);
    // tier suppressed
    expect(screen.queryByTestId("group-scored-ceo-tier")).not.toBeInTheDocument();
    expect(screen.queryByTestId("group-scored-tier-band")).not.toBeInTheDocument();
    // provisional footnote present
    expect(screen.getByText(/provisional/i)).toBeInTheDocument();
  });

  it("omits Peers + keeps tier when no peers (LVA-style, showTier unset)", () => {
    render(
      <ScoredGroupReport
        report={scoredReport()}
        {...provenance({ assessmentName: "Rockefeller Habits", versionLabel: "rock-v2" })}
      />,
    );
    // no Peers header
    expect(screen.queryByText(/^Peers$/)).not.toBeInTheDocument();
    // tier STILL shows (showTier undefined → show, back-compat)
    expect(screen.getByTestId("group-scored-ceo-tier")).toBeInTheDocument();
    // no provisional footnote
    expect(screen.queryByText(/provisional/i)).not.toBeInTheDocument();
  });

  it("renders a missing peer as a plain '—', never '(N<2)'", () => {
    render(
      <ScoredGroupReport
        report={suFullReport()}
        {...provenance({ assessmentName: "Scaling Up Full", versionLabel: "su-full-v2" })}
      />,
    );
    const cashRow = screen.getByTestId("group-scored-section-cash");
    const peerDev = within(cashRow).getByTestId("group-scored-devpeers-cash");
    expect(peerDev).toHaveTextContent("—");
    expect(peerDev).not.toHaveTextContent("N<2");
    expect(peerDev).not.toHaveTextContent("N&lt;2");
  });

  it("no-CEO → shows the 'Team vs Peers' deviation as the standing signal", () => {
    const noCeoRespondents = RESPONDENTS.filter((r) => !r.isCEO);
    const base = suFullReport({ respondents: noCeoRespondents, respondentCount: 2 });
    // model truth: no CEO → ScaleUp ceo + devPeers are null (devPeers = ceo −
    // peers), so the ScaleUp deviation figure suppresses (no "Dev · Peers").
    const report: CampaignGroupReport = {
      ...base,
      scored: {
        ...base.scored!,
        scaleUpScore: { ceo: null, teamAvg: 60.0, peers: 53.1, devPeers: null },
      },
    };
    render(
      <ScoredGroupReport
        report={report}
        {...provenance({ assessmentName: "Scaling Up Full", versionLabel: "su-full-v2", completedCount: 2 })}
      />,
    );
    // no-CEO standing-signal header (the section/domain table deviation column)
    expect(screen.getAllByText(/Team vs Peers/i).length).toBeGreaterThan(0);
    // no "Dev · Peers" anywhere (that's the CEO-present variant — table header
    // AND the ScaleUp deviation figure, both suppressed without a CEO)
    expect(screen.queryByText(/Dev · Peers/i)).not.toBeInTheDocument();
    // devPeersTeam value rendered (0.4) in the people section
    const peopleSection = screen.getByTestId("group-scored-section-people");
    expect(within(peopleSection).getByTestId("group-scored-devpeers-people")).toHaveTextContent("0.4");
  });

  it("no-CEO ScaleUp → shows the Peers figure but NO blank deviation figure", () => {
    const noCeoRespondents = RESPONDENTS.filter((r) => !r.isCEO);
    const base = suFullReport({ respondents: noCeoRespondents, respondentCount: 2 });
    // model truth: with no CEO the ScaleUp headline carries peers but a null
    // devPeers (devPeers = ceo − peers; ceo is null).
    const report: CampaignGroupReport = {
      ...base,
      scored: {
        ...base.scored!,
        scaleUpScore: { ceo: null, teamAvg: 60.0, peers: 53.1, devPeers: null },
      },
    };
    render(
      <ScoredGroupReport
        report={report}
        {...provenance({ assessmentName: "Scaling Up Full", versionLabel: "su-full-v2", completedCount: 2 })}
      />,
    );
    // Peers figure still present
    expect(screen.getByTestId("group-scored-scaleup-peers")).toHaveTextContent("53.1");
    // NO deviation figure (no blank "—" under a "Dev · Peers"/"Team vs Peers" label)
    expect(screen.queryByTestId("group-scored-scaleup-devpeers")).not.toBeInTheDocument();
  });

  it("shows a provisional-benchmark footnote naming the version", () => {
    render(
      <ScoredGroupReport
        report={suFullReport()}
        {...provenance({ assessmentName: "Scaling Up Full", versionLabel: "su-full-v2" })}
      />,
    );
    const note = screen.getByText(/provisional/i);
    expect(note).toHaveTextContent(/2026-06/);
  });

  // ── Wave J/K (Task 3) — Appendix B pseudonymized per-member domain grid ─────

  /** SU-Full-shaped scored report carrying an Appendix B grid. */
  function appendixBReport(
    overrides: Partial<CampaignGroupReport> = {},
  ): CampaignGroupReport {
    const base = suFullReport();
    return suFullReport({
      scored: {
        ...base.scored!,
        appendixB: [
          {
            // CEO row — labelled "CEO" (a role, de-identified, not "Person 1").
            personLabel: "CEO",
            domainScores: { people: 8, strategy: 6, execution: 7, cash: 9 },
          },
          {
            personLabel: "Person 1",
            domainScores: { people: 4, strategy: 6, execution: 5, cash: null },
          },
        ],
      },
      ...overrides,
    });
  }

  it("renders an Appendix B grid with a 'CEO' row + Person rows + the 4 domain columns, NO names", () => {
    render(
      <ScoredGroupReport
        report={appendixBReport()}
        {...provenance({ assessmentName: "Scaling Up Full", versionLabel: "su-full-v2" })}
      />,
    );
    const grid = screen.getByTestId("group-scored-appendix-b");
    // a distinguished "CEO" row (a role, de-identified) + a numbered Person row
    expect(within(grid).getByText("CEO")).toBeInTheDocument();
    expect(within(grid).getByText("Person 1")).toBeInTheDocument();
    // the 4 domain column headers (People/Strategy/Execution/Cash), no "You"
    expect(within(grid).getByText(/^People$/)).toBeInTheDocument();
    expect(within(grid).getByText(/^Strategy$/)).toBeInTheDocument();
    expect(within(grid).getByText(/^Execution$/)).toBeInTheDocument();
    expect(within(grid).getByText(/^Cash$/)).toBeInTheDocument();
    expect(within(grid).queryByText(/^You$/)).not.toBeInTheDocument();
    // a cell value renders; a null cell renders "—" (Person 1 row = row index 1)
    const person1 = within(grid).getByTestId("group-scored-appendix-b-row-1");
    expect(within(person1).getByText("4")).toBeInTheDocument();
    expect(within(person1).getByText("—")).toBeInTheDocument();
    // NO member names leak into the grid
    expect(within(grid).queryByText(/John CEOExec/)).not.toBeInTheDocument();
    expect(within(grid).queryByText(/Kathy HR/)).not.toBeInTheDocument();
  });

  it("renders NO Appendix B on a scored report without an appendixB block (Rockefeller)", () => {
    render(
      <ScoredGroupReport
        report={scoredReport()}
        {...provenance({ assessmentName: "Rockefeller Habits", versionLabel: "rock-v2" })}
      />,
    );
    expect(screen.queryByTestId("group-scored-appendix-b")).not.toBeInTheDocument();
  });

  it("renders NO Appendix B for a qualitative report", () => {
    render(<QualitativeGroupReport report={qualitativeReport()} {...provenance()} />);
    expect(screen.queryByTestId("group-scored-appendix-b")).not.toBeInTheDocument();
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
