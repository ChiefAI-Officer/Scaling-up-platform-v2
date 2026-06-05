import React from "react";
import { render, screen } from "@testing-library/react";
import { AssessmentShellHeader } from "@/components/assessments/AssessmentShellHeader";

describe("AssessmentShellHeader", () => {
  it("renders the white logo, the Section N of M label, and one progress segment per section with the right active count", () => {
    const { container } = render(
      <AssessmentShellHeader
        currentSection={2}
        totalSections={10}
        assessmentName="Rockefeller Habits"
        companyName="Northwind Logistics"
      />,
    );

    // White brand logo
    const logo = screen.getByRole("img", { name: /scaling up/i });
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute("src", "/brand/su-logo-white.svg");

    // "Section 2 of 10" label
    expect(screen.getByText(/section 2 of 10/i)).toBeInTheDocument();

    // One segment per section, exactly `currentSection` of them active
    const segments = container.querySelectorAll(".su-shell-seg-item");
    expect(segments).toHaveLength(10);
    const active = container.querySelectorAll(".su-shell-seg-item.is-active");
    expect(active).toHaveLength(2);
  });

  it("renders the assessment name and company name when both are provided", () => {
    render(
      <AssessmentShellHeader
        currentSection={1}
        totalSections={3}
        assessmentName="Rockefeller Habits"
        companyName="Northwind Logistics"
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
      />,
    );
    expect(screen.getByText(/quarterly strategy pulse/i)).toBeInTheDocument();
    expect(screen.queryByText(/northwind logistics/i)).not.toBeInTheDocument();
  });

  it("renders without an assessment name (both optional)", () => {
    const { container } = render(
      <AssessmentShellHeader currentSection={1} totalSections={2} />,
    );
    expect(container.querySelectorAll(".su-shell-seg-item")).toHaveLength(2);
    expect(screen.getByText(/section 1 of 2/i)).toBeInTheDocument();
  });

  it("clamps the active-segment count so it never exceeds totalSections", () => {
    const { container } = render(
      <AssessmentShellHeader currentSection={99} totalSections={4} />,
    );
    expect(container.querySelectorAll(".su-shell-seg-item")).toHaveLength(4);
    expect(container.querySelectorAll(".su-shell-seg-item.is-active")).toHaveLength(4);
  });
});
