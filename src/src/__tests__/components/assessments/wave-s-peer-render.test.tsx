/**
 * Wave S (Jeff #12/#13) — peer-benchmark RENDER tests, both surfaces:
 *
 *   1. QualitativeGroupReport — a rating factor with `peers`/`devPeers` gains a
 *      "Peers N.N" cell + ▲/▼/● deviation inside its existing row; factors
 *      without peers render exactly as before (omit-empty, D8).
 *   2. QualitativeReport — the optional `peerComparison` prop renders the
 *      "compared to peers" section in S3's natural slot (immediately before
 *      S4_obstacles; appended when no S4 section exists — D13); prop absent ⇒
 *      no section (the Esperto-faithful suppression stays untouched, D4).
 *
 * Fixtures mirror group-report-render.test.tsx / qualitative-report.test.tsx.
 */

import { render, screen, within } from "@testing-library/react";
import { QualitativeGroupReport } from "@/components/assessments/QualitativeGroupReport";
import type { CampaignGroupReport } from "@/lib/assessments/group-report-model";
import type { GroupReportProvenance } from "@/components/assessments/GroupReport";
import { QualitativeReport } from "@/components/assessments/QualitativeReport";
import type { RespondentReport } from "@/lib/assessments/respondent-report";
import type { ScoreResult } from "@/lib/assessments/scoring";
import type { PeerComparisonSection } from "@/lib/assessments/peer-benchmarks";

// ── Group surface ─────────────────────────────────────────────────────────────

function provenance(): GroupReportProvenance {
  return {
    assessmentName: "Leadership Vision Alignment",
    companyName: "Acme Corp",
    generatedAt: new Date("2026-07-03T10:00:00Z"),
    completedCount: 2,
    invitedCount: 2,
    versionLabel: "lva-v2",
    ceoName: "John CEOExec",
  };
}

function groupReport(factors: unknown[]): CampaignGroupReport {
  return {
    reportType: "qualitative",
    provenance: { groupRenderVersion: "lva-fidelity-v2", scaleDegraded: false },
    respondents: [
      { respondentId: "r1", name: "John CEOExec", jobTitle: "CEO", isCEO: true, isOrphan: false },
      { respondentId: "r2", name: "Kathy HR", jobTitle: "HR", isCEO: false, isOrphan: false },
    ],
    respondentCount: 2,
    degraded: false,
    questionsByKey: {},
    answersByRespondent: new Map(),
    qualitative: {
      sections: [
        {
          stableKey: "S3_strengths",
          name: "Organizational Strengths and Weaknesses",
          presentation: "rating",
          factors,
        },
      ],
    },
  } as unknown as CampaignGroupReport;
}

const FACTOR_BASE = { strong: 1, avg: 1, weak: 0, mean: 2.5, n: 2 };

describe("Wave S — group rating rows", () => {
  it("renders Peers value + ▲ for a positive deviation", () => {
    render(
      <QualitativeGroupReport
        report={groupReport([
          { stableKey: "S3_culture", label: "Culture", ...FACTOR_BASE, scaledValue: 7.5, peers: 6.0, devPeers: 1.5 },
        ])}
        {...provenance()}
      />,
    );
    const peers = screen.getByTestId("group-rating-peers-S3_culture");
    expect(peers).toHaveTextContent("Peers");
    expect(peers).toHaveTextContent("6.0");
    const dev = screen.getByTestId("group-rating-devpeers-S3_culture");
    expect(dev).toHaveTextContent("▲");
    expect(dev).toHaveTextContent("+1.5");
    expect(dev.className).not.toContain("neg");
  });

  it("renders ▼ with the `neg` class for a negative deviation, ● for zero", () => {
    render(
      <QualitativeGroupReport
        report={groupReport([
          { stableKey: "S3_cash", label: "Cash", ...FACTOR_BASE, scaledValue: 2.5, peers: 7.8, devPeers: -5.3 },
          { stableKey: "S3_sales", label: "Sales", ...FACTOR_BASE, scaledValue: 5.0, peers: 5.0, devPeers: 0 },
        ])}
        {...provenance()}
      />,
    );
    const down = screen.getByTestId("group-rating-devpeers-S3_cash");
    expect(down).toHaveTextContent("▼");
    expect(down).toHaveTextContent("−5.3");
    expect(down.className).toContain("neg");
    const flat = screen.getByTestId("group-rating-devpeers-S3_sales");
    expect(flat).toHaveTextContent("●");
    expect(flat).toHaveTextContent("0.0");
    expect(flat.className).not.toContain("neg");
  });

  it("a factor WITHOUT peers renders exactly as before (no peers cell, 4-col row)", () => {
    render(
      <QualitativeGroupReport
        report={groupReport([
          { stableKey: "S3_culture", label: "Culture", ...FACTOR_BASE, scaledValue: 7.5 },
        ])}
        {...provenance()}
      />,
    );
    expect(screen.queryByTestId("group-rating-peers-S3_culture")).toBeNull();
    const row = screen.getByTestId("group-rating-factor-S3_culture");
    expect(row.className).not.toContain("has-peers");
    expect(within(row).getByText("7.5")).toBeInTheDocument();
  });
});

// ── Individual surface ────────────────────────────────────────────────────────

function baseReport(overrides: Partial<RespondentReport> = {}): RespondentReport {
  return {
    respondentName: "John CEOExec",
    jobTitle: "CEO",
    companyName: "Northwind Logistics",
    assessmentName: "Leadership Vision Alignment",
    templateAlias: "leadership-vision-alignment",
    campaignLabel: null,
    submittedAt: new Date("2026-04-30T10:00:00Z"),
    result: {} as ScoreResult,
    sections: [],
    questionByKey: {},
    questionsByKey: {},
    rawAnswers: [],
    scoringConfig: {},
    provenance: {
      submissionId: "sub-123",
      versionId: "ver-456",
      contentHash: "abcdef0123456789",
      templateName: "Leadership Vision Alignment",
    },
    degraded: false,
    ...overrides,
  } as RespondentReport;
}

/** Vision (S2) + obstacles (S4) sections so the splice position is observable. */
function lvaReport(): RespondentReport {
  return baseReport({
    sections: [
      { stableKey: "S2_vision", name: "The Vision on the Future" },
      { stableKey: "S4_obstacles", name: "Biggest Obstacles" },
    ],
    questionsByKey: {
      S2_goal: { type: "TEXT", label: "What is the goal?", sectionStableKey: "S2_vision" },
      S4_biggest_obstacles: {
        type: "MULTI_CHOICE",
        label: "What are the biggest obstacles?",
        sectionStableKey: "S4_obstacles",
        options: [{ key: "culture", label: "Culture" }],
      },
    },
    rawAnswers: [
      { stableKey: "S2_goal", value: "Grow 3x" },
      { stableKey: "S4_biggest_obstacles", value: ["culture"] },
    ],
  });
}

const PEER_SECTION: PeerComparisonSection = {
  sectionKey: "S3_strengths",
  title: "Organizational Strengths and Weaknesses — compared to peers",
  intro:
    "Your rating per factor next to the peer average (companies that have preceded you in this assessment).",
  items: [
    { stableKey: "S3_culture", label: "Culture", ownRating: "Strong", ownValue: 10, peers: 6.3, dev: 3.7 },
    { stableKey: "S3_cash", label: "Cash", ownRating: "Weak", ownValue: 0, peers: 7.8, dev: -7.8 },
  ],
};

describe("Wave S — individual peer-comparison section", () => {
  it("responsive peers table has the named focusable bounded scroll owner and defaults off", () => {
    const { rerender } = render(
      <QualitativeReport report={lvaReport()} peerComparison={PEER_SECTION} />,
    );
    expect(screen.queryByRole("region", { name: "Peer comparison table" })).toBeNull();
    rerender(
      <QualitativeReport report={lvaReport()} peerComparison={PEER_SECTION} responsiveEnabled />,
    );
    const region = screen.getByRole("region", { name: "Peer comparison table" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toHaveClass("su-report-data-region");
    expect(within(region).getByRole("table")).toBeInTheDocument();
  });

  it("prop absent ⇒ no peer section (Esperto-faithful suppression untouched)", () => {
    render(<QualitativeReport report={lvaReport()} />);
    expect(screen.queryByTestId("qual-section-peer-comparison")).toBeNull();
  });

  it("renders in S3's natural slot: immediately BEFORE the S4_obstacles section", () => {
    render(<QualitativeReport report={lvaReport()} peerComparison={PEER_SECTION} />);
    const peer = screen.getByTestId("qual-section-peer-comparison");
    const obstacles = screen.getByTestId("qual-section-S4_obstacles");
    const vision = screen.getByTestId("qual-section-S2_vision");
    // vision < peer < obstacles in document order.
    expect(vision.compareDocumentPosition(peer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(peer.compareDocumentPosition(obstacles) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("appends after the last section when no S4_obstacles section exists", () => {
    const report = lvaReport();
    report.sections = [{ stableKey: "S2_vision", name: "The Vision on the Future" }];
    report.rawAnswers = [{ stableKey: "S2_goal", value: "Grow 3x" }];
    render(<QualitativeReport report={report} peerComparison={PEER_SECTION} />);
    const peer = screen.getByTestId("qual-section-peer-comparison");
    const vision = screen.getByTestId("qual-section-S2_vision");
    expect(vision.compareDocumentPosition(peer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders title, intro, and per-factor rows (rating word, own value, peers, deviation)", () => {
    render(<QualitativeReport report={lvaReport()} peerComparison={PEER_SECTION} />);
    expect(
      screen.getByText("Organizational Strengths and Weaknesses — compared to peers"),
    ).toBeInTheDocument();
    const culture = screen.getByTestId("peer-comparison-row-S3_culture");
    expect(culture).toHaveTextContent("Culture");
    expect(culture).toHaveTextContent("Strong");
    expect(culture).toHaveTextContent("(10.0)");
    expect(culture).toHaveTextContent("6.3");
    const cultureDev = screen.getByTestId("peer-comparison-dev-S3_culture");
    expect(cultureDev).toHaveTextContent("▲");
    expect(cultureDev).toHaveTextContent("+3.7");
    expect(cultureDev.className).not.toContain("neg");
    const cashDev = screen.getByTestId("peer-comparison-dev-S3_cash");
    expect(cashDev).toHaveTextContent("▼");
    expect(cashDev).toHaveTextContent("−7.8");
    expect(cashDev.className).toContain("neg");
  });
});
