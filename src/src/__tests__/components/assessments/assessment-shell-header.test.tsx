import React from "react";
import { render, screen } from "@testing-library/react";
import { AssessmentShellHeader } from "@/components/assessments/AssessmentShellHeader";

it("renders the caption + Section N of M", () => {
  render(<AssessmentShellHeader currentSection={2} totalSections={4} assessmentName="Q3 Rockefeller" answeredCount={3} totalQuestions={10} />);
  expect(screen.getByText("Q3 Rockefeller")).toBeInTheDocument();
  expect(screen.getByText(/Section 2 of 4/)).toBeInTheDocument();
});
it("owns exactly one progressbar reflecting answered/total", () => {
  render(<AssessmentShellHeader currentSection={1} totalSections={2} assessmentName="X" answeredCount={3} totalQuestions={10} />);
  const bar = screen.getByRole("progressbar");
  expect(bar).toHaveAttribute("aria-valuenow", "3");
  expect(bar).toHaveAttribute("aria-valuemax", "10");
});
it("no longer renders the segmented strip", () => {
  const { container } = render(<AssessmentShellHeader currentSection={1} totalSections={2} assessmentName="X" answeredCount={0} totalQuestions={4} />);
  expect(container.querySelector(".su-shell-seg")).toBeNull();
});
