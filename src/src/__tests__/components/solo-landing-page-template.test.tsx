/**
 * Tests for SoloLandingPageTemplate shared component.
 */

import { render, screen } from "@testing-library/react";
import {
  SoloLandingPageTemplate,
  SoloContent,
  SoloWorkshopData,
  SAMPLE_WORKSHOP_SOLO,
} from "@/components/templates/solo-landing-page-template";

const baseContent: SoloContent = {
  heroTitle: "Scale Up Masterclass",
  heroSubtitle: "Build value. Scale Up. Finish Strong.",
  coachName: "Jane Smith",
  coachTitle: "Certified Scaling Up Coach",
  coachPhoto: "",
  eventDate: "Wednesday, June 18, 2026",
  eventTime: "09:00 - 17:00",
  aboutTitle: "About This Workshop",
  aboutDescription: "A transformative day dedicated to scaling your business.",
  benefits: ["Identify the 9 value drivers", "Strategize the next 90 days"],
  registrationUrl: "https://example.com/register",
};

const baseWorkshop: SoloWorkshopData = {
  id: "ws-solo-test",
  title: "Scale Up Masterclass",
  isFree: false,
  priceCents: 19900,
};

describe("SoloLandingPageTemplate", () => {
  describe("content rendering", () => {
    it("renders hero title", () => {
      render(<SoloLandingPageTemplate content={baseContent} workshop={baseWorkshop} />);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Scale Up Masterclass");
    });

    it("renders coach name in hero", () => {
      render(<SoloLandingPageTemplate content={baseContent} workshop={baseWorkshop} />);
      expect(screen.getAllByText("Jane Smith").length).toBeGreaterThanOrEqual(1);
    });

    it("renders event date", () => {
      render(<SoloLandingPageTemplate content={baseContent} workshop={baseWorkshop} />);
      expect(screen.getByText("Wednesday, June 18, 2026")).toBeInTheDocument();
    });

    it("renders about section title and description", () => {
      render(<SoloLandingPageTemplate content={baseContent} workshop={baseWorkshop} />);
      expect(screen.getByText("About This Workshop")).toBeInTheDocument();
      expect(screen.getByText("A transformative day dedicated to scaling your business.")).toBeInTheDocument();
    });

    it("renders all benefits", () => {
      render(<SoloLandingPageTemplate content={baseContent} workshop={baseWorkshop} />);
      expect(screen.getByText("Identify the 9 value drivers")).toBeInTheDocument();
      expect(screen.getByText("Strategize the next 90 days")).toBeInTheDocument();
    });

    it("renders price from workshop data", () => {
      render(<SoloLandingPageTemplate content={baseContent} workshop={baseWorkshop} />);
      expect(screen.getByText("$199.00")).toBeInTheDocument();
    });

    it("renders Free for free workshop", () => {
      const freeWorkshop = { ...baseWorkshop, isFree: true, priceCents: 0 };
      render(<SoloLandingPageTemplate content={baseContent} workshop={freeWorkshop} />);
      expect(screen.getAllByText("Free").length).toBeGreaterThanOrEqual(1);
    });

    it("strips unresolved placeholders", () => {
      const content = { ...baseContent, heroTitle: "Register for {{workshop_title}}" };
      render(<SoloLandingPageTemplate content={content} workshop={baseWorkshop} />);
      expect(screen.getByRole("heading", { level: 1 })).not.toHaveTextContent("{{workshop_title}}");
    });
  });

  describe("preview mode (isPreview=true)", () => {
    it("shows preview banner", () => {
      render(<SoloLandingPageTemplate content={baseContent} workshop={baseWorkshop} isPreview={true} />);
      expect(screen.getByText(/Preview — sample data shown/i)).toBeInTheDocument();
    });

    it("renders CTA as disabled button in preview mode", () => {
      render(<SoloLandingPageTemplate content={baseContent} workshop={baseWorkshop} isPreview={true} />);
      const buttons = screen.getAllByRole("button");
      const disabledCta = buttons.find((b) => b.hasAttribute("disabled"));
      expect(disabledCta).toBeDefined();
    });

    it("does not render CTA as a link in preview mode", () => {
      render(<SoloLandingPageTemplate content={baseContent} workshop={baseWorkshop} isPreview={true} />);
      expect(screen.queryByRole("link", { name: /Register Now/i })).not.toBeInTheDocument();
    });
  });

  describe("live mode (isPreview=false)", () => {
    it("does not show preview banner", () => {
      render(<SoloLandingPageTemplate content={baseContent} workshop={baseWorkshop} isPreview={false} />);
      expect(screen.queryByText(/Preview — sample data shown/i)).not.toBeInTheDocument();
    });

    it("renders CTA as a real link in live mode", () => {
      render(<SoloLandingPageTemplate content={baseContent} workshop={baseWorkshop} isPreview={false} />);
      const links = screen.getAllByRole("link", { name: /Register Now/i });
      expect(links.length).toBeGreaterThanOrEqual(1);
      expect(links[0]).toHaveAttribute("href", "https://example.com/register");
    });
  });

  describe("sample data", () => {
    it("exports SAMPLE_WORKSHOP_SOLO constant", () => {
      expect(SAMPLE_WORKSHOP_SOLO).toBeDefined();
      expect(SAMPLE_WORKSHOP_SOLO.id).toBeDefined();
    });
  });

  describe("video embed normalization", () => {
    it("normalizes vimeo.com path-form share URLs to canonical player ?h= form (covers admin editor preview)", () => {
      const { container } = render(
        <SoloLandingPageTemplate
          content={{ ...baseContent, videoUrl: "https://vimeo.com/1170718882/13d047cf12" }}
          workshop={baseWorkshop}
        />
      );
      const iframe = container.querySelector("iframe");
      expect(iframe).not.toBeNull();
      expect(iframe?.getAttribute("src")).toBe(
        "https://player.vimeo.com/video/1170718882?h=13d047cf12"
      );
    });

    it("normalizes a bare vimeo.com/ID URL to player.vimeo.com format", () => {
      const { container } = render(
        <SoloLandingPageTemplate
          content={{ ...baseContent, videoUrl: "https://vimeo.com/1170718882" }}
          workshop={baseWorkshop}
        />
      );
      expect(container.querySelector("iframe")?.getAttribute("src")).toBe(
        "https://player.vimeo.com/video/1170718882"
      );
    });
  });
});
