import { render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { BrandedReport } from "@/components/assessments/BrandedReport";
import {
  completeSuFullBenchmarkRows,
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
    benchmarks: completeSuFullBenchmarkRows(),
  });
  if (built.status !== "ready") throw new Error(built.reason);
  return { ...report, suFullPeerPresentation: built.presentation };
}

function presentationFor(report = completeSuFullPeerReport()) {
  const built = buildSuFullPeerPresentationResult({
    report,
    benchmarks: completeSuFullBenchmarkRows(),
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
  expect(feedback).toHaveTextContent("Frozen feedback Q01");

  expect(screen.queryByTestId("report-sections")).not.toBeInTheDocument();
  expect(screen.getAllByText("Frozen feedback Q01")).toHaveLength(1);
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
    expect(within(detail).getByTestId(`su-landscape-detail-bars-${detail.dataset.questionKey}`)).toBeInTheDocument();
    expect(detail).toHaveTextContent("Frozen feedback");
  }
});

test("keeps valid peers on the shipped sequence when landscape composition fails", () => {
  process.env[LANDSCAPE_ENABLED] = "1";
  render(<BrandedReport report={suFullReportWithPeers()} />);

  expect(screen.getByTestId("su-full-peer-sequence")).toBeInTheDocument();
  expect(screen.queryByTestId("su-full-landscape-report")).not.toBeInTheDocument();
  expect(screen.queryByTestId("report-sections")).not.toBeInTheDocument();
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

test("omits blank frozen feedback without inventing placeholder copy", () => {
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

test("renders one benchmark disclosure with the latest update date", () => {
  render(<BrandedReport report={suFullReportWithPeers()} />);

  const disclosures = screen.getAllByTestId("su-full-peer-disclosure");
  expect(disclosures).toHaveLength(1);
  expect(disclosures[0]).toHaveTextContent(
    "Last updated August 18, 2026.",
  );
  expect(disclosures[0]).toHaveTextContent(
    "not yet matched to company size, growth phase, geography, or industry",
  );
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
      "Frozen feedback Q01",
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
    "Frozen feedback Q01",
  );
  expect(screen.queryByTestId("su-full-peer-sequence")).not.toBeInTheDocument();
  expect(document.querySelector(".su-landscape-vertical-chart")).toBeNull();
});
