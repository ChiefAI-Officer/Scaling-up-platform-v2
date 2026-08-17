import { render, screen, within } from "@testing-library/react";

const mockResponsiveFlag = jest.fn(() => true);
jest.mock("@/lib/mobile-responsive-flags", () => ({ isMobileResponsiveEnabled: () => mockResponsiveFlag() }));
jest.mock("@/components/ui/animated", () => ({
  FadeUp: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  StaggerContainer: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  StaggerItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/components/financials/financial-filters", () => ({ FinancialFilters: ({ responsiveEnabled }: { responsiveEnabled?: boolean }) => <div data-testid="financial-filters" data-responsive={String(responsiveEnabled)}>Financial filters</div> }));
jest.mock("next-auth", () => ({ getServerSession: jest.fn().mockResolvedValue({ user: { role: "ADMIN", email: "admin@example.com" } }) }));
jest.mock("next/navigation", () => ({ redirect: jest.fn(), useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock("@/lib/auth/auth", () => ({ authOptions: {} }));
jest.mock("@/components/auth/change-password-form", () => function ChangePasswordFormMock({ responsiveEnabled }: { responsiveEnabled?: boolean }) { return <button data-testid="password-form" data-responsive={String(responsiveEnabled)}>Update Password</button>; });
jest.mock("@/components/admin/invite-admin-section", () => ({ InviteAdminSection: ({ responsiveEnabled }: { responsiveEnabled?: boolean }) => <button data-testid="invite-section" data-responsive={String(responsiveEnabled)}>Invite admin</button> }));

const registrationFindMany = jest.fn().mockResolvedValue([{ id: "registration-1", firstName: "Maria", lastName: "Lee", email: "maria@example.com", amountPaidCents: 15000, stripePaymentId: "pi_123", workshop: { id: "workshop-1", title: "Growth workshop", workshopCode: "GROW", updatedAt: new Date("2026-08-12") } }]);
const mockRegistrationAggregate = jest.fn().mockResolvedValue({ _sum: { amountPaidCents: 0 } });
const mockWorkshopFindMany = jest.fn().mockResolvedValue([]);
const mockWorkshopTypeFindMany = jest.fn().mockResolvedValue([]);
jest.mock("@/lib/db", () => ({
  db: {
    coach: { findMany: jest.fn().mockResolvedValue([]) },
    category: { findMany: jest.fn().mockResolvedValue([]) },
    registration: { aggregate: (...args: unknown[]) => mockRegistrationAggregate(...args), count: jest.fn().mockResolvedValue(0), findMany: (...args: unknown[]) => registrationFindMany(...args) },
    workshop: { findMany: (...args: unknown[]) => mockWorkshopFindMany(...args) },
    workshopType: { findMany: (...args: unknown[]) => mockWorkshopTypeFindMany(...args) },
  },
}));

import FinancialsPage from "@/app/(dashboard)/admin/financials/page";
import RefundsPage from "@/app/(dashboard)/admin/refunds-needed/page";
import SettingsPage from "@/app/(dashboard)/admin/settings/page";

beforeEach(() => {
  mockResponsiveFlag.mockReturnValue(true);
  registrationFindMany.mockClear();
  mockRegistrationAggregate.mockReset().mockResolvedValue({ _sum: { amountPaidCents: 0 } });
  mockWorkshopFindMany.mockReset().mockResolvedValue([]);
  mockWorkshopTypeFindMany.mockReset().mockResolvedValue([]);
});

it("keeps the financial comparison table bounded and named", async () => {
  render(await FinancialsPage({ searchParams: Promise.resolve({ period: "all" }) }));
  expect(screen.getByRole("region", { name: "Revenue by workshop table" })).toHaveClass("overflow-x-auto");
  expect(screen.getByTestId("financial-filters")).toHaveAttribute("data-responsive", "true");
});

it("puts responsive revenue identity and value above the full-width progress bar and sizes financial links", async () => {
  mockRegistrationAggregate.mockResolvedValue({ _sum: { amountPaidCents: 10000 } });
  mockWorkshopFindMany.mockResolvedValue([{
    id: "workshop-1",
    title: "Growth workshop",
    workshopCode: "GROW",
    eventDate: new Date("2026-08-12T00:00:00.000Z"),
    status: "APPROVED",
    coach: { firstName: "Maria", lastName: "Lee" },
    registrations: [{ amountPaidCents: 10000 }],
    _count: { registrations: 1 },
  }]);
  mockWorkshopTypeFindMany.mockResolvedValue([{
    id: "type-1",
    name: "Growth",
    workshops: [{ registrations: [{ amountPaidCents: 10000 }] }],
  }]);

  render(await FinancialsPage({ searchParams: Promise.resolve({ period: "all" }) }));

  const revenue = screen.getByRole("group", { name: "Growth revenue" });
  expect(revenue.children).toHaveLength(2);
  expect(within(revenue.children[0] as HTMLElement).getByText("Growth")).toBeInTheDocument();
  expect(within(revenue.children[0] as HTMLElement).getByText("$100.00")).toBeInTheDocument();
  expect(within(revenue.children[0] as HTMLElement).getByText("100%")).toBeInTheDocument();
  expect(within(revenue).getByRole("progressbar", { name: "Growth share of revenue" })).toBe(revenue.children[1]);
  expect(screen.getByRole("link", { name: "Admin Dashboard" })).toHaveClass("min-h-11 min-w-11");
  expect(screen.getByRole("link", { name: "Growth workshop" })).toHaveClass("min-h-11 min-w-11");
});

it("preserves exact legacy financial revenue-row and link classes", async () => {
  mockResponsiveFlag.mockReturnValue(false);
  mockRegistrationAggregate.mockResolvedValue({ _sum: { amountPaidCents: 10000 } });
  mockWorkshopFindMany.mockResolvedValue([{
    id: "workshop-1",
    title: "Growth workshop",
    workshopCode: "GROW",
    eventDate: new Date("2026-08-12T00:00:00.000Z"),
    status: "APPROVED",
    coach: { firstName: "Maria", lastName: "Lee" },
    registrations: [{ amountPaidCents: 10000 }],
    _count: { registrations: 1 },
  }]);
  mockWorkshopTypeFindMany.mockResolvedValue([{
    id: "type-1",
    name: "Growth",
    workshops: [{ registrations: [{ amountPaidCents: 10000 }] }],
  }]);

  render(await FinancialsPage({ searchParams: Promise.resolve({ period: "all" }) }));

  const identity = screen.getByText("Growth");
  const revenueRow = identity.parentElement;
  expect(revenueRow).toHaveAttribute("class", "flex items-center gap-4");
  expect(identity).toHaveAttribute("class", "w-40 text-sm font-medium text-foreground truncate");
  expect(revenueRow?.children[1]).toHaveAttribute("class", "flex-1 bg-muted rounded-full h-4 overflow-hidden");
  expect(revenueRow?.children[1]?.firstElementChild).toHaveAttribute("class", "bg-primary h-full rounded-full transition-all");
  expect(screen.getByRole("link", { name: "Admin Dashboard" })).toHaveAttribute("class", "hover:text-foreground");
  expect(screen.getByRole("link", { name: "Growth workshop" })).toHaveAttribute("class", "text-primary hover:text-primary/80 font-medium text-sm");
});

it("preserves original financial and refund table structure when responsive mode is disabled", async () => {
  mockResponsiveFlag.mockReturnValue(false);
  const financials = render(await FinancialsPage({ searchParams: Promise.resolve({ period: "all" }) }));
  expect(screen.queryByRole("region", { name: "Revenue by workshop table" })).not.toBeInTheDocument();
  expect(screen.getByTestId("financial-filters")).toHaveAttribute("data-responsive", "false");
  financials.unmount();
  render(await RefundsPage());
  expect(screen.queryByRole("region", { name: "Refunds needed table" })).not.toBeInTheDocument();
  expect(screen.queryByRole("list", { name: "Refunds needed" })).not.toBeInTheDocument();
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  expect(screen.getByRole("table").parentElement).toHaveAttribute(
    "class",
    "relative w-full overflow-auto rounded-lg border",
  );
  expect(screen.getByRole("link", { name: "Stripe dashboard" })).toHaveClass("underline");
  expect(screen.getByRole("link", { name: "Stripe dashboard" })).not.toHaveClass("min-h-11");
  expect(screen.getByRole("button", { name: "Mark Refunded" })).not.toHaveClass("min-h-11");
});

it("uses responsive shells while keeping the real refund and settings actions", async () => {
  const refunds = render(await RefundsPage());
  const list = screen.getByRole("list", { name: "Refunds needed" });
  expect(list).toHaveTextContent("Growth workshop");
  expect(within(list).getByRole("button", { name: "Mark Refunded" })).toHaveClass("min-h-11");
  expect(screen.getByRole("link", { name: "Stripe dashboard" })).toHaveClass("min-h-11");
  for (const link of screen.getAllByRole("link", { name: /View in Stripe/ })) {
    expect(link).toHaveClass("min-h-11");
  }
  for (const button of screen.getAllByRole("button", { name: "Mark Refunded" })) {
    expect(button).toHaveClass("min-h-11");
  }
  refunds.unmount();

  render(await SettingsPage());
  expect(document.querySelector("[data-responsive-page-header]")).toHaveTextContent("Admin Settings");
  expect(screen.getByRole("button", { name: "Update Password" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Invite admin" })).toBeInTheDocument();
  expect(screen.getByTestId("password-form")).toHaveAttribute("data-responsive", "true");
  expect(screen.getByTestId("invite-section")).toHaveAttribute("data-responsive", "true");
});

it("threads disabled settings mode into both default-off interactive presenters", async () => {
  mockResponsiveFlag.mockReturnValue(false);
  render(await SettingsPage());
  expect(screen.getByTestId("password-form")).toHaveAttribute("data-responsive", "false");
  expect(screen.getByTestId("invite-section")).toHaveAttribute("data-responsive", "false");
});
