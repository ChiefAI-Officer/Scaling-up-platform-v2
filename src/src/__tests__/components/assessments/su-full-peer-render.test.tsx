import { render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { BrandedReport } from "@/components/assessments/BrandedReport";
import {
  completeSuFullPeerReport,
} from "@/__tests__/fixtures/su-full-peer";
import {
  completeSuFullLandscapePresentation,
  completeSuFullLandscapeReport,
} from "@/__tests__/fixtures/su-full-landscape";
import { buildSuFullPeerPresentationResult } from "@/lib/assessments/su-full-peer-presentation";
import { reviveOnScreenReport } from "@/lib/assessments/onscreen-result-store";
const LANDSCAPE_ENABLED = "NEXT_PUBLIC_WAVE_SU_FULL_LANDSCAPE_REPORT_ENABLED";
const LANDSCAPE_KILL = "NEXT_PUBLIC_WAVE_SU_FULL_LANDSCAPE_REPORT_KILL";
const savedLandscapeEnv: Record<string, string | undefined> = {};
const PEER_DISCLOSURE = "Peers shows the benchmark associated with your organizational phase when you completed this assessment. It is not matched by industry, geography, or a custom peer group.";
const HISTORICAL_PEER_DISCLOSURE = "Peers shows the historical benchmark used for this report. It is not matched by industry, geography, or a custom peer group.";
const ENGINEERING_LANGUAGE = /governed|snapshot|sourceId|source id|catalogue|provenance|legacy baseline|phase-aware|frozen|esperto-five-phase-peers|esperto-controlled/i;

beforeEach(() => {
  for (const key of [LANDSCAPE_ENABLED, LANDSCAPE_KILL]) {
    savedLandscapeEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of [LANDSCAPE_ENABLED, LANDSCAPE_KILL]) {
    if (savedLandscapeEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedLandscapeEnv[key];
  }
});

function suFullReportWithPeers() {
  const report = completeSuFullPeerReport();
  const q01 = report.result.perQuestion.find(
    (question) => question.stableKey === "Q01",
  );
  if (!q01) throw new Error("Q01 is required by the complete fixture");
  q01.value = 4;

  const built = buildSuFullPeerPresentationResult({
    report,
  });
  if (built.status !== "ready") throw new Error(built.reason);
  return { ...report, suFullPeerPresentation: built.presentation };
}

function presentationFor(report = completeSuFullPeerReport()) {
  const built = buildSuFullPeerPresentationResult({
    report,
  });
  if (built.status !== "ready") throw new Error(built.reason);
  return built.presentation;
}

function suFullLandscapeReportWithPeers() {
  const report = completeSuFullLandscapeReport();
  return {
    ...report,
    suFullPeerPresentation: completeSuFullLandscapePresentation(report),
  };
}

test("keeps the shipped Classic SU Full peer sequence while the landscape gate is OFF", () => {
  render(<BrandedReport report={suFullReportWithPeers()} />);

  const overview = screen.getByTestId(
    "su-full-peer-overview-S_PEOPLE_YE",
  );
  const q01Overview = within(overview).getByTestId(
    "su-full-peer-overview-row-Q01",
  );
  const overviewList = within(overview).getByRole("list");
  expect(within(overviewList).getAllByRole("listitem")).toHaveLength(8);
  expect(q01Overview).toHaveTextContent("You");
  expect(q01Overview).toHaveTextContent("4.0");
  expect(q01Overview).toHaveTextContent("Peers");
  expect(q01Overview).toHaveTextContent("6.3");

  const detail = screen.getByTestId("su-full-peer-detail-Q01");
  const bars = within(detail).getByTestId("su-full-peer-bars-Q01");
  const feedback = within(detail).getByTestId("su-full-peer-feedback-Q01");
  expect(
    bars.compareDocumentPosition(feedback) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(feedback).toHaveTextContent("Esperto feedback Q01");
  expect(within(feedback).queryByRole("heading")).not.toBeInTheDocument();
  expect(feedback.querySelector("p")).toHaveTextContent("Esperto feedback Q01");

  expect(screen.queryByTestId("report-sections")).not.toBeInTheDocument();
  expect(screen.getAllByText("Esperto feedback Q01")).toHaveLength(1);
});

test("renders the complete Classic SU Full peer report as the landscape composition when the gate is ON", () => {
  process.env[LANDSCAPE_ENABLED] = "1";
  render(<BrandedReport report={suFullLandscapeReportWithPeers()} contactEmail="coach@example.com" />);

  const landscape = screen.getByTestId("su-full-landscape-report");
  expect(landscape).toBeInTheDocument();
  expect(landscape.closest(".su-public-brand.su-report.su-full-landscape")).toBeInTheDocument();
  expect(screen.queryByTestId("su-full-peer-sequence")).not.toBeInTheDocument();
  expect(screen.queryByTestId("report-sections")).not.toBeInTheDocument();

  const chapterPolylines = [7, 11, 14, 19, 21].flatMap((number) =>
    Array.from(screen.getByTestId(`su-full-landscape-page-${number}`).querySelectorAll("polyline")),
  );
  const appendixPolylines = Array.from(
    screen.getByTestId("su-full-landscape-page-26").querySelectorAll("polyline"),
  );
  expect(chapterPolylines).toHaveLength(5);
  expect(appendixPolylines).toHaveLength(5);
  for (const polyline of [...chapterPolylines, ...appendixPolylines]) {
    expect(polyline).not.toHaveAttribute("stroke-dasharray");
  }

  const details = screen.getAllByTestId(/^su-full-landscape-detail-Q/);
  expect(details).toHaveLength(61);
  for (const detail of details) {
    const bars = within(detail).getByTestId(`su-landscape-detail-bars-${detail.dataset.questionKey}`);
    const paragraph = detail.querySelector(".su-full-landscape-feedback");
    expect(bars).toBeInTheDocument();
    expect(paragraph).toBeInTheDocument();
    expect(
      bars.compareDocumentPosition(paragraph!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(detail).queryByText("Frozen feedback", { selector: "strong" }))
      .not.toBeInTheDocument();
  }
});

test("keeps valid peers on the shipped sequence when landscape composition fails", () => {
  process.env[LANDSCAPE_ENABLED] = "1";
  const warning = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  const report = suFullReportWithPeers();
  render(<BrandedReport report={{ ...report, respondentName: "PII Name", respondentEmail: "pii@example.com" }} />);

  expect(screen.getByTestId("su-full-peer-sequence")).toBeInTheDocument();
  expect(screen.queryByTestId("su-full-landscape-report")).not.toBeInTheDocument();
  expect(screen.queryByTestId("report-sections")).not.toBeInTheDocument();
  expect(warning).toHaveBeenCalledTimes(1);
  expect(warning).toHaveBeenCalledWith("assessment.su_full_landscape.fallback", {
    reason: "INCOMPLETE_FROZEN_REPORT",
    resolvedStyle: "CLASSIC",
  });
  expect(JSON.stringify(warning.mock.calls)).not.toMatch(/PII Name|pii@example\.com|submission|campaign/i);
  warning.mockRestore();
});

test("renders landscape for stored unavailable style after it resolves to Classic", () => {
  process.env[LANDSCAPE_ENABLED] = "1";
  const report = suFullLandscapeReportWithPeers();
  const warning = jest.spyOn(console, "warn").mockImplementation(() => undefined);

  render(<BrandedReport report={{ ...report, reportStyle: "EXECUTIVE_BOARDROOM" }} />);

  expect(screen.getByTestId("su-full-landscape-report")).toBeInTheDocument();
  expect(warning).toHaveBeenCalledWith("assessment.report_style.fallback", expect.objectContaining({
    requestedStyle: "EXECUTIVE_BOARDROOM",
    resolvedStyle: "CLASSIC",
    fallbackReason: "UNAVAILABLE",
  }));
  warning.mockRestore();
});

test("scopes responsive and print-safe paired-bar styles to the SU report", () => {
  const css = readFileSync(
    join(process.cwd(), "src", "styles", "su-report.css"),
    "utf8",
  );

  expect(css).toMatch(
    /\.su-report \.su-peer-overview-row\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(12rem, 1\.4fr\) minmax\(11rem, 1fr\) auto;/,
  );
  expect(css).toMatch(
    /@media \(max-width:\s*720px\)[\s\S]*?\.su-report \.su-peer-overview-row\s*\{[^}]*grid-template-columns:\s*1fr;/,
  );
  expect(css).toMatch(
    /@media print[\s\S]*?\.su-report \.su-peer-overview\s*\{[^}]*break-before:\s*page;/,
  );
  expect(css).toMatch(
    /\.su-report \.su-peer-detail\s*\{[^}]*break-inside:\s*avoid;[^}]*page-break-inside:\s*avoid;/,
  );
  expect(css).toMatch(
    /\.su-report \.su-peer-fill\s*\{[^}]*print-color-adjust:\s*exact;[^}]*-webkit-print-color-adjust:\s*exact;/,
  );
});

test("keeps every overview and detail comparison explicit, identical, and independent while the gate is OFF", () => {
  const presentation = presentationFor();
  render(
    <BrandedReport
      report={{
        ...completeSuFullPeerReport(),
        suFullPeerPresentation: presentation,
      }}
    />,
  );

  const sequence = screen.getByTestId("su-full-peer-sequence");
  for (const section of presentation.sections) {
    const overview = within(sequence).getByTestId(
      `su-full-peer-overview-${section.stableKey}`,
    );
    for (const question of section.questions) {
      const expectedYou = question.you.toFixed(1);
      const expectedPeers = question.peers.toFixed(1);
      const overviewRow = within(overview).getByTestId(
        `su-full-peer-overview-row-${question.stableKey}`,
      );
      const detail = within(sequence).getByTestId(
        `su-full-peer-detail-${question.stableKey}`,
      );

      for (const surface of [overviewRow, detail]) {
        expect(surface).toHaveTextContent(question.label);
        expect(surface).toHaveTextContent("You");
        expect(surface).toHaveTextContent(expectedYou);
        expect(surface).toHaveTextContent("Peers");
        expect(surface).toHaveTextContent(expectedPeers);
        expect(surface.querySelectorAll(".su-peer-track[aria-hidden='true']"))
          .toHaveLength(2);
      }
    }
  }

});

test("omits blank stored feedback without inventing placeholder copy", () => {
  const report = completeSuFullPeerReport();
  const q01 = report.result.perQuestion.find(
    (question) => question.stableKey === "Q01",
  );
  if (!q01) throw new Error("Q01 is required by the complete fixture");
  q01.recommendation = "   ";

  render(
    <BrandedReport
      report={{ ...report, suFullPeerPresentation: presentationFor(report) }}
    />,
  );

  const detail = screen.getByTestId("su-full-peer-detail-Q01");
  expect(
    within(detail).queryByTestId("su-full-peer-feedback-Q01"),
  ).not.toBeInTheDocument();
  expect(detail).not.toHaveTextContent(/no feedback|not available/i);
});

test("renders historical benchmark context without internal provenance language", () => {
  render(<BrandedReport report={suFullReportWithPeers()} />);

  const disclosures = screen.getAllByTestId("su-full-peer-disclosure");
  expect(disclosures).toHaveLength(1);
  expect(disclosures[0]).toHaveTextContent(HISTORICAL_PEER_DISCLOSURE);
  expect(disclosures[0]).toHaveTextContent("Historical benchmark");
  expect(disclosures[0]).not.toHaveTextContent(PEER_DISCLOSURE);
  expect(disclosures[0]).not.toHaveTextContent(/selected by organizational phase|Phase [1-5]/i);
  expect(disclosures[0]).not.toHaveTextContent(ENGINEERING_LANGUAGE);
});

test("renders plain-language phase context in the shipped flag-off peer sequence", () => {
  render(<BrandedReport report={suFullLandscapeReportWithPeers()} />);

  const disclosure = screen.getByTestId("su-full-peer-disclosure");
  expect(disclosure).toHaveTextContent(PEER_DISCLOSURE);
  expect(disclosure).toHaveTextContent("Phase 4 · Delegation");
  expect(disclosure).not.toHaveTextContent(ENGINEERING_LANGUAGE);
});

test("omits generic peer UI when a coherent presentation is stale for the frozen report", () => {
  const report = completeSuFullLandscapeReport();
  const presentation = completeSuFullLandscapePresentation(report);
  const corruptedReport = {
    ...report,
    result: {
      ...report.result,
      perQuestion: report.result.perQuestion.map((question) => question.stableKey === "Q01"
        ? { ...question, peerValue: 6.5 }
        : question),
    },
    suFullPeerPresentation: presentation,
  };

  render(<BrandedReport report={corruptedReport} />);

  expect(screen.queryByTestId("su-full-peer-sequence")).not.toBeInTheDocument();
  expect(screen.queryByTestId("su-full-peer-disclosure")).not.toBeInTheDocument();
  expect(screen.getByTestId("report-sections")).toBeInTheDocument();
});

test.each([
  ["absent", undefined],
  ["null", null],
] as const)(
  "preserves generic sections and recommendations when the peer model is %s",
  (_label, suFullPeerPresentation) => {
    process.env[LANDSCAPE_ENABLED] = "1";
    render(
      <BrandedReport
        report={{
          ...completeSuFullPeerReport(),
          suFullPeerPresentation,
        }}
      />,
    );

    expect(screen.getByTestId("report-sections")).toBeInTheDocument();
    expect(screen.getByTestId("report-recommendations")).toHaveTextContent(
      "Esperto feedback Q01",
    );
    expect(screen.queryByTestId("su-full-peer-sequence")).not.toBeInTheDocument();
    expect(document.querySelector(".su-landscape-vertical-chart")).toBeNull();
  },
);

test("an invalid revived peer presentation falls back to the unchanged Classic report", () => {
  process.env[LANDSCAPE_ENABLED] = "1";
  const revived = reviveOnScreenReport({
    ...completeSuFullPeerReport(),
    suFullPeerPresentation: {
      benchmarkUpdatedAt: "2026-08-18T00:00:00.000Z",
      sections: [],
    },
  });
  if (!revived) throw new Error("the base report must remain available");

  render(<BrandedReport report={revived} />);

  expect(screen.getByTestId("report-sections")).toBeInTheDocument();
  expect(screen.getByTestId("report-recommendations")).toHaveTextContent(
    "Esperto feedback Q01",
  );
  expect(screen.queryByTestId("su-full-peer-sequence")).not.toBeInTheDocument();
  expect(document.querySelector(".su-landscape-vertical-chart")).toBeNull();
});
