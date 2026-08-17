import { render, screen, within } from "@testing-library/react";

import {
  SuFullDetailPairedBars,
  SuFullVerticalPeerChart,
} from "@/components/assessments/su-full-landscape/SuFullLandscapeCharts";
import { SuFullLandscapeReport } from "@/components/assessments/su-full-landscape/SuFullLandscapeReport";
import {
  completeSuFullLandscapePresentation,
  completeSuFullLandscapeReport,
} from "@/__tests__/fixtures/su-full-landscape";
import { buildSuFullLandscapeReportModel } from "@/lib/assessments/su-full-landscape-report";

function peopleQuestions() {
  const report = completeSuFullLandscapeReport();
  const presentation = completeSuFullLandscapePresentation(report);
  const model = buildSuFullLandscapeReportModel({ report, presentation });
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
  expect(within(vertical).getByText(/You 0\.0\. Peers 6\.3\./)).toBeInTheDocument();
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
  expect(detail).toHaveTextContent("6.3");
});

test("renders the fixed 26-page landscape composition with truthful peer context", () => {
  const report = completeSuFullLandscapeReport();
  const presentation = completeSuFullLandscapePresentation(report);
  const model = buildSuFullLandscapeReportModel({ report, presentation });
  if (!model) throw new Error("The canonical landscape fixture must build");

  render(
    <SuFullLandscapeReport
      report={report}
      model={model}
      contactEmail="coach@example.com"
    />,
  );

  const pages = screen.getAllByTestId(/^su-full-landscape-page-/);
  expect(pages).toHaveLength(26);
  expect(pages.map((page) => page.dataset.pageNumber)).toEqual(
    Array.from({ length: 26 }, (_, index) => String(index + 1)),
  );
  for (const number of [7, 11, 14, 19, 21]) {
    expect(screen.getByTestId(`su-full-landscape-page-${number}`))
      .toHaveTextContent("Score of Peers");
  }
  expect(screen.getByTestId("su-full-landscape-page-26").querySelectorAll("polyline"))
    .toHaveLength(5);
  expect(screen.getAllByTestId(/^su-full-landscape-detail-Q/)).toHaveLength(61);

  expect(screen.getByTestId("su-full-landscape-page-4")).toHaveTextContent(
    "Phase 2 from FTE 12",
  );
  expect(screen.getByTestId("su-full-landscape-page-5")).toHaveTextContent("You");
  expect(screen.getByTestId("su-full-landscape-page-5")).toHaveTextContent("Peers");
  expect(screen.getByTestId("su-full-landscape-page-5")).toHaveTextContent("Deviation");
  expect(screen.getByTestId("su-full-landscape-page-6")).toHaveTextContent(
    "Peers are a current benchmark reference. Values are not yet matched to company size, growth phase, geography, or industry.",
  );
  expect(screen.getByTestId("su-full-landscape-page-6")).toHaveTextContent("18 August 2026");

  for (const detail of screen.getAllByTestId(/^su-full-landscape-detail-Q/)) {
    const bars = within(detail).getByTestId(
      `su-landscape-detail-bars-${detail.dataset.questionKey}`,
    );
    expect(
      detail.compareDocumentPosition(bars) & Node.DOCUMENT_POSITION_CONTAINED_BY,
    ).toBe(Node.DOCUMENT_POSITION_CONTAINED_BY);
    expect(detail.textContent?.indexOf("You")).toBeLessThan(
      detail.textContent?.indexOf("Frozen feedback") ?? -1,
    );
  }

  expect(screen.getByTestId("su-full-landscape-page-25")).toHaveTextContent("ScaleUp Score");
  expect(screen.getByTestId("su-full-landscape-page-25")).toHaveTextContent("Next steps");
  expect(document.body.textContent).not.toMatch(/Esperto|TCPDF/i);
});
