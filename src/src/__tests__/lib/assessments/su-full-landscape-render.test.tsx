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

const PEER_DISCLOSURE = "Peers shows the benchmark associated with your organizational phase when you completed this assessment. It is not matched by industry, geography, or a custom peer group.";
const HISTORICAL_PEER_DISCLOSURE = "Peers shows the historical benchmark used for this report. It is not matched by industry, geography, or a custom peer group.";
const LEGACY_FALSE_FREEZE_CLAIM = /frozen governed snapshot|peer values[^.]{0,120}frozen (?:when|at) (?:this result was )?scored/i;
const ENGINEERING_LANGUAGE = /governed|snapshot|sourceId|source id|catalogue|provenance|legacy baseline|phase-aware|esperto-five-phase-peers|esperto-controlled/i;

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

test.each([
  {
    label: "real respondent name",
    report: completeSuFullLandscapeReport(),
    introduction: "Dear Ari Founder, this report presents the Scaling Up Full results for Acme",
    people: "So, in your case Ari Founder, let's ask that key question",
    strategy: "Ari Founder, to have such a strong and effective strategy",
  },
  {
    label: "respondent email fallback",
    report: {
      ...completeSuFullLandscapeReport(),
      respondentName: "ari@example.com",
    },
    introduction: "This report presents the Scaling Up Full results for Acme",
    people: "So, in your case, let's ask that key question",
    strategy: "To have such a strong and effective strategy",
  },
] as const)("renders clean opener personalization for a $label", ({ report, introduction, people, strategy }) => {
  renderLandscape(report);

  const introductionOverview = document.querySelector(".su-full-introduction-overview");
  const peopleNarrative = screen.getByTestId("chapter-narrative-people");
  const strategyNarrative = screen.getByTestId("chapter-narrative-strategy");

  expect(introductionOverview).toHaveTextContent(introduction);
  expect(peopleNarrative).toHaveTextContent(people);
  expect(strategyNarrative).toHaveTextContent(strategy);

  if (report.respondentName === report.respondentEmail) {
    expect(introductionOverview).not.toHaveTextContent(report.respondentEmail!);
    expect(introductionOverview).not.toHaveTextContent(/^\s*Dear\b/);
    for (const narrative of screen.getAllByTestId(/^chapter-narrative-/)) {
      expect(narrative).not.toHaveTextContent(report.respondentEmail!);
      expect(narrative.textContent).not.toMatch(/\bin your case\s+,|^\s*,|\s{2,}/);
    }
  }
});

test("chooses profile deviation signs after rounding to one decimal place", () => {
  const report = completeSuFullLandscapeReport();
  const presentation = completeSuFullLandscapePresentation(report);
  const model = buildSuFullLandscapeReportModel({ report, presentation, resolvedStyle: "CLASSIC" });
  if (!model) throw new Error("The landscape fixture must build");
  const deviations = [0.16, -0.16, 0.04] as const;
  const profileRows = model.profileRows.map((row, index) => ({
    ...row,
    deviation: deviations[index] ?? row.deviation,
  }));

  render(<SuFullLandscapeReport report={report} model={{ ...model, profileRows }} />);

  const renderedRows = document.querySelectorAll(".su-full-landscape-profile-row--subsection");
  expect(renderedRows[0].lastElementChild).toHaveTextContent(/^\+0\.2$/);
  expect(renderedRows[1].lastElementChild).toHaveTextContent(/^-0\.2$/);
  expect(renderedRows[2].lastElementChild).toHaveTextContent(/^0\.0$/);
});

test("renders every detail card as question then You/Peers bars then the Esperto paragraph without an added heading", () => {
  const model = renderLandscape(reportForPhase(4));
  const question = model.chapters[0].questions[0];
  const detail = screen.getByTestId(`su-full-landscape-detail-${question.stableKey}`);

  expect(within(detail).getByText(question.label)).toBeVisible();
  expect(within(detail).getByText("You")).toBeVisible();
  expect(within(detail).getByText("Peers")).toBeVisible();
  const paragraph = detail.querySelector(".su-full-landscape-feedback");
  expect(paragraph).toHaveTextContent(question.recommendation!);
  expect(within(detail).queryByText("Frozen feedback", { selector: "strong" }))
    .not.toBeInTheDocument();
  expect(
    within(detail).getByText("Peers").compareDocumentPosition(
      paragraph!,
    ) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(within(detail).getByText("6.6")).toBeVisible();
});

test("renders plain-language benchmark and phase context on dashboard and detail pages", () => {
  renderLandscape(reportForPhase(4));

  expect(screen.getAllByText(PEER_DISCLOSURE).length).toBeGreaterThanOrEqual(2);
  expect(screen.getByTestId("su-full-landscape-page-6")).toHaveTextContent(
    "Phase 4 · Delegation",
  );
  expect(screen.getByTestId("su-full-landscape-page-8")).toHaveTextContent(PEER_DISCLOSURE);
  expect(screen.getByTestId("su-full-landscape-page-8")).toHaveTextContent(
    "Phase 4 · Delegation",
  );
  expect(screen.getAllByLabelText("Peer benchmark information").length).toBeGreaterThanOrEqual(2);
  expect(document.body).not.toHaveTextContent(ENGINEERING_LANGUAGE);
});

test("renders historical benchmark context without a phase or internal provenance claim", () => {
  renderLandscape(historicalReport());

  const dashboard = screen.getByTestId("su-full-landscape-page-6");
  expect(dashboard).toHaveTextContent(HISTORICAL_PEER_DISCLOSURE);
  expect(dashboard).not.toHaveTextContent(PEER_DISCLOSURE);
  expect(dashboard).not.toHaveTextContent(/selected by organizational phase|Phase [1-5]/i);
  expect(dashboard).toHaveTextContent("Historical benchmark");
  expect(dashboard).not.toHaveTextContent(ENGINEERING_LANGUAGE);
  expect(document.body).not.toHaveTextContent(LEGACY_FALSE_FREEZE_CLAIM);
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
