/**
 * Brand-scope tests for the Scaling Up public theme applied to the
 * Registration + Thank You templates.
 *
 * The theme is delivered via a `.su-public-brand` scope wrapper (same
 * principle as the assessment `.su-assessment-brand` scope). These tests lock:
 *   - the scope wrapper is present (so styles never leak to admin/coach), and
 *   - the official white SU logo asset is referenced, and
 *   - the branded structural anchors (4-Decisions stripe, dark details card)
 *     render.
 */

import { render } from "@testing-library/react";
import { RegistrationPageTemplate, RegistrationContent, RegistrationWorkshopData } from "@/components/templates/registration-page-template";
import { ThankYouPageTemplate, ThankYouContent, ThankYouWorkshopData } from "@/components/templates/thank-you-page-template";

jest.mock("@/app/(public)/workshop/[slug]/registration-form", () => ({
  RegistrationForm: ({ workshopId }: { workshopId: string }) => (
    <div data-testid="registration-form" data-workshop-id={workshopId}>Form</div>
  ),
}));

jest.mock("@/lib/ics-generator", () => ({
  buildGoogleCalendarUrl: () => "https://calendar.google.com/test-url",
  parseDurationHoursFromEvent: () => 8,
  buildLocationString: () => "Virtual Workshop",
}));

const regContent: RegistrationContent = {
  coachName: "Jane Smith",
  coachTitle: "Certified Scaling Up Coach",
  heroHeadline: "Transform Your Business",
  workshopTitle: "Scaling Up Masterclass",
  eventDate: "Wednesday, June 18, 2026",
  eventTime: "09:00 - 17:00 EDT",
};
const regWorkshop: RegistrationWorkshopData = {
  id: "ws-reg", title: "Scaling Up Masterclass", isFree: false, priceCents: 19900, format: "VIRTUAL",
};

const tyContent: ThankYouContent = { headline: "You're Registered!", subheadline: "See you there." };
const tyWorkshop: ThankYouWorkshopData = {
  id: "ws-ty", title: "Scaling Up Masterclass", eventDate: new Date("2026-06-18"),
  eventTime: "09:00 - 17:00", timezone: "America/New_York", format: "VIRTUAL", duration: "8",
  isFree: false, priceCents: 19900, earlyBirdPriceCents: null, description: "x", virtualLink: null,
  venueName: null, venueAddress: null,
};

describe("Registration brand scope", () => {
  it("wraps output in the .su-public-brand scope (no global leak)", () => {
    const { container } = render(<RegistrationPageTemplate content={regContent} workshop={regWorkshop} />);
    expect(container.querySelector(".su-public-brand")).toBeInTheDocument();
  });

  it("renders the official white SU logo asset", () => {
    const { container } = render(<RegistrationPageTemplate content={regContent} workshop={regWorkshop} />);
    const logo = container.querySelector("img.su-logo");
    expect(logo).toHaveAttribute("src", "/brand/su-logo-white.svg");
    expect(logo).toHaveAttribute("alt", "Scaling Up");
  });

  it("renders the Four Decisions signature stripe + the orange CTA hero", () => {
    const { container } = render(<RegistrationPageTemplate content={regContent} workshop={regWorkshop} />);
    expect(container.querySelector(".su-stripe-v")).toBeInTheDocument();
    expect(container.querySelector(".su-reg-hero")).toBeInTheDocument();
  });
});

describe("Thank You brand scope", () => {
  it("wraps output in the .su-public-brand scope (no global leak)", () => {
    const { container } = render(<ThankYouPageTemplate content={tyContent} workshop={tyWorkshop} />);
    expect(container.querySelector(".su-public-brand")).toBeInTheDocument();
  });

  it("renders the official white SU logo asset", () => {
    const { container } = render(<ThankYouPageTemplate content={tyContent} workshop={tyWorkshop} />);
    const logo = container.querySelector("img.su-logo");
    expect(logo).toHaveAttribute("src", "/brand/su-logo-white.svg");
  });

  it("renders the branded dark details card + the top 4-Decisions stripe", () => {
    const { container } = render(<ThankYouPageTemplate content={tyContent} workshop={tyWorkshop} />);
    expect(container.querySelector(".su-stripe-h")).toBeInTheDocument();
    expect(container.querySelector(".su-logistics")).toBeInTheDocument();
  });
});
