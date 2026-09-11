import { render, screen } from "@testing-library/react";
import { ReportNextSteps } from "@/components/assessments/ReportNextSteps";

describe("ReportNextSteps — default coach CTA policy", () => {
  it("renders Learn More without a coach link when no opt-in is supplied", () => {
    render(<ReportNextSteps contactEmail="coach@example.com" />);

    expect(screen.getByRole("link", { name: "Learn More →" })).toHaveAttribute(
      "href",
      "https://scalingup.com",
    );
    expect(
      screen.queryByRole("link", { name: "Talk to a Coach →" }),
    ).not.toBeInTheDocument();
  });

  it("restores the coach link when a template explicitly opts in", () => {
    render(
      <ReportNextSteps
        contactEmail="coach@example.com"
        showCoachLink
      />,
    );

    expect(screen.getByRole("link", { name: "Talk to a Coach →" })).toHaveAttribute(
      "href",
      "mailto:coach%40example.com",
    );
  });
});
