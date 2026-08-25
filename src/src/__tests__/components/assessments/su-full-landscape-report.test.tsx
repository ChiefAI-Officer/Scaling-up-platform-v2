import { render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  SuFullDetailPairedBars,
  SuFullVerticalPeerChart,
} from "@/components/assessments/su-full-landscape/SuFullLandscapeCharts";
import { SuFullLandscapeReport } from "@/components/assessments/su-full-landscape/SuFullLandscapeReport";
import {
  completeSuFullLandscapePresentation,
  completeSuFullLandscapeReport,
  restoredScalingUpFullCtaReport,
} from "@/__tests__/fixtures/su-full-landscape";
import { buildSuFullLandscapeReportModel } from "@/lib/assessments/su-full-landscape-report";

function peopleQuestions() {
  const report = completeSuFullLandscapeReport();
  const presentation = completeSuFullLandscapePresentation(report);
  const model = buildSuFullLandscapeReportModel({ report, presentation, resolvedStyle: "CLASSIC" });
  if (!model) throw new Error("The canonical landscape fixture must build");
  return model.chapters.find((chapter) => chapter.key === "people")!.questions;
}

test("renders one accessible semantic row and one decorative peer contour per chapter", () => {
  const questions = peopleQuestions();

  render(<SuFullVerticalPeerChart chapterKey="people" questions={questions} />);

  const vertical = screen.getByTestId("su-landscape-vertical-chart-people");
  expect(within(vertical).getAllByRole("listitem")).toHaveLength(13);
  expect(vertical.querySelectorAll("polyline")).toHaveLength(1);
  expect(vertical.querySelector("[stroke-dasharray]")).toBeNull();
  expect(within(vertical).getByText("Score of Peers")).toBeVisible();
  const q01Row = within(vertical).getByTestId("su-landscape-vertical-row-Q01");
  expect(within(q01Row).getByText("0.0")).toBeVisible();
  expect(within(vertical).getByText(/You 0\.0\. Peers 6\.6\./)).toBeInTheDocument();
});

test("renders detail paired bars in You then Peers order with visible values", () => {
  const question = peopleQuestions()[0];

  render(<SuFullDetailPairedBars chapterKey="people" question={question} />);

  const detail = screen.getByTestId("su-landscape-detail-bars-Q01");
  expect(detail).toHaveTextContent("You");
  expect(detail).toHaveTextContent("Peers");
  expect(detail.querySelectorAll(".su-full-landscape-bar-fill")).toHaveLength(2);
  expect(detail.textContent?.indexOf("You")).toBeLessThan(detail.textContent?.indexOf("Peers") ?? -1);
  expect(detail).toHaveTextContent("0.0");
  expect(detail).toHaveTextContent("6.6");
});

test("renders the authored 25-page landscape composition without rejected pages", () => {
  const report = restoredScalingUpFullCtaReport();
  const presentation = completeSuFullLandscapePresentation(report);
  const model = buildSuFullLandscapeReportModel({ report, presentation, resolvedStyle: "CLASSIC" });
  if (!model) throw new Error("The canonical landscape fixture must build");

  render(
    <SuFullLandscapeReport
      report={{ ...report, coachLogoUrl: "https://images.example/coach.png", coachName: "Coach Example" }}
      model={model}
      contactEmail="coach@example.com"
    />,
  );

  const pages = screen.getAllByTestId(/^su-full-landscape-page-/);
  expect(pages).toHaveLength(25);
  expect(pages.map((page) => page.dataset.pageNumber)).toEqual(
    Array.from({ length: 25 }, (_, index) => String(index + 1)),
  );
  expect(screen.queryByRole("heading", { name: "Welcome" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Peers and comparisons" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("Verne Harnish preface")).toBeInTheDocument();
  for (const number of [6, 10, 13, 18, 20]) {
    expect(screen.getByTestId(`su-full-landscape-page-${number}`))
      .toHaveTextContent("Score of Peers");
  }
  const appendix = screen.getByTestId("su-full-landscape-page-25");
  expect(appendix.querySelectorAll("polyline")).toHaveLength(5);
  expect(appendix.querySelectorAll(".su-full-landscape-chart-row")).toHaveLength(61);
  for (const question of model.chapters.flatMap((chapter) => chapter.questions)) {
    expect(appendix).toHaveTextContent(question.label);
  }
  expect(document.querySelectorAll(".su-full-landscape-peer-contour")).toHaveLength(10);
  expect(document.querySelectorAll(".su-full-landscape-peer-contour[stroke-dasharray]")).toHaveLength(0);
  expect(screen.getByTestId("su-full-landscape-page-1")).toHaveTextContent("Coach Example");
  const cover = screen.getByTestId("su-full-landscape-page-1");
  expect(within(cover).getByRole("img", { name: "Scaling Up" })).toHaveAttribute(
    "src",
    "/brand/su-logo-white.svg",
  );
  expect(cover).toHaveTextContent("Report for: Ari Founder · CEO");
  expect(cover).toHaveTextContent("Acme · 17 August 2026");
  expect(screen.getAllByTestId("coach-name")).toHaveLength(26);
  expect(screen.getAllByTestId("coach-logo")).toHaveLength(26);
  const chapterKeyItems = screen.getByTestId("su-full-landscape-page-3")
    .querySelectorAll(".su-full-landscape-chapter-key li");
  const contents = screen.getByTestId("su-full-landscape-page-3");
  expect(contents).toHaveTextContent("People 6");
  expect(contents).toHaveTextContent("Your Employees (7–8)");
  expect(contents).toHaveTextContent("Appendix A: chapter comparisons 25");
  expect(chapterKeyItems).toHaveLength(5);
  expect(Array.from(chapterKeyItems).map((item) => item.className)).toEqual([
    "is-people", "is-strategy", "is-execution", "is-cash", "is-you",
  ]);
  const chartTitleIds = Array.from(
    document.querySelectorAll<HTMLElement>("[aria-labelledby^=\"su-landscape-vertical-chart-title-\"]"),
  ).map((chart) => chart.getAttribute("aria-labelledby"));
  expect(new Set(chartTitleIds).size).toBe(chartTitleIds.length);
  expect(screen.getByTestId("su-full-landscape-page-6")).toHaveClass("su-full-landscape-page--chapter");
  expect(screen.getByTestId("su-full-landscape-page-7")).toHaveClass("su-full-landscape-page--detail");
  expect(screen.getByTestId("su-full-landscape-page-25")).toHaveClass("su-full-landscape-page--appendix");
  expect(screen.getAllByTestId(/^su-full-landscape-detail-Q/)).toHaveLength(61);

  expect(screen.getByTestId("su-full-landscape-page-4")).toHaveTextContent(
    "Phase 4 from FTE 12",
  );
  expect(screen.getByTestId("su-full-landscape-page-5")).toHaveTextContent("You");
  expect(screen.getByTestId("su-full-landscape-page-5")).toHaveTextContent("Peers");
  expect(screen.getByTestId("su-full-landscape-page-5")).toHaveTextContent("Deviation");
  expect(screen.getByTestId("su-full-landscape-page-5").querySelectorAll("tbody tr")).toHaveLength(15);
  expect(screen.getByTestId("su-full-landscape-page-5").querySelectorAll(".su-full-landscape-profile-row--chapter")).toHaveLength(5);
  expect(screen.getByTestId("su-full-landscape-page-5").querySelectorAll(".su-full-landscape-profile-row--subsection")).toHaveLength(10);
  expect(screen.getAllByLabelText("Peer benchmark information").length).toBeGreaterThanOrEqual(2);

  for (const detail of screen.getAllByTestId(/^su-full-landscape-detail-Q/)) {
    const bars = within(detail).getByTestId(
      `su-landscape-detail-bars-${detail.dataset.questionKey}`,
    );
    const paragraph = detail.querySelector(".su-full-landscape-feedback");
    expect(
      detail.compareDocumentPosition(bars) & Node.DOCUMENT_POSITION_CONTAINED_BY,
    ).toBe(Node.DOCUMENT_POSITION_CONTAINED_BY);
    expect(paragraph).toBeInTheDocument();
    expect(within(detail).getByText("Peers").compareDocumentPosition(
      paragraph!,
    ) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(detail).queryByText("Frozen feedback", { selector: "strong" }))
      .not.toBeInTheDocument();
    const question = model.chapters.flatMap((chapter) => chapter.questions)
      .find((candidate) => candidate.stableKey === detail.dataset.questionKey);
    if (!question) throw new Error(`Missing fixture question ${detail.dataset.questionKey}`);
    expect(detail).toHaveTextContent(question.recommendation!);
  }

  expect(screen.getByTestId("su-full-landscape-page-24")).toHaveTextContent("ScaleUp Score");
  expect(screen.getByTestId("su-full-landscape-page-4")).toHaveTextContent("55 / 100");
  expect(screen.getByTestId("su-full-landscape-page-24")).toHaveTextContent("55 / 100");
  expect(screen.getByRole("link", { name: "Request a complimentary follow-up" }))
    .toHaveAttribute("href", "https://coaches.scalingup.com/coach-match-after-assessment-form");
  expect(screen.getByTestId("su-full-landscape-page-24")).toHaveTextContent("Next step");
  expect(document.body.textContent).not.toMatch(/TCPDF/i);
});

test("falls back to the frozen referring coach email when no explicit contact is supplied", () => {
  const report = { ...completeSuFullLandscapeReport(), referringCoachEmail: "referrer@example.com" };
  const presentation = completeSuFullLandscapePresentation(report);
  const model = buildSuFullLandscapeReportModel({ report, presentation, resolvedStyle: "CLASSIC" });
  if (!model) throw new Error("The canonical landscape fixture must build");

  render(<SuFullLandscapeReport report={report} model={model} />);

  expect(screen.getByRole("link", { name: "Contact your coach" }))
    .toHaveAttribute("href", "mailto:referrer@example.com");
});

test("preserves the authored preface and respondent summary before a custom closing message", () => {
  const report = {
    ...completeSuFullLandscapeReport(),
    reportHtml: {
      introductionHtml: "<h2>Landscape custom introduction</h2>",
    conclusionHtml: "<h2>Custom closing message</h2>",
    },
  };
  const presentation = completeSuFullLandscapePresentation(report);
  const model = buildSuFullLandscapeReportModel({ report, presentation, resolvedStyle: "CLASSIC" });
  if (!model) throw new Error("The canonical landscape fixture must build");

  render(<SuFullLandscapeReport report={report} model={model} />);

  expect(screen.getByTestId("su-full-landscape-page-2")).toHaveTextContent(
    "Landscape custom introduction",
  );
  expect(screen.getByTestId("su-full-landscape-page-2")).not.toHaveTextContent(
    "This report turns your submitted assessment",
  );
  const page24 = screen.getByTestId("su-full-landscape-page-24");
  expect(page24).toHaveTextContent("ScaleUp Score");
  expect(page24).toHaveTextContent("55 / 100");
  expect(page24).toHaveTextContent("Your strongest chapter is");
  expect(page24).toHaveTextContent("Your focus chapter is");
  expect(page24).toHaveTextContent("Custom closing message");
  expect(page24).not.toHaveTextContent("Choose one priority from the feedback");
  expect(screen.getAllByTestId(/^su-full-landscape-page-/)).toHaveLength(25);
});

test("personalizes escaped respondent and company tokens in authored report HTML", () => {
  const report = {
    ...completeSuFullLandscapeReport(),
    respondentName: "Ari <Founder> & Team",
    companyName: "Acme & Sons",
    reportHtml: {
      introductionHtml: "<p>Dear {{respondentName}},</p><p>For {{companyName}}</p>",
      conclusionHtml: null,
    },
  };
  const presentation = completeSuFullLandscapePresentation(report);
  const model = buildSuFullLandscapeReportModel({ report, presentation, resolvedStyle: "CLASSIC" });
  if (!model) throw new Error("The canonical landscape fixture must build");

  render(<SuFullLandscapeReport report={report} model={model} />);

  const preface = screen.getByTestId("report-html-introduction");
  expect(preface).toHaveTextContent("Dear Ari <Founder> & Team,");
  expect(preface).toHaveTextContent("For Acme & Sons");
  expect(preface.querySelector("founder")).toBeNull();
});

test("keeps Classic cover fallbacks for duplicate campaign titles and email-only identities", () => {
  const source = completeSuFullLandscapeReport();
  const report = {
    ...source,
    campaignLabel: source.assessmentName,
    respondentName: "ari@example.com",
    respondentEmail: "ARI@example.com",
  };
  const presentation = completeSuFullLandscapePresentation(report);
  const model = buildSuFullLandscapeReportModel({ report, presentation, resolvedStyle: "CLASSIC" });
  if (!model) throw new Error("The canonical landscape fixture must build");

  render(<SuFullLandscapeReport report={report} model={model} />);

  const cover = screen.getByTestId("su-full-landscape-page-1");
  expect(within(cover).getAllByText(report.assessmentName)).toHaveLength(1);
  expect(cover).not.toHaveTextContent("Report for:");
  expect(cover).toHaveTextContent("Email: ARI@example.com");
});

test("keeps generated add-ons before the landscape conclusion without adding a page", () => {
  const report = {
    ...completeSuFullLandscapeReport(),
    reportHtml: {
      introductionHtml: null,
      conclusionHtml: "<h2>Landscape custom conclusion</h2>",
    },
  };
  const presentation = completeSuFullLandscapePresentation(report);
  const model = buildSuFullLandscapeReportModel({ report, presentation, resolvedStyle: "CLASSIC" });
  if (!model) throw new Error("The canonical landscape fixture must build");

  render(
    <SuFullLandscapeReport
      report={report}
      model={model}
      beforeConclusion={<aside data-testid="generated-addon">Score guide</aside>}
    />,
  );

  const page = screen.getByTestId("su-full-landscape-page-23");
  const addon = screen.getByTestId("generated-addon");
  const conclusion = screen.getByTestId("report-html-conclusion");
  expect(page).toContainElement(addon);
  expect(
    addon.compareDocumentPosition(conclusion) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Welcome" })).not.toBeInTheDocument();
  expect(screen.getAllByTestId(/^su-full-landscape-page-/)).toHaveLength(24);
});

test("keeps the landscape renderer's A4 print and responsive screen contract scoped", () => {
  const stylesheet = readFileSync(
    join(process.cwd(), "src", "styles", "su-report.css"),
    "utf8",
  );

  expect(stylesheet).toContain("@page suFullLandscape { size: A4 landscape; margin: 0; }");
  expect(stylesheet).toMatch(/\.su-public-brand\.su-report\.su-full-landscape\s*\{[^}]*page: suFullLandscape;/);
  expect(stylesheet).toMatch(/\.su-full-landscape-page \{[^}]*break-before: page;[^}]*break-after: page;[^}]*break-inside: avoid;/);
  expect(stylesheet).not.toMatch(/@page\s*\{\s*size:\s*A4\s+landscape\s*;/);
  expect(stylesheet).toContain(".su-full-landscape-detail { break-inside: avoid;");
  expect(stylesheet).toMatch(/\.su-full-landscape-bar-fill\s*\{[^}]*display: block;[^}]*border-radius: 0;/);
  expect(stylesheet).toMatch(/\.su-full-landscape-peer-contour\s*\{[^}]*color: var\(--chapter-line-color\);/);
  expect(stylesheet).toContain(".su-full-landscape-report .is-people { --chapter-color:");
  expect(stylesheet).toContain(".su-full-landscape-report .is-strategy { --chapter-color:");
  expect(stylesheet).toContain(".su-full-landscape-report .is-execution { --chapter-color:");
  expect(stylesheet).toContain(".su-full-landscape-report .is-cash { --chapter-color:");
  expect(stylesheet).toContain(".su-full-landscape-report .is-you { --chapter-color:");
  expect(stylesheet).toContain("print-color-adjust: exact;");
  expect(stylesheet).toContain("@media screen and (max-width: 760px)");
  expect(stylesheet).toContain(".su-full-landscape-page-body { grid-template-columns: 1fr;");
  expect(stylesheet).toContain(".su-full-landscape-page--chapter .su-full-landscape-vertical-chart");
  expect(stylesheet).toContain(".su-full-landscape-page--detail .su-full-landscape-page-body > h2");
  expect(stylesheet).toContain(".su-full-landscape-page--appendix .su-full-landscape-chart-question { display: block;");
  expect(stylesheet).toContain("grid-template-columns: 1.2fr 1fr 1.5fr 1fr 1.3fr;");
  expect(stylesheet).toContain("font-size: 8px; line-height: 1.15;");
  expect(stylesheet).toContain(".su-full-landscape-peer-contour { display: none; }");
  expect(stylesheet).toContain(".su-full-landscape-mobile-peer-value { display: block; }");
  expect(stylesheet).toContain(".is-people { --chapter-color: #f7a600; --chapter-peer-color: #ffd37a; --chapter-line-color: #7a5000; }");
  expect(stylesheet).toMatch(/\.su-full-landscape-page-footer \.su-report-coach-name\s*\{[^}]*color: #6b6480;/);
  expect(stylesheet).not.toMatch(/\.su-full-landscape-page\s*\{[^}]*overflow:\s*hidden;/);
  expect(stylesheet).not.toContain(".su-full-landscape-page--appendix .su-full-landscape-chart-question,\n  .su-public-brand.su-report.su-full-landscape .su-full-landscape-page--appendix .su-full-landscape-bar-label { display: none;");
});

test("uses canonical seed labels and score-selected feedback at maximum live density", () => {
  const report = completeSuFullLandscapeReport();
  const q35 = report.result?.perQuestion.find((question) => question.stableKey === "Q35");

  expect(report.questionByKey?.Q35).toBe("Most processes are automated");
  expect(q35?.value).toBe(1);
  expect(q35?.recommendation).toHaveLength(482);
});
