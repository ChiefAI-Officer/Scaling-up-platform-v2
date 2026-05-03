import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NewWorkshopForm } from "@/app/(dashboard)/workshops/new/page";

const mockCategory = {
  id: "cat-1",
  name: "AI Workshop",
  slug: "ai-workshop",
  defaultTitle: null,
  defaultDescription: null,
  pricingTiers: [{ id: "tier-1", name: "Full Day", amountCents: 39500, description: null }],
};

const mockCoach = {
  id: "coach-1",
  firstName: "Jane",
  lastName: "Smith",
  email: "jane@example.com",
  title: "Coach",
  linkedinUrl: null,
  bio: "Bio text",
  profileImage: null,
  certifications: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  (global.fetch as jest.Mock) = jest.fn().mockImplementation((url: string) => {
    if (url.includes("/api/categories"))
      return Promise.resolve({ ok: true, json: async () => [mockCategory] });
    if (url.includes("/api/workshop-types"))
      return Promise.resolve({ ok: true, json: async () => [] });
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
});

describe("NewWorkshopForm — coach portal pricing visibility", () => {
  it("hides custom price fields by default in coach portal", async () => {
    render(<NewWorkshopForm isCoachPortal prefilledCoach={mockCoach} />);
    await waitFor(() => expect(screen.getByText("AI Workshop")).toBeInTheDocument());

    expect(screen.queryByLabelText(/Custom Price/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Custom Pricing Notes/i)).not.toBeInTheDocument();
  });

  it("shows 'Request custom pricing' button in coach portal", async () => {
    render(<NewWorkshopForm isCoachPortal prefilledCoach={mockCoach} />);
    await waitFor(() => expect(screen.getByText("AI Workshop")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /request custom pricing/i })).toBeInTheDocument();
  });

  it("reveals custom price fields when toggle is clicked", async () => {
    render(<NewWorkshopForm isCoachPortal prefilledCoach={mockCoach} />);
    await waitFor(() => expect(screen.getByText("AI Workshop")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /request custom pricing/i }));

    expect(screen.getByLabelText(/Custom Price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Custom Pricing Notes/i)).toBeInTheDocument();
  });

  it("hides toggle button after it is clicked", async () => {
    render(<NewWorkshopForm isCoachPortal prefilledCoach={mockCoach} />);
    await waitFor(() => expect(screen.getByText("AI Workshop")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /request custom pricing/i }));

    expect(screen.queryByRole("button", { name: /request custom pricing/i })).not.toBeInTheDocument();
  });

  it("always shows custom price fields in admin path", async () => {
    render(<NewWorkshopForm isCoachPortal={false} />);
    await waitFor(() => expect(screen.getByText("AI Workshop")).toBeInTheDocument());

    expect(screen.getByLabelText(/Custom Price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Custom Pricing Notes/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /request custom pricing/i })).not.toBeInTheDocument();
  });

  it("toggle button has correct aria attributes for accessibility", async () => {
    render(<NewWorkshopForm isCoachPortal prefilledCoach={mockCoach} />);
    await waitFor(() => expect(screen.getByText("AI Workshop")).toBeInTheDocument());

    const btn = screen.getByRole("button", { name: /request custom pricing/i });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(btn).toHaveAttribute("aria-controls", "custom-pricing-section");
  });

  it('ENH-02: pricing tier select uses "Workshop Type *" label (not "Workshop Price *")', async () => {
    render(<NewWorkshopForm isCoachPortal={false} />);
    await waitFor(() => expect(screen.getByText("AI Workshop")).toBeInTheDocument());
    // Selecting the category surfaces the pricing-tier dropdown that owns this label.
    fireEvent.click(screen.getByText("AI Workshop"));

    expect(screen.getByText("Workshop Type *")).toBeInTheDocument();
    expect(screen.queryByText("Workshop Price *")).not.toBeInTheDocument();
  });
});
