import { fireEvent, render, screen, within } from "@testing-library/react";
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
      <PortalWorkshopList workshops={[fixture]} isAdmin responsiveEnabled />,
    );

    const cards = screen.getByRole("list", { name: "Workshops" });
    const titleLink = within(cards).getByRole("link", { name: fixture.title });
    expect(titleLink).toBeInTheDocument();
    expect(titleLink).toHaveClass("min-h-11", "min-w-11");
    expect(within(cards).getByText("24 of 40 max")).toBeInTheDocument();
    expect(within(cards).getByText(/counter-offer/i)).toBeInTheDocument();
    expect(within(cards).getByText("Cost")).toBeInTheDocument();
    expect(within(cards).getByText("$495.00")).toBeInTheDocument();
    expect(within(cards).getByTitle(fixture.landingPageUrl)).toBeInTheDocument();
    expect(
      within(cards).getByRole("link", { name: /manage workshop/i }),
    ).toHaveAttribute("href", `/portal/workshops/${fixture.id}`);

    const wideRegion = screen.getByRole("region", { name: "Workshop table" });
    expect(wideRegion).toHaveAttribute("tabindex", "0");
    expect(wideRegion).toHaveClass("overflow-x-auto");

    expect(screen.getByPlaceholderText("Search workshops...")).toHaveClass(
      "min-h-11",
    );
    fireEvent.click(screen.getByRole("button", { name: /filters/i }));
    expect(screen.getByRole("combobox", { name: /status/i })).toHaveClass(
      "min-h-11",
    );

    rerender(
      <PortalWorkshopList workshops={[fixture]} responsiveEnabled={false} />,
    );
    expect(
      screen.queryByRole("list", { name: "Workshops" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Workshop table" }),
    ).not.toBeInTheDocument();
  });

  it("shows landing-page copy only when the existing availability rule permits it", () => {
    const { rerender } = render(
      <PortalWorkshopList workshops={[fixture]} responsiveEnabled />,
    );

    const cards = screen.getByRole("list", { name: "Workshops" });
    expect(within(cards).queryByTitle(fixture.landingPageUrl)).not.toBeInTheDocument();
    expect(within(cards).getByText("Available after approval")).toBeInTheDocument();

    rerender(
      <PortalWorkshopList
        workshops={[{ ...fixture, status: "PRE_EVENT" }]}
        responsiveEnabled
      />,
    );
    expect(
      within(screen.getByRole("list", { name: "Workshops" })).getByTitle(
        fixture.landingPageUrl,
      ),
    ).toBeInTheDocument();
  });
});
