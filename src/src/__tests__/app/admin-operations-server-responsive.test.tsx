import { render, screen, within } from "@testing-library/react";

const mockResponsiveFlag = jest.fn(() => true);
jest.mock("@/lib/mobile-responsive-flags", () => ({ isMobileResponsiveEnabled: () => mockResponsiveFlag() }));
jest.mock("@/components/ui/animated", () => ({
  FadeUp: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  StaggerContainer: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  StaggerItem: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/components/financials/financial-filters", () => ({ FinancialFilters: () => <div>Financial filters</div> }));
jest.mock("next-auth", () => ({ getServerSession: jest.fn().mockResolvedValue({ user: { role: "ADMIN", email: "admin@example.com" } }) }));
jest.mock("next/navigation", () => ({ redirect: jest.fn(), useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock("@/lib/auth/auth", () => ({ authOptions: {} }));
jest.mock("@/components/auth/change-password-form", () => function ChangePasswordFormMock() { return <button>Update Password</button>; });
jest.mock("@/components/admin/invite-admin-section", () => ({ InviteAdminSection: () => <button>Invite admin</button> }));

const registrationFindMany = jest.fn().mockResolvedValue([{ id: "registration-1", firstName: "Maria", lastName: "Lee", email: "maria@example.com", amountPaidCents: 15000, stripePaymentId: "pi_123", workshop: { id: "workshop-1", title: "Growth workshop", workshopCode: "GROW", updatedAt: new Date("2026-08-12") } }]);
jest.mock("@/lib/db", () => ({
  db: {
    coach: { findMany: jest.fn().mockResolvedValue([]) },
    category: { findMany: jest.fn().mockResolvedValue([]) },
    registration: { aggregate: jest.fn().mockResolvedValue({ _sum: { amountPaidCents: 0 } }), count: jest.fn().mockResolvedValue(0), findMany: (...args: unknown[]) => registrationFindMany(...args) },
    workshop: { findMany: jest.fn().mockResolvedValue([]) },
    workshopType: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

import FinancialsPage from "@/app/(dashboard)/admin/financials/page";
import RefundsPage from "@/app/(dashboard)/admin/refunds-needed/page";
import SettingsPage from "@/app/(dashboard)/admin/settings/page";

beforeEach(() => {
  mockResponsiveFlag.mockReturnValue(true);
  registrationFindMany.mockClear();
});

it("keeps the financial comparison table bounded and named", async () => {
  render(await FinancialsPage({ searchParams: Promise.resolve({ period: "all" }) }));
  expect(screen.getByRole("region", { name: "Revenue by workshop table" })).toHaveClass("overflow-x-auto");
});

it("preserves original financial and refund table structure when responsive mode is disabled", async () => {
  mockResponsiveFlag.mockReturnValue(false);
  const financials = render(await FinancialsPage({ searchParams: Promise.resolve({ period: "all" }) }));
  expect(screen.queryByRole("region", { name: "Revenue by workshop table" })).not.toBeInTheDocument();
  financials.unmount();
  render(await RefundsPage());
  expect(screen.queryByRole("region", { name: "Refunds needed table" })).not.toBeInTheDocument();
});

it("uses responsive shells while keeping the real refund and settings actions", async () => {
  const refunds = render(await RefundsPage());
  const list = screen.getByRole("list", { name: "Refunds needed" });
  expect(list).toHaveTextContent("Growth workshop");
  expect(within(list).getByRole("button", { name: "Mark Refunded" })).toHaveClass("min-h-11");
  refunds.unmount();

  render(await SettingsPage());
  expect(document.querySelector("[data-responsive-page-header]")).toHaveTextContent("Admin Settings");
  expect(screen.getByRole("button", { name: "Update Password" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Invite admin" })).toBeInTheDocument();
});
