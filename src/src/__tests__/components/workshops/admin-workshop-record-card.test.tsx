import { fireEvent, render, screen } from "@testing-library/react";
import { AdminWorkshopRecordCard } from "@/components/workshops/admin-workshop-record-card";

const workshop = {
  id: "workshop-1",
  title: "Scaling Up Leadership Intensive",
  status: "AWAITING_APPROVAL",
  eventDate: "2026-08-20T00:00:00.000Z",
  eventTime: "9:00 AM-5:00 PM",
  timezone: "America/Chicago",
  createdAt: "2026-08-12T15:30:00.000Z",
  format: "IN_PERSON",
  maxAttendees: 30,
  isFree: false,
  priceCents: 25000,
  earlyBirdPriceCents: null,
  landingPageSlug: "leadership-intensive",
  coach: { firstName: "Jordan", lastName: "Lee" },
  workshopType: { name: "Leadership Workshop" },
  pricingTier: { name: "Full Day" },
  _count: { registrations: 12 },
};

describe("AdminWorkshopRecordCard", () => {
  it("keeps every workshop record field and action reachable", () => {
    render(
      <AdminWorkshopRecordCard
        workshop={workshop}
        appUrl="https://example.test"
        action={<button type="button">Approve workshop</button>}
      />,
    );

    expect(screen.getByRole("link", { name: workshop.title })).toHaveAttribute(
      "href",
      `/workshops/${workshop.id}`,
    );
    expect(screen.getByText("Jordan Lee")).toBeInTheDocument();
    expect(screen.getByText("Aug 20, 2026")).toBeInTheDocument();
    expect(screen.getByText(/9:00 AM CDT/)).toBeInTheDocument();
    expect(screen.getByText("Approval Pending")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "12 / 30" })).toHaveAttribute(
      "href",
      "/workshops/workshop-1#registrations",
    );
    expect(screen.getByText("$250.00")).toBeInTheDocument();
    expect(screen.getByText("Full Day")).toBeInTheDocument();
    expect(screen.getByText("In-Person")).toBeInTheDocument();
    expect(screen.getByTitle("https://example.test/workshop/leadership-intensive")).toBeInTheDocument();

    const actions = screen.getByRole("button", { name: /more workshop actions/i });
    expect(actions).toHaveClass("min-h-11");
    fireEvent.keyDown(actions, { key: "ArrowDown" });
    expect(screen.getByRole("button", { name: "Approve workshop" })).toBeInTheDocument();
  });
});
