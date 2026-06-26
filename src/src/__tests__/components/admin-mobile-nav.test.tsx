let mockPathname = "/admin/dashboard";
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));
jest.mock("next-auth/react", () => ({
  signOut: jest.fn(),
}));

import { render, screen, fireEvent, within } from "@testing-library/react";
import { AdminMobileNav } from "@/components/layout/admin-mobile-nav";
import type { BadgeCounts } from "@/lib/nav/admin-nav-model";

const COUNTS: BadgeCounts = { approvals: 3, refunds: 2 };

function open(counts: BadgeCounts = COUNTS, path = "/admin/dashboard") {
  mockPathname = path;
  render(<AdminMobileNav counts={counts} email="suzanne@scalingup.com" />);
  fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
}

beforeEach(() => {
  mockPathname = "/admin/dashboard";
});

describe("AdminMobileNav (Wave H)", () => {
  it("is collapsed until the hamburger is clicked", () => {
    render(<AdminMobileNav counts={COUNTS} email="x@y.com" />);
    expect(screen.queryByText("Workshops")).not.toBeInTheDocument();
  });

  it("shows group headers + standalone links when open, with groups collapsed", () => {
    open();
    expect(screen.getByText("Workshops")).toBeInTheDocument(); // header
    expect(screen.getByText("Approvals")).toBeInTheDocument(); // standalone link
    expect(screen.getByText("Assessments")).toBeInTheDocument();
    // Collapsed by default → leaves hidden until the header is tapped.
    expect(screen.queryByText("All Workshops")).not.toBeInTheDocument();
  });

  it("expands a group when its header is clicked", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /Workshops/i }));
    expect(screen.getByText("All Workshops")).toBeInTheDocument();
  });

  it("auto-expands the group containing the current route", () => {
    open(COUNTS, "/workshops");
    expect(screen.getByText("All Workshops")).toBeInTheDocument();
  });

  it("shows the Approvals badge (standalone) and the Refunds badge once Financials is expanded", () => {
    open();
    const approvals = screen.getByText("Approvals").closest("a")!;
    expect(within(approvals).getByText("3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Financials/i }));
    const refunds = screen.getByText("Refunds").closest("a")!;
    expect(within(refunds).getByText("2")).toBeInTheDocument();
  });

  it("hides badges when counts are zero", () => {
    open({ approvals: 0, refunds: 0 });
    const approvals = screen.getByText("Approvals").closest("a")!;
    expect(within(approvals).queryByText("0")).not.toBeInTheDocument();
  });

  it("renders no '→' gateway arrow on the Assessments mobile link", () => {
    open();
    expect(screen.getByText("Assessments").closest("a")).not.toHaveTextContent("→");
  });
});
