import { render, screen, within } from "@testing-library/react";

import { LegacyClassicReport } from "@/components/assessments/BrandedReport";
import { SuFullLandscapeReport } from "@/components/assessments/su-full-landscape/SuFullLandscapeReport";
import {
  completeSuFullLandscapePresentation,
  completeSuFullLandscapeReport,
} from "@/__tests__/fixtures/su-full-landscape";
import { buildSuFullLandscapeReportModel } from "@/lib/assessments/su-full-landscape-report";
import {
  SU_FULL_PHASE_PEER_CONTENT_HASHES,
  SU_FULL_PHASE_PEER_SOURCE_ID,
  getGovernedPeerValue,
} from "@/lib/assessments/su-full-phase-peer-catalogue";
import type { GrowthPhaseNumber } from "@/lib/assessments/su-full-phase";
import { SU_FULL_LEGACY_PEER_SOURCE_ID } from "@/lib/assessments/su-full-question-benchmarks";

const PEER_DISCLOSURE = "Peers are a governed benchmark snapshot selected by organizational phase and frozen when this result was scored. This is not an industry-, geography-, or cohort-matched comparison.";

function reportForPhase(phase: GrowthPhaseNumber) {
  const report = completeSuFullLandscapeReport();
  return {
    ...report,
    result: {
      ...report.result,
      recommendationPhase: phase,
      peerBenchmarkSnapshot: {
        sourceId: SU_FULL_PHASE_PEER_SOURCE_ID,
        contentHash: SU_FULL_PHASE_PEER_CONTENT_HASHES[phase],
        phase,
      },
      perQuestion: report.result.perQuestion.map((question) => ({
        ...question,
        peerValue: getGovernedPeerValue(question.stableKey, phase) ?? undefined,
      })),
    },
  };
}

function historicalReport() {
  const report = completeSuFullLandscapeReport();
  return {
    ...report,
    result: {
      ...report.result,
      peerBenchmarkSnapshot: undefined,
      perQuestion: report.result.perQuestion.map((question) => {
        const historicalQuestion = { ...question };
        delete historicalQuestion.peerValue;
        return historicalQuestion;
      }),
    },
  };
}

function renderLandscape(report = completeSuFullLandscapeReport()) {
  const presentation = completeSuFullLandscapePresentation(report);
  const model = buildSuFullLandscapeReportModel({ report, presentation, resolvedStyle: "CLASSIC" });
  if (!model) throw new Error("The landscape fixture must build");
  render(<SuFullLandscapeReport report={report} model={model} />);
  return model;
}

test("renders every detail card as question then explicit You/Peers bars then frozen feedback", () => {
  const model = renderLandscape(reportForPhase(4));
  const question = model.chapters[0].questions[0];
  const detail = screen.getByTestId(`su-full-landscape-detail-${question.stableKey}`);

  expect(within(detail).getByText(question.label)).toBeVisible();
  expect(within(detail).getByText("You")).toBeVisible();
  expect(within(detail).getByText("Peers")).toBeVisible();
  expect(within(detail).getByText("Frozen feedback")).toBeVisible();
  expect(
    within(detail).getByText("Peers").compareDocumentPosition(
      within(detail).getByText("Frozen feedback"),
    ) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(within(detail).getByText("6.6")).toBeVisible();
});

test("renders the exact governed disclosure and subordinate phase provenance on dashboard and detail pages", () => {
  renderLandscape(reportForPhase(4));

  expect(screen.getAllByText(PEER_DISCLOSURE).length).toBeGreaterThanOrEqual(2);
  expect(screen.getByTestId("su-full-landscape-page-6")).toHaveTextContent(
    `Phase P4 · ${SU_FULL_PHASE_PEER_SOURCE_ID}`,
  );
  expect(screen.getByTestId("su-full-landscape-page-8")).toHaveTextContent(PEER_DISCLOSURE);
  expect(screen.getByTestId("su-full-landscape-page-8")).toHaveTextContent(
    `Phase P4 · ${SU_FULL_PHASE_PEER_SOURCE_ID}`,
  );
  expect(document.body).not.toHaveTextContent("current benchmark reference");
});

test("renders legacy provenance truthfully without a phase claim", () => {
  renderLandscape(historicalReport());

  const dashboard = screen.getByTestId("su-full-landscape-page-6");
  expect(dashboard).toHaveTextContent(`Legacy baseline · ${SU_FULL_LEGACY_PEER_SOURCE_ID}`);
  expect(dashboard).not.toHaveTextContent(/Phase P[1-5]/);
});

test.each([
  [3, "6.3"],
  [4, "6.6"],
  [5, "6.3"],
] as const)("renders the frozen P%i Q01 peer value %s", (phase, peerValue) => {
  renderLandscape(reportForPhase(phase));

  const bars = screen.getByTestId("su-landscape-detail-bars-Q01");
  expect(within(bars).getByText(peerValue)).toBeVisible();
});

test("omits all peer UI and provenance when the presentation is unavailable", () => {
  const savedEnabled = process.env.NEXT_PUBLIC_WAVE_SU_FULL_LANDSCAPE_REPORT_ENABLED;
  const savedKill = process.env.NEXT_PUBLIC_WAVE_SU_FULL_LANDSCAPE_REPORT_KILL;
  process.env.NEXT_PUBLIC_WAVE_SU_FULL_LANDSCAPE_REPORT_ENABLED = "1";
  delete process.env.NEXT_PUBLIC_WAVE_SU_FULL_LANDSCAPE_REPORT_KILL;
  const report = reportForPhase(4);
  try {
    render(
      <LegacyClassicReport
        report={{
          ...report,
          suFullPeerPresentation: {
            provenance: {
              sourceId: SU_FULL_PHASE_PEER_SOURCE_ID,
              contentHash: SU_FULL_PHASE_PEER_CONTENT_HASHES[4],
              phase: 4,
              legacy: false,
            },
            sections: [],
          },
        }}
      />,
    );

    expect(screen.queryByTestId("su-full-landscape-report")).not.toBeInTheDocument();
    expect(screen.queryByTestId("su-full-peer-sequence")).not.toBeInTheDocument();
    expect(screen.queryByText(PEER_DISCLOSURE)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(SU_FULL_PHASE_PEER_SOURCE_ID);
  } finally {
    if (savedEnabled === undefined) delete process.env.NEXT_PUBLIC_WAVE_SU_FULL_LANDSCAPE_REPORT_ENABLED;
    else process.env.NEXT_PUBLIC_WAVE_SU_FULL_LANDSCAPE_REPORT_ENABLED = savedEnabled;
    if (savedKill === undefined) delete process.env.NEXT_PUBLIC_WAVE_SU_FULL_LANDSCAPE_REPORT_KILL;
    else process.env.NEXT_PUBLIC_WAVE_SU_FULL_LANDSCAPE_REPORT_KILL = savedKill;
  }
});
