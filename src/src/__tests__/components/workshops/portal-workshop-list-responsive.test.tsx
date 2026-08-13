import { render, screen, within } from "@testing-library/react";
import { PortalWorkshopList } from "@/components/workshops/workshop-list-filters";

const fixture = {
  id: "workshop-responsive-1",
  title: "A deliberately long workshop title that must wrap on compact screens without overflowing",
  workshopCode: "WS-RESPONSIVE",
  status: "AWAITING_APPROVAL",
  eventDate: "2026-10-01T00:00:00.000Z",
  maxAttendees: 40,
  workshopType: { name: "Scaling Up Workshop" },
  _count: { registrations: 24 },
  landingPageUrl: "https://example.com/workshop/a-deliberately-long-landing-page-url",
  isFree: false,
  priceCents: 49500,
  pricingTier: { name: "Full-Day", amountCents: 49500 },
  hasPendingPriceChange: true,
  hasCounterOffer: true,
};

describe("PortalWorkshopList responsive presentation", () => {
  it("renders workshop cards only when the responsive presentation is enabled", () => {
    const { rerender } = render(
      <PortalWorkshopList workshops={[fixture]} responsiveEnabled />,
    );

    const cards = screen.getByRole("list", { name: "Workshops" });
    expect(within(cards).getByText(fixture.title)).toBeInTheDocument();
    expect(within(cards).getByText("24 of 40 max")).toBeInTheDocument();
    expect(within(cards).getByText(/counter-offer/i)).toBeInTheDocument();
    expect(
      within(cards).getByRole("link", { name: /manage workshop/i }),
    ).toHaveAttribute("href", `/portal/workshops/${fixture.id}`);

    rerender(
      <PortalWorkshopList workshops={[fixture]} responsiveEnabled={false} />,
    );
    expect(
      screen.queryByRole("list", { name: "Workshops" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});
