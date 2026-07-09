/**
 * AssessmentsSidebar — Phase A IA refactor.
 *
 * Covers:
 *   - 7 admin entries render for ADMIN role (with Aggregate Report visible)
 *   - Aggregate Report row hidden when canAccessAggregateReport returns false
 *   - Admin section hidden when role is COACH
 *   - Coach-lane section renders ONLY when role is COACH
 */

jest.mock("next/navigation", () => ({
  usePathname: () => "/admin/assessments",
}));

const mockCanAccessAggregateReport = jest.fn<boolean, [{ role: string }]>();

jest.mock("@/lib/assessments/access-control", () => ({
  canAccessAggregateReport: (actor: { role: string }) =>
    mockCanAccessAggregateReport(actor),
}));

import { render, screen } from "@testing-library/react";
import type { Session } from "next-auth";
import { AssessmentsSidebar } from "@/components/nav/assessments-sidebar";

function makeSession(role: "ADMIN" | "STAFF" | "COACH"): Session {
  return {
    expires: "9999-01-01",
    user: {
      name: "Test",
      email: "test@example.com",
      // @ts-expect-error — extended session shape in NextAuth typing
      role,
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCanAccessAggregateReport.mockReturnValue(true);
});

describe("AssessmentsSidebar", () => {
  it("renders 7 admin entries for ADMIN role (including Aggregate Report)", () => {
    render(<AssessmentsSidebar session={makeSession("ADMIN")} />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Organizations")).toBeInTheDocument();
    expect(screen.getByText("Access Groups")).toBeInTheDocument();
    expect(screen.getByText("Templates")).toBeInTheDocument();
    expect(screen.getByText("Campaigns")).toBeInTheDocument();
    expect(screen.getByText("Public Campaigns")).toBeInTheDocument();
    expect(screen.getByText("Aggregate Report")).toBeInTheDocument();
  });

  it("hides Aggregate Report when canAccessAggregateReport returns false", () => {
    mockCanAccessAggregateReport.mockReturnValue(false);
    render(<AssessmentsSidebar session={makeSession("ADMIN")} />);
    expect(screen.queryByText("Aggregate Report")).not.toBeInTheDocument();
    // Other admin entries still render.
    expect(screen.getByText("Templates")).toBeInTheDocument();
    expect(screen.getByText("Organizations")).toBeInTheDocument();
  });

  it("hides the admin section entirely when role is COACH", () => {
    render(<AssessmentsSidebar session={makeSession("COACH")} />);
    // Admin-only labels disappear (Organizations / Access Groups / Templates /
    // Campaigns / Public Campaigns / Aggregate Report). The "Dashboard" label
    // is admin-only as well — coaches see "My Campaigns" / "Members".
    expect(screen.queryByText("Organizations")).not.toBeInTheDocument();
    expect(screen.queryByText("Access Groups")).not.toBeInTheDocument();
    expect(screen.queryByText("Templates")).not.toBeInTheDocument();
    expect(screen.queryByText("Campaigns")).not.toBeInTheDocument();
    expect(screen.queryByText("Public Campaigns")).not.toBeInTheDocument();
    expect(screen.queryByText("Aggregate Report")).not.toBeInTheDocument();
  });

  it("renders the coach-lane section ONLY when role is COACH", () => {
    render(<AssessmentsSidebar session={makeSession("COACH")} />);
    expect(screen.getByText("My Campaigns")).toBeInTheDocument();
    expect(screen.getByText("Members")).toBeInTheDocument();
    expect(screen.getByText(/coach lane/i)).toBeInTheDocument();
  });

  it("does NOT render the coach-lane section for ADMIN", () => {
    render(<AssessmentsSidebar session={makeSession("ADMIN")} />);
    expect(screen.queryByText("My Campaigns")).not.toBeInTheDocument();
    expect(screen.queryByText("Members")).not.toBeInTheDocument();
  });

  it("does NOT render the coach-lane section for STAFF", () => {
    render(<AssessmentsSidebar session={makeSession("STAFF")} />);
    expect(screen.queryByText("My Campaigns")).not.toBeInTheDocument();
    expect(screen.queryByText("Members")).not.toBeInTheDocument();
  });

  it("renders 7 admin entries for STAFF role too", () => {
    render(<AssessmentsSidebar session={makeSession("STAFF")} />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Organizations")).toBeInTheDocument();
    expect(screen.getByText("Aggregate Report")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Placeholder rendering — unbuilt routes should render dimmed + aria-disabled
  // ---------------------------------------------------------------------------

  describe("placeholder rendering", () => {
    /**
     * The rendered anchor is the *closest link* enclosing the label text.
     * Using `closest("a")` keeps the test resilient to span-vs-anchor markup
     * changes inside AssessmentsNavLink.
     */
    function anchorFor(label: string): HTMLAnchorElement {
      const node = screen.getByText(label).closest("a");
      expect(node).not.toBeNull();
      return node as HTMLAnchorElement;
    }

    it("marks NO admin entries as placeholders — all are real routes now (Wave Z PR-2)", () => {
      render(<AssessmentsSidebar session={makeSession("ADMIN")} />);

      // Organizations + Campaigns admin pages landed in Wave Z PR-2; Public
      // Campaigns was wired in Z-1. No "(coming soon)" markers remain.
      expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();

      for (const label of ["Organizations", "Campaigns"]) {
        const anchor = anchorFor(label);
        expect(anchor).not.toHaveAttribute("aria-disabled");
        expect(anchor.className).not.toMatch(/opacity-60/);
      }
      expect(anchorFor("Organizations")).toHaveAttribute(
        "href",
        "/admin/assessments/organizations",
      );
      expect(anchorFor("Campaigns")).toHaveAttribute(
        "href",
        "/admin/assessments/campaigns",
      );
    });

    it("does NOT mark Dashboard / Access Groups / Templates / Public Campaigns / Aggregate Report as placeholders for ADMIN", () => {
      render(<AssessmentsSidebar session={makeSession("ADMIN")} />);

      for (const label of [
        "Dashboard",
        "Access Groups",
        "Templates",
        "Public Campaigns",
        "Aggregate Report",
      ]) {
        const anchor = anchorFor(label);
        expect(anchor).not.toHaveAttribute("aria-disabled");
        expect(anchor.className).not.toMatch(/opacity-60/);
      }
      // Public Campaigns points at its real page, not the old placeholder route.
      expect(anchorFor("Public Campaigns")).toHaveAttribute(
        "href",
        "/admin/assessments/public-campaigns",
      );
    });

    it("marks neither coach-lane entry as a placeholder (both are real routes)", () => {
      render(<AssessmentsSidebar session={makeSession("COACH")} />);

      const membersAnchor = anchorFor("Members");
      expect(membersAnchor).not.toHaveAttribute("aria-disabled");
      expect(membersAnchor.className).not.toMatch(/opacity-60/);

      const campaignsAnchor = anchorFor("My Campaigns");
      expect(campaignsAnchor).not.toHaveAttribute("aria-disabled");
      expect(campaignsAnchor.className).not.toMatch(/opacity-60/);

      // No "(coming soon)" markers on the coach lane (both entries are live).
      expect(screen.queryAllByText(/coming soon/i).length).toBe(0);
    });
  });
});
