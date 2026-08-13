import { render, screen, waitFor } from "@testing-library/react";
import CategoriesPage from "@/app/(dashboard)/admin/categories/categories-client";
import PricingPage from "@/app/(dashboard)/admin/pricing/pricing-client";
import ApprovalsPage from "@/app/(dashboard)/admin/approvals/approvals-client";

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => [{
      id: "category-1",
      name: "Growth",
      slug: "growth",
      description: "Growth workshops",
      defaultTitle: null,
      defaultDescription: null,
      isActive: true,
      _count: { workshops: 2 },
      pricingTiers: [],
    }],
  });
});

it("shows the real category identity and edit action in compact records", async () => {
  render(<CategoriesPage responsiveEnabled />);

  const list = await screen.findByRole("list", { name: "Workshop categories" });
  expect(list).toHaveTextContent("Growth");
  expect(list).toHaveTextContent("Growth workshops");
  expect(list).toHaveTextContent("2");
  expect(list).toHaveTextContent("Pricing tiers");
  expect(screen.getByRole("button", { name: "Edit Growth" })).toHaveClass("min-h-11");
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
});

it("keeps category and pricing presenters on their original wide presentation by default", async () => {
  render(<CategoriesPage />);
  await screen.findByText("Growth");
  expect(screen.queryByRole("list", { name: "Workshop categories" })).not.toBeInTheDocument();

  global.fetch = jest.fn((url: string) => Promise.resolve({
    ok: true,
    json: async () => url.includes("pricing-tiers") ? [{
      id: "tier-1", name: "Standard", amountCents: 15000, description: null,
      isActive: true, categoryId: "category-1", category: { id: "category-1", name: "Growth" },
      _count: { workshops: 1 },
    }] : [{ id: "category-1", name: "Growth" }],
  })) as unknown as typeof fetch;
  render(<PricingPage />);
  await screen.findByText("Standard");
  expect(screen.queryByRole("list", { name: "Pricing tiers" })).not.toBeInTheDocument();
});

it("makes responsive pricing filters and approval actions reachable at 44px", async () => {
  global.fetch = jest.fn((url: string) => Promise.resolve({
    ok: true,
    json: async () => url.includes("pricing-tiers") ? [{
      id: "tier-1", name: "Standard", amountCents: 15000, description: null,
      isActive: true, categoryId: "category-1", category: { id: "category-1", name: "Growth" },
      _count: { workshops: 1 },
    }] : url.includes("approvals") ? { approvals: [{
      id: "approval-1", type: "WORKSHOP_REQUEST", status: "PENDING", coachName: "Maria",
      details: "Growth workshop", requestedAt: "2026-08-12T00:00:00.000Z", messages: [],
    }] } : [{ id: "category-1", name: "Growth" }],
  })) as unknown as typeof fetch;

  const { unmount } = render(<PricingPage responsiveEnabled />);
  await screen.findByRole("list", { name: "Pricing tiers" });
  expect(screen.getByRole("button", { name: "All Categories" })).toHaveClass("min-h-11");
  expect(screen.getByRole("button", { name: "Edit Standard" })).toHaveClass("min-h-11");
  expect(screen.getByRole("list", { name: "Pricing tiers" })).toHaveTextContent("Category");
  expect(screen.getByRole("list", { name: "Pricing tiers" })).toHaveTextContent("Workshops");
  expect(screen.getByRole("button", { name: "All Categories" }).parentElement).toHaveClass("flex-wrap");
  unmount();

  render(<ApprovalsPage responsiveEnabled />);
  expect(await screen.findByRole("button", { name: "Approve" })).toHaveClass("min-h-11");
  expect(screen.getByRole("button", { name: "Deny" })).toHaveClass("min-h-11");
  expect(screen.getByRole("article")).toBeInTheDocument();
});
