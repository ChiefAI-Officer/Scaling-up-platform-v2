/**
 * Tests for ThankYouPageTemplate shared component.
 * Verifies 1:1 behavior across public page, workshop editor preview,
 * and global template editor preview.
 */

import { render, screen } from "@testing-library/react";
import { ThankYouPageTemplate, ThankYouContent, ThankYouWorkshopData } from "@/components/templates/thank-you-page-template";

jest.mock("@/lib/ics-generator", () => ({
  buildGoogleCalendarUrl: () => "https://calendar.google.com/test-url",
  parseDurationHoursFromEvent: () => 8,
  buildLocationString: () => "Virtual Workshop",
}));

const baseContent: ThankYouContent = {
  headline: "You're Registered!",
  subheadline: "Thank you for registering for the workshop.",
  videoUrl: "",
  additionalMessage: "",
  calendarReminderText: "Add this event to your calendar",
};

const baseWorkshop: ThankYouWorkshopData = {
  id: "ws-test-123",
  title: "Scaling Up Masterclass",
  eventDate: new Date("2026-06-18"),
  eventTime: "09:00 - 17:00",
  timezone: "America/New_York",
  format: "VIRTUAL",
  duration: "8",
  isFree: false,
  priceCents: 19900,
  earlyBirdPriceCents: null,
  description: "A transformative workshop.",
  virtualLink: null,
  venueName: null,
  venueAddress: null,
};

describe("ThankYouPageTemplate", () => {
  describe("content rendering", () => {
    it("renders headline from content", () => {
      render(<ThankYouPageTemplate content={baseContent} workshop={baseWorkshop} />);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("You're Registered!");
    });

    it("renders subheadline from content", () => {
      render(<ThankYouPageTemplate content={baseContent} workshop={baseWorkshop} />);
      expect(screen.getByText("Thank you for registering for the workshop.")).toBeInTheDocument();
    });

    it("renders calendar reminder text", () => {
      render(<ThankYouPageTemplate content={baseContent} workshop={baseWorkshop} />);
      expect(screen.getByText("Add this event to your calendar")).toBeInTheDocument();
    });

    it("renders additional message when provided", () => {
      const content = { ...baseContent, additionalMessage: "Bring your laptop." };
      render(<ThankYouPageTemplate content={content} workshop={baseWorkshop} />);
      expect(screen.getByText("Bring your laptop.")).toBeInTheDocument();
    });

    it("does not render additional message section when empty", () => {
      render(<ThankYouPageTemplate content={baseContent} workshop={baseWorkshop} />);
      expect(screen.queryByText("Bring your laptop.")).not.toBeInTheDocument();
    });

    it("renders video iframe when videoUrl is provided", () => {
      const content = { ...baseContent, videoUrl: "https://player.vimeo.com/video/123" };
      render(<ThankYouPageTemplate content={content} workshop={baseWorkshop} />);
      const iframe = document.querySelector("iframe");
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute("src", "https://player.vimeo.com/video/123");
    });

    it("normalizes bare vimeo.com/ID URL on iframe src (covers admin editor preview)", () => {
      const content = { ...baseContent, videoUrl: "https://vimeo.com/1170718882" };
      render(<ThankYouPageTemplate content={content} workshop={baseWorkshop} />);
      expect(document.querySelector("iframe")?.getAttribute("src")).toBe(
        "https://player.vimeo.com/video/1170718882"
      );
    });

    it("normalizes vimeo.com/ID/HASH path-form share URL to canonical ?h= form", () => {
      const content = { ...baseContent, videoUrl: "https://vimeo.com/1170718882/13d047cf12" };
      render(<ThankYouPageTemplate content={content} workshop={baseWorkshop} />);
      expect(document.querySelector("iframe")?.getAttribute("src")).toBe(
        "https://player.vimeo.com/video/1170718882?h=13d047cf12"
      );
    });

    it("does not render video iframe when videoUrl is empty", () => {
      render(<ThankYouPageTemplate content={baseContent} workshop={baseWorkshop} />);
      expect(document.querySelector("iframe")).not.toBeInTheDocument();
    });

    it("strips unresolved placeholders from headline", () => {
      const content = { ...baseContent, headline: "Welcome to {{workshop_title}}" };
      render(<ThankYouPageTemplate content={content} workshop={baseWorkshop} />);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Welcome to");
      expect(screen.getByRole("heading", { level: 1 })).not.toHaveTextContent("{{workshop_title}}");
    });
  });

  describe("workshop details", () => {
    it("renders workshop title in details section", () => {
      render(<ThankYouPageTemplate content={baseContent} workshop={baseWorkshop} />);
      expect(screen.getByText("Scaling Up Masterclass")).toBeInTheDocument();
    });

    it("renders event time and timezone", () => {
      render(<ThankYouPageTemplate content={baseContent} workshop={baseWorkshop} />);
      expect(screen.getByText(/09:00 - 17:00/)).toBeInTheDocument();
    });

    it("shows Virtual Workshop label for virtual format", () => {
      render(<ThankYouPageTemplate content={baseContent} workshop={baseWorkshop} />);
      expect(screen.getAllByText("Virtual Workshop").length).toBeGreaterThanOrEqual(1);
    });

    it("shows in-person label for in-person format", () => {
      const workshop = { ...baseWorkshop, format: "IN_PERSON", venueName: "Marriott Hotel" };
      render(<ThankYouPageTemplate content={baseContent} workshop={workshop} />);
      expect(screen.getByText("In-Person")).toBeInTheDocument();
    });
  });

  describe("preview mode (isPreview=true)", () => {
    it("shows preview banner when isPreview is true", () => {
      render(<ThankYouPageTemplate content={baseContent} workshop={baseWorkshop} isPreview={true} />);
      expect(screen.getByText(/Preview — sample data shown/i)).toBeInTheDocument();
    });

    it("does not show preview banner when isPreview is false", () => {
      render(<ThankYouPageTemplate content={baseContent} workshop={baseWorkshop} isPreview={false} />);
      expect(screen.queryByText(/Preview — sample data shown/i)).not.toBeInTheDocument();
    });

    it("does not show preview banner by default (isPreview defaults to false)", () => {
      render(<ThankYouPageTemplate content={baseContent} workshop={baseWorkshop} />);
      expect(screen.queryByText(/Preview — sample data shown/i)).not.toBeInTheDocument();
    });

    it("calendar buttons are disabled in preview mode", () => {
      render(<ThankYouPageTemplate content={baseContent} workshop={baseWorkshop} isPreview={true} />);
      const googleCalBtn = screen.getByRole("button", { name: /google calendar/i });
      expect(googleCalBtn).toBeDisabled();
    });

    it("ics download button is disabled in preview mode", () => {
      render(<ThankYouPageTemplate content={baseContent} workshop={baseWorkshop} isPreview={true} />);
      const icsBtn = screen.getByRole("button", { name: /\.ics|download/i });
      expect(icsBtn).toBeDisabled();
    });

    it("does not render affiliate tracking pixel in preview mode", () => {
      const paidWorkshop = { ...baseWorkshop, isFree: false, priceCents: 19900 };
      render(<ThankYouPageTemplate content={baseContent} workshop={paidWorkshop} isPreview={true} />);
      const pixel = document.querySelector('img[src*="idevaffiliate"]');
      expect(pixel).not.toBeInTheDocument();
    });
  });

  describe("live mode (isPreview=false)", () => {
    it("Google Calendar button is a link in live mode", () => {
      render(<ThankYouPageTemplate content={baseContent} workshop={baseWorkshop} isPreview={false} />);
      const calLink = screen.getByRole("link", { name: /google calendar/i });
      expect(calLink).toBeInTheDocument();
      expect(calLink).toHaveAttribute("href", expect.stringContaining("calendar.google.com"));
    });

    it("does not render affiliate pixel for free workshops", () => {
      const freeWorkshop = { ...baseWorkshop, isFree: true, priceCents: 0 };
      render(<ThankYouPageTemplate content={baseContent} workshop={freeWorkshop} isPreview={false} />);
      const pixel = document.querySelector('img[src*="idevaffiliate"]');
      expect(pixel).not.toBeInTheDocument();
    });

    // CHG-03: the hardcoded iDev pixel is no longer rendered by the
    // template. <CustomCodeRenderer> at the page handler now reads
    // LandingPage.customCode + the resolved Stripe session amount.
    it("does NOT render affiliate pixel from the template (CustomCodeRenderer owns this)", () => {
      const paidWorkshop = { ...baseWorkshop, isFree: false, priceCents: 19900 };
      render(<ThankYouPageTemplate content={baseContent} workshop={paidWorkshop} isPreview={false} />);
      const pixel = document.querySelector('img[src*="idevaffiliate"]');
      expect(pixel).not.toBeInTheDocument();
    });
  });
});
