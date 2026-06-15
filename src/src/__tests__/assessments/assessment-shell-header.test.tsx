import React from "react";
import { render, screen } from "@testing-library/react";
import { AssessmentShellHeader } from "@/components/assessments/AssessmentShellHeader";

describe("AssessmentShellHeader", () => {
  it("renders the white logo and the Section N of M label with the authoritative progressbar", () => {
    render(
      <AssessmentShellHeader
        currentSection={2}
        totalSections={10}
        assessmentName="Rockefeller Habits"
        companyName="Northwind Logistics"
        answeredCount={2}
        totalQuestions={10}
      />,
    );

    // White brand logo
    const logo = screen.getByRole("img", { name: /scaling up/i });
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute("src", "/brand/su-logo-white.svg");

    // "Section 2 of 10" label
    expect(screen.getByText(/section 2 of 10/i)).toBeInTheDocument();

    // Authoritative progressbar with correct aria values
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "2");
    expect(bar).toHaveAttribute("aria-valuemax", "10");
  });

  it("renders the assessment name and company name when both are provided", () => {
    render(
      <AssessmentShellHeader
        currentSection={1}
        totalSections={3}
        assessmentName="Rockefeller Habits"
        companyName="Northwind Logistics"
        answeredCount={0}
        totalQuestions={5}
      />,
    );
    expect(screen.getByText(/rockefeller habits/i)).toBeInTheDocument();
    expect(screen.getByText(/northwind logistics/i)).toBeInTheDocument();
  });

  it("omits company text and does not crash when companyName is undefined", () => {
    render(
      <AssessmentShellHeader
        currentSection={1}
        totalSections={3}
        assessmentName="Quarterly Strategy Pulse"
        answeredCount={0}
        totalQuestions={3}
      />,
    );
    expect(screen.getByText(/quarterly strategy pulse/i)).toBeInTheDocument();
    expect(screen.queryByText(/northwind logistics/i)).not.toBeInTheDocument();
  });

  it("renders without an assessment name and shows Section N of M", () => {
    render(
      <AssessmentShellHeader
        currentSection={1}
        totalSections={2}
        answeredCount={0}
        totalQuestions={2}
      />,
    );
    expect(screen.getByText(/section 1 of 2/i)).toBeInTheDocument();
  });

  it("clamps the active section so it never exceeds totalSections", () => {
    render(
      <AssessmentShellHeader
        currentSection={99}
        totalSections={4}
        answeredCount={0}
        totalQuestions={4}
      />,
    );
    // Section label shows clamped value (4 of 4)
    expect(screen.getByText(/section 4 of 4/i)).toBeInTheDocument();
  });

  it("no longer renders the segmented strip", () => {
    const { container } = render(
      <AssessmentShellHeader
        currentSection={1}
        totalSections={2}
        answeredCount={0}
        totalQuestions={4}
      />,
    );
    expect(container.querySelector(".su-shell-seg")).toBeNull();
    expect(container.querySelectorAll(".su-shell-seg-item")).toHaveLength(0);
  });
});
