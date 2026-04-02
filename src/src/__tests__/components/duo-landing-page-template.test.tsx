/**
 * Tests for DuoLandingPageTemplate shared component.
 */

import { render, screen } from "@testing-library/react";
import {
  DuoLandingPageTemplate,
  DuoContent,
  DuoWorkshopData,
  SAMPLE_WORKSHOP_DUO,
} from "@/components/templates/duo-landing-page-template";

const baseContent: DuoContent = {
  heroTitle: "Scaling Up Together",
  subtitle: "Two coaches. One transformative day.",
  eventDate: "Wednesday, June 18, 2026",
  eventTime: "09:00 - 17:00",
  description: "Join two certified Scaling Up coaches for a day-long intensive.",
  coach1: { name: "Jane Smith", title: "Certified Scaling Up Coach", photo: "" },
  coach2: { name: "John Doe", title: "Senior Business Coach", photo: "" },
  whatItIs: ["Hands-on strategic planning", "Team alignment"],
  whatItIsNot: ["A lecture", "Generic content"],
  whoIsFor: ["CEOs and founders", "Leadership teams"],
  whoShouldSkip: ["Solo freelancers", "New startups"],
  whyNow: "The next 90 days will define the next 3 years.",
  registrationUrl: "https://example.com/register",
  ctaText: "Register Now",
};

const baseWorkshop: DuoWorkshopData = {
  id: "ws-duo-test",
  title: "Scaling Up Together",
  isFree: false,
  priceCents: 29900,
};

describe("DuoLandingPageTemplate", () => {
  describe("content rendering", () => {
    it("renders hero title", () => {
      render(<DuoLandingPageTemplate content={baseContent} workshop={baseWorkshop} />);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Scaling Up Together");
    });

    it("renders both coach names", () => {
      render(<DuoLandingPageTemplate content={baseContent} workshop={baseWorkshop} />);
      expect(screen.getByText("Jane Smith")).toBeInTheDocument();
      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });

    it("renders event date", () => {
      render(<DuoLandingPageTemplate content={baseContent} workshop={baseWorkshop} />);
      expect(screen.getAllByText(/Wednesday, June 18, 2026/).length).toBeGreaterThanOrEqual(1);
    });

    it("renders description", () => {
      render(<DuoLandingPageTemplate content={baseContent} workshop={baseWorkshop} />);
      expect(screen.getByText("Join two certified Scaling Up coaches for a day-long intensive.")).toBeInTheDocument();
    });

    it("renders whatItIs items", () => {
      render(<DuoLandingPageTemplate content={baseContent} workshop={baseWorkshop} />);
      expect(screen.getByText("Hands-on strategic planning")).toBeInTheDocument();
    });

    it("renders whoIsFor items", () => {
      render(<DuoLandingPageTemplate content={baseContent} workshop={baseWorkshop} />);
      expect(screen.getByText(/CEOs and founders/)).toBeInTheDocument();
    });

    it("renders whyNow text", () => {
      render(<DuoLandingPageTemplate content={baseContent} workshop={baseWorkshop} />);
      expect(screen.getByText("The next 90 days will define the next 3 years.")).toBeInTheDocument();
    });

    it("renders price from workshop data", () => {
      render(<DuoLandingPageTemplate content={baseContent} workshop={baseWorkshop} />);
      expect(screen.getByText("$299.00")).toBeInTheDocument();
    });

    it("renders Free for free workshop", () => {
      const freeWorkshop = { ...baseWorkshop, isFree: true, priceCents: 0 };
      render(<DuoLandingPageTemplate content={baseContent} workshop={freeWorkshop} />);
      expect(screen.getAllByText(/Free/i).length).toBeGreaterThanOrEqual(1);
    });
  });

    it("strips unresolved placeholders from hero title", () => {
      const content = { ...baseContent, heroTitle: "Register for {{workshop_title}}" };
      render(<DuoLandingPageTemplate content={content} workshop={baseWorkshop} />);
      expect(screen.getByRole("heading", { level: 1 })).not.toHaveTextContent("{{workshop_title}}");
    });

  describe("preview mode (isPreview=true)", () => {
    it("shows preview banner", () => {
      render(<DuoLandingPageTemplate content={baseContent} workshop={baseWorkshop} isPreview={true} />);
      expect(screen.getByText(/Preview — sample data shown/i)).toBeInTheDocument();
    });

    it("renders CTA as disabled button in preview mode", () => {
      render(<DuoLandingPageTemplate content={baseContent} workshop={baseWorkshop} isPreview={true} />);
      const btn = screen.getByRole("button", { name: /Register Now/i });
      expect(btn).toBeDisabled();
    });

    it("does not render CTA as a link in preview mode", () => {
      render(<DuoLandingPageTemplate content={baseContent} workshop={baseWorkshop} isPreview={true} />);
      expect(screen.queryByRole("link", { name: /Register Now/i })).not.toBeInTheDocument();
    });
  });

  describe("live mode (isPreview=false)", () => {
    it("does not show preview banner", () => {
      render(<DuoLandingPageTemplate content={baseContent} workshop={baseWorkshop} isPreview={false} />);
      expect(screen.queryByText(/Preview — sample data shown/i)).not.toBeInTheDocument();
    });

    it("renders CTA as a real link in live mode", () => {
      render(<DuoLandingPageTemplate content={baseContent} workshop={baseWorkshop} isPreview={false} />);
      const link = screen.getByRole("link", { name: /Register Now/i });
      expect(link).toHaveAttribute("href", "https://example.com/register");
    });
  });

  describe("sample data", () => {
    it("exports SAMPLE_WORKSHOP_DUO constant", () => {
      expect(SAMPLE_WORKSHOP_DUO).toBeDefined();
      expect(SAMPLE_WORKSHOP_DUO.id).toBeDefined();
    });
  });
});
