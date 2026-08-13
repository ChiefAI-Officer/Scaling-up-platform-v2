import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
      _count: { workshops: 0 },
      pricingTiers: [{ id: "tier-1", name: "Standard", amountCents: 15000, isActive: true }],
    }],
  });
});

it("shows the real category identity and edit action in compact records", async () => {
  render(<CategoriesPage responsiveEnabled />);

  const list = await screen.findByRole("list", { name: "Workshop categories" });
  expect(list).toHaveTextContent("Growth");
  expect(list).toHaveTextContent("Growth workshops");
  expect(list).toHaveTextContent("0");
  expect(list).toHaveTextContent("Pricing tiers");
  expect(screen.getByRole("button", { name: "Edit Growth" })).toHaveClass("min-h-11");
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
});

it("preserves the exact legacy category and pricing table structure by default", async () => {
  const categories = render(<CategoriesPage />);
  await screen.findByText("Growth");
  expect(screen.queryByRole("list", { name: "Workshop categories" })).not.toBeInTheDocument();
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  expect(screen.getByRole("table").parentElement).toHaveAttribute(
    "class",
    "bg-card rounded-xl shadow-sm border overflow-hidden",
  );
  const categoryRow = screen.getByRole("table").querySelector("tbody tr");
  expect(categoryRow?.children).toHaveLength(6);
  expect(screen.getByRole("button", { name: "Active" })).toHaveAttribute(
    "class",
    "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer bg-success/10 text-success hover:bg-success/20",
  );
  expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute(
    "class",
    "text-primary hover:text-primary/80 font-medium",
  );
  expect(screen.getByRole("button", { name: "Delete" })).toHaveAttribute(
    "class",
    "text-destructive hover:text-destructive/80 font-medium",
  );
  categories.unmount();

  global.fetch = jest.fn((url: string) => Promise.resolve({
    ok: true,
    json: async () => url.includes("pricing-tiers") ? [{
      id: "tier-1", name: "Standard", amountCents: 15000, description: null,
      isActive: true, categoryId: "category-1", category: { id: "category-1", name: "Growth" },
      _count: { workshops: 0 },
    }] : [{ id: "category-1", name: "Growth" }],
  })) as unknown as typeof fetch;
  render(<PricingPage />);
  await screen.findByText("Standard");
  expect(screen.queryByRole("list", { name: "Pricing tiers" })).not.toBeInTheDocument();
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  expect(screen.getByRole("table").parentElement).toHaveAttribute(
    "class",
    "bg-card rounded-xl shadow-sm border overflow-hidden",
  );
  const pricingRow = screen.getByRole("table").querySelector("tbody tr");
  expect(pricingRow?.children).toHaveLength(6);
  expect(screen.getByRole("button", { name: "Active" })).toHaveAttribute(
    "class",
    "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer bg-success/10 text-success hover:bg-success/20",
  );
  expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute(
    "class",
    "text-primary hover:text-primary/80 font-medium",
  );
  expect(screen.getByRole("button", { name: "Delete" })).toHaveAttribute(
    "class",
    "text-destructive hover:text-destructive/80 font-medium",
  );
  expect(screen.getByRole("button", { name: "All Categories" })).toHaveAttribute(
    "class",
    "px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors bg-primary text-primary-foreground border-primary",
  );
  expect(screen.getByRole("button", { name: "Growth" })).toHaveAttribute(
    "class",
    "px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors bg-card text-foreground border-border hover:bg-accent",
  );
});

it("makes responsive pricing filters and approval actions reachable at 44px", async () => {
  global.fetch = jest.fn((url: string) => Promise.resolve({
    ok: true,
    json: async () => url.includes("pricing-tiers") ? [{
      id: "tier-1", name: "Standard", amountCents: 15000, description: null,
      isActive: true, categoryId: "category-1", category: { id: "category-1", name: "Growth" },
      _count: { workshops: 0 },
    }] : url.includes("approvals") ? { approvals: [
      {
        id: "approval-1", type: "WORKSHOP_REQUEST", status: "PENDING", coachName: "Maria",
        details: "Growth workshop", workshopId: "workshop-1", workshopCode: "GROW",
        requestedAt: "2026-08-12T00:00:00.000Z", messages: [],
      },
      {
        id: "approval-2", type: "WORKSHOP_REQUEST", status: "DENIED", coachName: "Alex",
        details: "Denied workshop", requestedAt: "2026-08-11T00:00:00.000Z", messages: [],
      },
    ] } : [{ id: "category-1", name: "Growth" }],
  })) as unknown as typeof fetch;

  const { unmount } = render(<PricingPage responsiveEnabled />);
  await screen.findByRole("list", { name: "Pricing tiers" });
  expect(screen.getByRole("button", { name: "All Categories" })).toHaveClass("min-h-11");
  expect(screen.getByRole("button", { name: "Edit Standard" })).toHaveClass("min-h-11 min-w-11");
  expect(screen.getByRole("list", { name: "Pricing tiers" })).toHaveTextContent("Category");
  expect(screen.getByRole("list", { name: "Pricing tiers" })).toHaveTextContent("Workshops");
  expect(screen.getByRole("button", { name: "All Categories" }).parentElement).toHaveClass("flex-wrap");
  const pricingWide = screen.getByTestId("responsive-wide-view");
  for (const action of ["Active", "Edit", "Delete"]) {
    expect(within(pricingWide).getByRole("button", { name: action })).toHaveClass("min-h-11 min-w-11");
  }
  unmount();

  render(<ApprovalsPage responsiveEnabled />);
  expect(await screen.findByRole("button", { name: "Approve" })).toHaveClass("min-h-11");
  expect(screen.getByRole("button", { name: "Deny" })).toHaveClass("min-h-11");
  const approvalRecord = screen.getAllByRole("article")[0];
  expect(approvalRecord.querySelector("header")).toBeInTheDocument();
  expect(approvalRecord.querySelector("dl")).toBeInTheDocument();
  expect(within(approvalRecord).getByRole("link", { name: "Growth workshop" })).toHaveClass("min-h-11");
  expect(screen.getByRole("button", { name: "Move to Pending" })).toHaveClass("min-h-11");
  expect(within(approvalRecord).getByRole("button", { name: "Approve" }).parentElement?.parentElement).toHaveClass("grid-cols-[minmax(0,1fr)_auto]");
});

it("wraps a long responsive pricing category filter at tablet widths", async () => {
  const longCategories = Array.from({ length: 12 }, (_, index) => ({
    id: `category-${index}`,
    name: `Very long workshop category ${index}`,
  }));
  global.fetch = jest.fn((url: string) => Promise.resolve({
    ok: true,
    json: async () => url.includes("pricing-tiers") ? [] : longCategories,
  })) as unknown as typeof fetch;

  render(<PricingPage responsiveEnabled />);
  const filter = await screen.findByRole("group", { name: "Filter pricing tiers by category" });
  expect(filter).toHaveClass("flex-wrap");
  expect(filter).not.toHaveClass("sm:flex-nowrap");
  expect(within(filter).getAllByRole("button")).toHaveLength(13);
});

it("stacks enabled approval status filters below sm without a horizontal scroll rail", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ approvals: [] }) });

  render(<ApprovalsPage responsiveEnabled />);
  await screen.findByText("No pending approvals");

  const filters = screen.getByRole("group", { name: "Filter approvals by status" });
  expect(filters).toHaveClass("flex-col sm:flex-row sm:flex-wrap");
  expect(filters).not.toHaveClass("overflow-x-auto");
  for (const filter of within(filters).getAllByRole("button")) {
    expect(filter).toHaveClass("min-h-11 w-full sm:w-auto");
  }
});

it("sizes and stacks category create/edit fields and actions only when responsive mode is enabled", async () => {
  const enabled = render(<CategoriesPage responsiveEnabled />);
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "+ Add Category" }));

  for (const field of [
    screen.getByPlaceholderText("e.g. Master Class, Growth Summit"),
    screen.getByPlaceholderText("Optional description"),
    screen.getByPlaceholderText("e.g. Scaling Up AI Workshop"),
    screen.getByPlaceholderText("Default internal description for workshops in this category..."),
  ]) {
    expect(field).toHaveClass("min-h-11");
  }
  const enabledCreate = screen.getByRole("button", { name: "Create" });
  expect(enabledCreate).toHaveClass("min-h-11 w-full sm:w-auto");
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass("min-h-11 w-full sm:w-auto");
  expect(enabledCreate.parentElement).toHaveClass("flex-col sm:flex-row");
  enabled.unmount();

  render(<CategoriesPage />);
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "+ Add Category" }));
  expect(screen.getByPlaceholderText("e.g. Master Class, Growth Summit")).toHaveAttribute(
    "class",
    "w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary",
  );
  expect(screen.getByRole("button", { name: "Create" }).parentElement).toHaveAttribute("class", "flex gap-3");
  expect(screen.getByRole("button", { name: "Create" })).toHaveAttribute(
    "class",
    "px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium text-sm disabled:opacity-50",
  );
});

it("sizes and stacks pricing form fields and actions only when responsive mode is enabled", async () => {
  global.fetch = jest.fn((url: string) => Promise.resolve({
    ok: true,
    json: async () => url.includes("pricing-tiers") ? [] : [{ id: "category-1", name: "Growth" }],
  })) as unknown as typeof fetch;

  const enabled = render(<PricingPage responsiveEnabled />);
  const enabledAdd = screen.getByRole("button", { name: "+ Add Pricing Tier" });
  await waitFor(() => expect(enabledAdd).toBeEnabled());
  fireEvent.click(enabledAdd);
  for (const field of [
    screen.getByRole("combobox"),
    screen.getByPlaceholderText("e.g. Standard, Premium, Enterprise"),
    screen.getByPlaceholderText("0.00"),
    screen.getByPlaceholderText("Optional description"),
  ]) {
    expect(field).toHaveClass("min-h-11");
  }
  const enabledCreate = screen.getByRole("button", { name: "Create" });
  expect(enabledCreate).toHaveClass("min-h-11 w-full sm:w-auto");
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass("min-h-11 w-full sm:w-auto");
  expect(enabledCreate.parentElement).toHaveClass("flex-col sm:flex-row");
  enabled.unmount();

  render(<PricingPage />);
  const disabledAdd = screen.getByRole("button", { name: "+ Add Pricing Tier" });
  await waitFor(() => expect(disabledAdd).toBeEnabled());
  fireEvent.click(disabledAdd);
  expect(screen.getByRole("combobox")).toHaveAttribute(
    "class",
    "w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary disabled:bg-muted",
  );
  expect(screen.getByRole("button", { name: "Create" }).parentElement).toHaveAttribute("class", "flex gap-3 mt-4");
});

it("sizes every category wide-table action in responsive mode", async () => {
  render(<CategoriesPage responsiveEnabled />);
  const wide = await screen.findByTestId("responsive-wide-view");
  for (const action of ["Active", "Edit", "Delete"]) {
    expect(within(wide).getByRole("button", { name: action })).toHaveClass("min-h-11 min-w-11");
  }
  expect(screen.getByRole("button", { name: "Edit Growth" })).toHaveClass("min-h-11 min-w-11");
});

it("sizes the approval error dismiss control in responsive mode", async () => {
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ approvals: [{
      id: "approval-1", type: "WORKSHOP_REQUEST", status: "PENDING", coachName: "Maria",
      details: "Growth workshop", requestedAt: "2026-08-12T00:00:00.000Z", messages: [],
    }] }) })
    .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Approval failed" }) });
  render(<ApprovalsPage responsiveEnabled />);
  fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
  expect(await screen.findByRole("button", { name: "×" })).toHaveClass("min-h-11 min-w-11");
});

it("preserves the legacy approval card structure by default", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ approvals: [{
      id: "approval-1", type: "WORKSHOP_REQUEST", status: "PENDING", coachName: "Maria",
      details: "Growth workshop", requestedAt: "2026-08-12T00:00:00.000Z", messages: [],
    }] }),
  });
  render(<ApprovalsPage />);
  const heading = await screen.findByRole("heading", { name: /Maria/ });
  const card = heading.parentElement?.parentElement;
  expect(card?.getAttribute("class")).toBe(
    "bg-card p-6 rounded-xl shadow-sm grid grid-cols-[1fr_auto] gap-4 items-center ",
  );
  expect(card?.children).toHaveLength(2);
  expect(card?.firstElementChild).toBe(heading.parentElement);
  expect(card?.lastElementChild?.getAttribute("class")).toBe(
    "flex gap-2 items-center flex-wrap justify-end",
  );
  expect(screen.queryByRole("list", { name: "Approvals" })).not.toBeInTheDocument();
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  expect(card?.querySelector("header")).not.toBeInTheDocument();
  expect(card?.querySelector("dl")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Approve" })).not.toHaveClass("min-h-11");
});
