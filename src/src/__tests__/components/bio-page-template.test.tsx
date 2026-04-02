/**
 * Tests for BioPageTemplate shared component.
 */

import { render, screen } from "@testing-library/react";
import {
  BioPageTemplate,
  BioContent,
  SAMPLE_BIO_CONTENT,
} from "@/components/templates/bio-page-template";

const baseContent: BioContent = {
  coachName: "Jane Smith",
  coachTitle: "Certified Scaling Up Coach",
  biography: "Jane has 20 years of experience helping companies scale.\n\nShe works with CEOs across North America.",
  profileImageUrl: "https://example.com/photo.jpg",
  showCtaButton: true,
  ctaButtonUrl: "https://calendly.com/jane",
  ctaButtonText: "Book a Free Call",
};

describe("BioPageTemplate", () => {
  describe("content rendering", () => {
    it("renders coach name", () => {
      render(<BioPageTemplate content={baseContent} />);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Jane Smith");
    });

    it("renders coach title", () => {
      render(<BioPageTemplate content={baseContent} />);
      expect(screen.getByText("Certified Scaling Up Coach")).toBeInTheDocument();
    });

    it("renders biography paragraphs", () => {
      render(<BioPageTemplate content={baseContent} />);
      expect(screen.getByText(/Jane has 20 years/)).toBeInTheDocument();
      expect(screen.getByText(/She works with CEOs/)).toBeInTheDocument();
    });

    it("renders profile image when provided", () => {
      render(<BioPageTemplate content={baseContent} />);
      const img = screen.getByRole("img", { name: "Jane Smith" });
      expect(img).toHaveAttribute("src", "https://example.com/photo.jpg");
    });

    it("renders CTA button when showCtaButton is true", () => {
      render(<BioPageTemplate content={baseContent} />);
      expect(screen.getByText("Book a Free Call")).toBeInTheDocument();
    });

    it("does not render CTA button when showCtaButton is false", () => {
      const content = { ...baseContent, showCtaButton: false };
      render(<BioPageTemplate content={content} />);
      expect(screen.queryByText("Book a Free Call")).not.toBeInTheDocument();
    });

    it("renders branding label", () => {
      render(<BioPageTemplate content={baseContent} />);
      expect(screen.getByText("SCALING UP COACHES")).toBeInTheDocument();
    });
  });

    it("strips unresolved placeholders from coach name", () => {
      const content = { ...baseContent, coachName: "{{coach_name}}" };
      render(<BioPageTemplate content={content} />);
      expect(screen.getByRole("heading", { level: 1 })).not.toHaveTextContent("{{coach_name}}");
    });

  describe("preview mode (isPreview=true)", () => {
    it("shows preview banner", () => {
      render(<BioPageTemplate content={baseContent} isPreview={true} />);
      expect(screen.getByText(/Preview — sample data shown/i)).toBeInTheDocument();
    });

    it("renders CTA as disabled button in preview mode", () => {
      render(<BioPageTemplate content={baseContent} isPreview={true} />);
      const btn = screen.getByRole("button", { name: /Book a Free Call/i });
      expect(btn).toBeDisabled();
    });

    it("does not render CTA as a link in preview mode", () => {
      render(<BioPageTemplate content={baseContent} isPreview={true} />);
      // Should be a button, not an anchor tag linking to the URL
      expect(screen.queryByRole("link", { name: /Book a Free Call/i })).not.toBeInTheDocument();
    });
  });

  describe("live mode (isPreview=false)", () => {
    it("does not show preview banner", () => {
      render(<BioPageTemplate content={baseContent} isPreview={false} />);
      expect(screen.queryByText(/Preview — sample data shown/i)).not.toBeInTheDocument();
    });

    it("renders CTA as a real link in live mode", () => {
      render(<BioPageTemplate content={baseContent} isPreview={false} />);
      const link = screen.getByRole("link", { name: /Book a Free Call/i });
      expect(link).toHaveAttribute("href", "https://calendly.com/jane");
    });
  });

  describe("sample data", () => {
    it("exports SAMPLE_BIO_CONTENT constant", () => {
      expect(SAMPLE_BIO_CONTENT).toBeDefined();
      expect(SAMPLE_BIO_CONTENT.coachName).toBeDefined();
    });
  });
});
