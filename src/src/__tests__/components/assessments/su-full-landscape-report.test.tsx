import { render, screen, within } from "@testing-library/react";

import {
  SuFullDetailPairedBars,
  SuFullVerticalPeerChart,
} from "@/components/assessments/su-full-landscape/SuFullLandscapeCharts";
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
