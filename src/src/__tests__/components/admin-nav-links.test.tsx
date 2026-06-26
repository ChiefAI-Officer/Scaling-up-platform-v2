let mockPathname = "/admin/dashboard";
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

import { render, screen, fireEvent, within } from "@testing-library/react";
import { AdminNavLinks } from "@/components/layout/admin-nav-links";
import type { BadgeCounts } from "@/lib/nav/admin-nav-model";

const COUNTS: BadgeCounts = { approvals: 3, refunds: 2 };

function renderNav(counts: BadgeCounts = COUNTS, path = "/admin/dashboard") {
  mockPathname = path;
  return render(<AdminNavLinks counts={counts} />);
}

beforeEach(() => {
  mockPathname = "/admin/dashboard";
});

describe("AdminNavLinks (desktop, Wave H)", () => {
  it("renders the 4 group triggers + Dashboard, Approvals, Assessments", () => {
    renderNav();
    for (const g of ["Workshops", "Automation", "People", "Financials"]) {
      expect(screen.getByRole("button", { name: new RegExp(g, "i") })).toBeInTheDocument();
    }
    expect(screen.getByText("Dashboard").closest("a")).not.toBeNull();
    expect(screen.getByText("Approvals").closest("a")).not.toBeNull();
    expect(screen.getByText("Assessments").closest("a")).not.toBeNull();
  });

  it("group label is a button (not a link) that toggles a panel without navigating", () => {
    renderNav();
    const trigger = screen.getByRole("button", { name: /Workshops/i });
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("All Workshops")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("group", { name: /Workshops/i });
    expect(within(panel).getByText("All Workshops")).toBeInTheDocument();
    expect(within(panel).getByText("Workshop Surveys")).toBeInTheDocument();
    expect(within(panel).getByText("Configuration")).toBeInTheDocument();
  });

  it("only one group is open at a time (opening a second closes the first)", () => {
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: /Workshops/i }));
    expect(screen.getByRole("group", { name: /Workshops/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Automation/i }));
    expect(screen.queryByRole("group", { name: /Workshops/i })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: /Automation/i })).toBeInTheDocument();
  });

  it("shows the Approvals pending badge at the top level", () => {
    renderNav();
    const approvals = screen.getByText("Approvals").closest("a")!;
    expect(within(approvals).getByText("3")).toBeInTheDocument();
  });

  it("hides a badge when the count is zero", () => {
    renderNav({ approvals: 0, refunds: 0 });
    const approvals = screen.getByText("Approvals").closest("a")!;
    expect(within(approvals).queryByText("0")).not.toBeInTheDocument();
    const financials = screen.getByRole("button", { name: /Financials/i });
    expect(within(financials).queryByText(/\d/)).not.toBeInTheDocument();
  });

  it("rolls the Refunds badge onto the closed Financials trigger; shows it on the leaf when open", () => {
    renderNav();
    const financials = screen.getByRole("button", { name: /Financials/i });
    expect(within(financials).getByText("2")).toBeInTheDocument();

    fireEvent.click(financials);
    const panel = screen.getByRole("group", { name: /Financials/i });
    const refundsLeaf = within(panel).getByText("Refunds").closest("a")!;
    expect(within(refundsLeaf).getByText("2")).toBeInTheDocument();
    expect(within(financials).queryByText("2")).not.toBeInTheDocument();
  });

  it("highlights the active group and marks the active leaf aria-current", () => {
    renderNav(COUNTS, "/workshops");
    const trigger = screen.getByRole("button", { name: /Workshops/i });
    expect(trigger.className).toMatch(/text-primary/);

    fireEvent.click(trigger);
    const panel = screen.getByRole("group", { name: /Workshops/i });
    const leaf = within(panel).getByText("All Workshops").closest("a")!;
    expect(leaf).toHaveAttribute("aria-current", "page");
  });

  it("closes on Escape and returns focus to the trigger", () => {
    renderNav();
    const trigger = screen.getByRole("button", { name: /Workshops/i });
    fireEvent.click(trigger);
    const panel = screen.getByRole("group", { name: /Workshops/i });

    fireEvent.keyDown(panel, { key: "Escape" });
    expect(screen.queryByRole("group", { name: /Workshops/i })).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(trigger);
  });

  it("cycles focus among panel links with ArrowDown (enhancement)", () => {
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: /Workshops/i }));
    const panel = screen.getByRole("group", { name: /Workshops/i });
    const links = within(panel).getAllByRole("link");
    links[0].focus();
    expect(document.activeElement).toBe(links[0]);
    fireEvent.keyDown(links[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(links[1]);
  });
});
