/**
 * Tests for RegistrationPageTemplate shared component.
 */

import { render, screen } from "@testing-library/react";
import {
  RegistrationPageTemplate,
  RegistrationContent,
  RegistrationWorkshopData,
  SAMPLE_WORKSHOP_REGISTRATION,
} from "@/components/templates/registration-page-template";

// Mock RegistrationForm — it has its own test coverage
jest.mock("@/app/(public)/workshop/[slug]/registration-form", () => ({
  RegistrationForm: ({ workshopId }: { workshopId: string }) => (
    <div data-testid="registration-form" data-workshop-id={workshopId}>Real Registration Form</div>
  ),
}));

const baseContent: RegistrationContent = {
  coachName: "Jane Smith",
  coachTitle: "Certified Scaling Up Coach",
  heroHeadline: "Transform Your Business",
  workshopTitle: "Scaling Up Masterclass",
  eventDate: "Wednesday, June 18, 2026",
  eventTime: "09:00 - 17:00",
  coachPhoto: "",
  submitButtonText: "Register Now",
  privacyText: "Your info is safe with us.",
};

const baseWorkshop: RegistrationWorkshopData = {
  id: "ws-reg-test",
  title: "Scaling Up Masterclass",
  isFree: false,
  priceCents: 19900,
  format: "VIRTUAL",
};

describe("RegistrationPageTemplate", () => {
  describe("content rendering", () => {
    it("renders hero headline from content", () => {
      render(<RegistrationPageTemplate content={baseContent} workshop={baseWorkshop} />);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Transform Your Business");
    });

    it("renders workshop title", () => {
      render(<RegistrationPageTemplate content={baseContent} workshop={baseWorkshop} />);
      expect(screen.getAllByText("Scaling Up Masterclass").length).toBeGreaterThanOrEqual(1);
    });

    it("renders coach name", () => {
      render(<RegistrationPageTemplate content={baseContent} workshop={baseWorkshop} />);
      expect(screen.getByText("Jane Smith")).toBeInTheDocument();
    });

    it("renders coach title", () => {
      render(<RegistrationPageTemplate content={baseContent} workshop={baseWorkshop} />);
      expect(screen.getByText("Certified Scaling Up Coach")).toBeInTheDocument();
    });

    it("renders event date", () => {
      render(<RegistrationPageTemplate content={baseContent} workshop={baseWorkshop} />);
      expect(screen.getByText("Wednesday, June 18, 2026")).toBeInTheDocument();
    });

    it("renders event time when provided", () => {
      render(<RegistrationPageTemplate content={baseContent} workshop={baseWorkshop} />);
      expect(screen.getByText("09:00 - 17:00")).toBeInTheDocument();
    });

    it("strips unresolved placeholders", () => {
      const content = { ...baseContent, heroHeadline: "Register for {{workshop_title}}" };
      render(<RegistrationPageTemplate content={content} workshop={baseWorkshop} />);
      expect(screen.getByRole("heading", { level: 1 })).not.toHaveTextContent("{{workshop_title}}");
    });
  });

  describe("preview mode (isPreview=true)", () => {
    it("shows preview banner", () => {
      render(<RegistrationPageTemplate content={baseContent} workshop={baseWorkshop} isPreview={true} />);
      expect(screen.getByText(/Preview — sample data shown/i)).toBeInTheDocument();
    });

    it("does not render real RegistrationForm in preview mode", () => {
      render(<RegistrationPageTemplate content={baseContent} workshop={baseWorkshop} isPreview={true} />);
      expect(screen.queryByTestId("registration-form")).not.toBeInTheDocument();
    });

    it("renders a disabled placeholder form in preview mode", () => {
      render(<RegistrationPageTemplate content={baseContent} workshop={baseWorkshop} isPreview={true} />);
      const submitBtn = screen.getByRole("button", { name: /register/i });
      expect(submitBtn).toBeDisabled();
    });
  });

  describe("live mode (isPreview=false)", () => {
    it("does not show preview banner", () => {
      render(<RegistrationPageTemplate content={baseContent} workshop={baseWorkshop} isPreview={false} />);
      expect(screen.queryByText(/Preview — sample data shown/i)).not.toBeInTheDocument();
    });

    it("renders real RegistrationForm in live mode", () => {
      render(<RegistrationPageTemplate content={baseContent} workshop={baseWorkshop} isPreview={false} />);
      expect(screen.getByTestId("registration-form")).toBeInTheDocument();
      expect(screen.getByTestId("registration-form")).toHaveAttribute("data-workshop-id", "ws-reg-test");
    });
  });

  describe("sample data", () => {
    it("exports SAMPLE_WORKSHOP_REGISTRATION constant", () => {
      expect(SAMPLE_WORKSHOP_REGISTRATION).toBeDefined();
      expect(SAMPLE_WORKSHOP_REGISTRATION.id).toBeDefined();
    });
  });
});
