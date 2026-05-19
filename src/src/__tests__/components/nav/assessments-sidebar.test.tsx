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
    expect(screen.getByText("Public Quizzes")).toBeInTheDocument();
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
    // Campaigns / Public Quizzes / Aggregate Report). The "Dashboard" label
    // is admin-only as well — coaches see "My Campaigns" / "My Organizations".
    expect(screen.queryByText("Organizations")).not.toBeInTheDocument();
    expect(screen.queryByText("Access Groups")).not.toBeInTheDocument();
    expect(screen.queryByText("Templates")).not.toBeInTheDocument();
    expect(screen.queryByText("Campaigns")).not.toBeInTheDocument();
    expect(screen.queryByText("Public Quizzes")).not.toBeInTheDocument();
    expect(screen.queryByText("Aggregate Report")).not.toBeInTheDocument();
  });

  it("renders the coach-lane section ONLY when role is COACH", () => {
    render(<AssessmentsSidebar session={makeSession("COACH")} />);
    expect(screen.getByText("My Campaigns")).toBeInTheDocument();
    expect(screen.getByText("My Organizations")).toBeInTheDocument();
    expect(screen.getByText(/coach lane/i)).toBeInTheDocument();
  });

  it("does NOT render the coach-lane section for ADMIN", () => {
    render(<AssessmentsSidebar session={makeSession("ADMIN")} />);
    expect(screen.queryByText("My Campaigns")).not.toBeInTheDocument();
    expect(screen.queryByText("My Organizations")).not.toBeInTheDocument();
  });

  it("does NOT render the coach-lane section for STAFF", () => {
    render(<AssessmentsSidebar session={makeSession("STAFF")} />);
    expect(screen.queryByText("My Campaigns")).not.toBeInTheDocument();
    expect(screen.queryByText("My Organizations")).not.toBeInTheDocument();
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

    it("marks Organizations / Campaigns / Public Quizzes as placeholders for ADMIN", () => {
      render(<AssessmentsSidebar session={makeSession("ADMIN")} />);

      for (const label of ["Organizations", "Campaigns", "Public Quizzes"]) {
        const anchor = anchorFor(label);
        expect(anchor).toHaveAttribute("aria-disabled", "true");
        expect(anchor.className).toMatch(/opacity-60/);
      }

      // Three "(coming soon)" markers on the admin side (one per placeholder row).
      const comingSoon = screen.getAllByText(/coming soon/i);
      expect(comingSoon.length).toBe(3);
    });

    it("does NOT mark Dashboard / Access Groups / Templates / Aggregate Report as placeholders for ADMIN", () => {
      render(<AssessmentsSidebar session={makeSession("ADMIN")} />);

      for (const label of [
        "Dashboard",
        "Access Groups",
        "Templates",
        "Aggregate Report",
      ]) {
        const anchor = anchorFor(label);
        expect(anchor).not.toHaveAttribute("aria-disabled");
        expect(anchor.className).not.toMatch(/opacity-60/);
      }
    });

    it("marks My Organizations as a placeholder for COACH (but NOT My Campaigns)", () => {
      render(<AssessmentsSidebar session={makeSession("COACH")} />);

      const orgAnchor = anchorFor("My Organizations");
      expect(orgAnchor).toHaveAttribute("aria-disabled", "true");
      expect(orgAnchor.className).toMatch(/opacity-60/);

      const campaignsAnchor = anchorFor("My Campaigns");
      expect(campaignsAnchor).not.toHaveAttribute("aria-disabled");
      expect(campaignsAnchor.className).not.toMatch(/opacity-60/);

      // Exactly one "(coming soon)" marker on the coach lane.
      const comingSoon = screen.getAllByText(/coming soon/i);
      expect(comingSoon.length).toBe(1);
    });
  });
});
