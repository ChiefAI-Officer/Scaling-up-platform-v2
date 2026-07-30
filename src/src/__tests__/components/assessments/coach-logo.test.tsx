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

/**
 * GH #229 — the logo `src` is an operator-set string with NO validation at the
 * write boundary (`createCoachSchema.profileImage` is `z.string().optional()`),
 * and Wave OSR (#71) puts this component in front of UNAUTHENTICATED
 * respondents for the first time. An unvalidated src turns that string into an
 * outbound request from every respondent's browser (IP/UA disclosure to an
 * arbitrary host, plus http: mixed content on an https page).
 *
 * Contract: the URL is filtered through the same https-only `safeImageSrc` gate
 * the invitation email already applies, and a REJECTED url degrades to the
 * name-only state — it must NOT erase the coach byline that #63/#67/#73/#78/#81
 * shipped, because the byline is the part Jeff actually asked for.
 *
 * Every "the image is absent" assertion below is paired with a positive control
 * (the name is still there / an https url still renders), so the block cannot
 * pass vacuously by rendering nothing at all.
 */
describe("CoachLogo — image src validation (GH #229)", () => {
  it("renders an https logo (positive control — the gate is not blanket-rejecting)", () => {
    render(<CoachLogo url="https://cdn.example.com/coach.png" name="Dana Coach" variant="cover" />);
    expect(screen.getByTestId("coach-logo")).toHaveAttribute(
      "src",
      "https://cdn.example.com/coach.png",
    );
    expect(screen.getByTestId("coach-name")).toHaveTextContent("Dana Coach");
  });

  it.each([
    ["http (mixed content)", "http://cdn.example.com/coach.png"],
    ["protocol-relative", "//cdn.example.com/coach.png"],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:image/png;base64,iVBORw0KGgo="],
    ["bare filename", "coach.png"],
    ["root-relative", "/uploads/coach.png"],
    ["unparseable", "https://"],
  ])("drops the image but KEEPS the byline for a rejected src — %s", (_label, url) => {
    render(<CoachLogo url={url} name="Dana Coach" variant="cover" />);
    // negative: no outbound request is made from the respondent's browser…
    expect(screen.queryByTestId("coach-logo")).toBeNull();
    // …positive control: the coach byline Jeff asked for survives.
    expect(screen.getByTestId("coach-name")).toHaveTextContent("Dana Coach");
  });

  it("renders nothing when a rejected src is the ONLY thing to show", () => {
    const { container } = render(
      <CoachLogo url="http://cdn.example.com/coach.png" name={null} variant="footer" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("labels the alt when an accepted logo has no name (rejection path leaves alt logic intact)", () => {
    render(<CoachLogo url="https://cdn.example.com/coach.png" name={null} variant="footer" />);
    expect(screen.getByTestId("coach-logo")).toHaveAttribute("alt", "Coach logo");
  });
});
