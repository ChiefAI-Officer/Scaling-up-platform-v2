/**
 * CoachLogo — coach identity on the report header (#63/67/73/78/81).
 *
 * The shared branding component used by BrandedReport (scored), QualitativeReport
 * (qualitative) and GroupReport — so surfacing the coach NAME as visible text
 * here flows to all report types + the group report in one change.
 *
 * Prior behavior: the coach name was ONLY the logo <img alt> (never visible),
 * and the component rendered NOTHING when there was no logo image. Jeff's ask
 * (decision: "show coach name as text") is that the coach's name appears as
 * visible text, and shows even when the coach has no logo image.
 */

import { render, screen } from "@testing-library/react";
import { CoachLogo } from "@/components/assessments/CoachLogo";

describe("CoachLogo — coach name as visible text (#63/67/73/78/81)", () => {
  it("shows the coach name as visible text alongside the logo image", () => {
    render(
      <CoachLogo url="https://cdn.example.com/coach.png" name="Dana Coach" variant="cover" />,
    );
    // Logo img still present (testid unchanged so existing tests keep working).
    expect(screen.getByTestId("coach-logo")).toHaveAttribute(
      "src",
      "https://cdn.example.com/coach.png",
    );
    // NEW: the name is on-screen text, not just the img alt.
    expect(screen.getByTestId("coach-name")).toHaveTextContent("Dana Coach");
    // a11y: the logo is decorative when the name is visible text (no double
    // screen-reader announcement).
    expect(screen.getByTestId("coach-logo")).toHaveAttribute("alt", "");
  });

  it("uses a labelled alt when a logo has no accompanying name", () => {
    render(<CoachLogo url="https://cdn.example.com/coach.png" name={null} variant="cover" />);
    expect(screen.getByTestId("coach-logo")).toHaveAttribute("alt", "Coach logo");
    expect(screen.queryByTestId("coach-name")).toBeNull();
  });

  it("shows the coach name even when there is NO logo image (name-only fallback)", () => {
    render(<CoachLogo url={null} name="Dana Coach" variant="cover" />);
    // No image when there's no url…
    expect(screen.queryByTestId("coach-logo")).toBeNull();
    // …but the coach name still appears as visible text.
    expect(screen.getByTestId("coach-name")).toHaveTextContent("Dana Coach");
  });

  it("renders nothing when both logo and name are absent", () => {
    const { container } = render(<CoachLogo url={null} name={null} variant="cover" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the name is only whitespace and there is no logo", () => {
    const { container } = render(<CoachLogo url={null} name="   " variant="footer" />);
    expect(container).toBeEmptyDOMElement();
  });
});
