/**
 * AssessmentsSidebar — Phase A IA refactor.
 *
 * Covers:
 *   - 7 admin entries render for ADMIN role (with Aggregate Report visible)
 *   - Aggregate Report row hidden when canAccessAggregateReport returns false
 *   - Admin section hidden when role is COACH
 */

jest.mock("next/navigation", () => ({
  usePathname: () => "/admin/assessments",
}));

const mockCanAccessAggregateReport = jest.fn<boolean, [{ role: string }]>();
const mockIsReferredResultsEnabled = jest.fn<boolean, []>();

jest.mock("@/lib/assessments/access-control", () => ({
  canAccessAggregateReport: (actor: { role: string }) =>
    mockCanAccessAggregateReport(actor),
}));

jest.mock("@/lib/assessments/wave-83-flags", () => ({
  isReferredResultsEnabled: () => mockIsReferredResultsEnabled(),
}));

import { render, screen } from "@testing-library/react";
import { fireEvent, within } from "@testing-library/react";
import type { Session } from "next-auth";
import { AssessmentsSidebar } from "@/components/nav/assessments-sidebar";

function makeSession(role: "ADMIN" | "STAFF" | "COACH"): Session {
  return {
    expires: "9999-01-01",
    user: {
      id: "user-1",
      name: "Test",
      email: "test@example.com",
      role,
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCanAccessAggregateReport.mockReturnValue(true);
  mockIsReferredResultsEnabled.mockReturnValue(false);
});

describe("AssessmentsSidebar", () => {
  it("preserves the exact legacy sidebar wrapper while responsive mode is off", () => {
    const { container } = render(
      <AssessmentsSidebar
        session={makeSession("ADMIN")}
        responsiveEnabled={false}
      />,
    );

    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild).toHaveAttribute(
      "class",
      "w-full md:w-60 md:flex-shrink-0 border-b md:border-b-0 md:border-r border-border bg-card/40",
    );
    expect(
      screen.queryByRole("button", { name: /assessment section:/i }),
    ).not.toBeInTheDocument();
  });

  it.each(["ADMIN", "STAFF", "COACH"] as const)(
    "responsive mode gives both %s navigation presentations the identical filtered entries",
    (role) => {
      const { container } = render(
        <AssessmentsSidebar
          session={makeSession(role)}
          responsiveEnabled
        />,
      );
      const sidebar = container.querySelector(
        'aside[aria-label="Assessments navigation"]',
      );
      expect(sidebar).not.toBeNull();
      const wideHrefs = within(sidebar as HTMLElement)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href"));

      fireEvent.click(
        screen.getByRole("button", { name: /assessment section:/i }),
      );
      const compact = container.querySelector(
        'nav[aria-label="Compact assessments navigation"]',
      );
      expect(compact).not.toBeNull();
      const compactHrefs = within(compact as HTMLElement)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href"));

      expect(compactHrefs).toEqual(wideHrefs);
    },
  );

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

  it("renders the Observability admin entry linking to the observability page (#85)", () => {
    render(<AssessmentsSidebar session={makeSession("ADMIN")} />);
    const link = screen.getByText("Observability").closest("a");
    expect(link).toHaveAttribute("href", "/admin/assessments/observability");
  });

  it.each(["ADMIN", "STAFF"] as const)(
    "renders Delivery Holds beside Observability for %s",
    (role) => {
      render(<AssessmentsSidebar session={makeSession(role)} />);
      const deliveryHolds = screen.getByText("Delivery Holds").closest("a");
      expect(deliveryHolds).toHaveAttribute(
        "href",
        "/admin/assessments/delivery-holds",
      );
      const links = screen.getAllByRole("link");
      expect(
        links.indexOf(screen.getByText("Delivery Holds").closest("a")!),
      ).toBe(links.indexOf(screen.getByText("Observability").closest("a")!) + 1);
    },
  );

  it("does NOT render Observability for COACH (admin-only surface)", () => {
    render(<AssessmentsSidebar session={makeSession("COACH")} />);
    expect(screen.queryByText("Observability")).not.toBeInTheDocument();
  });

  it("does NOT render Delivery Holds for COACH", () => {
    render(<AssessmentsSidebar session={makeSession("COACH")} />);
    expect(screen.queryByText("Delivery Holds")).not.toBeInTheDocument();
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
    // is admin-only as well.
    expect(screen.queryByText("Organizations")).not.toBeInTheDocument();
    expect(screen.queryByText("Access Groups")).not.toBeInTheDocument();
    expect(screen.queryByText("Templates")).not.toBeInTheDocument();
    expect(screen.queryByText("Campaigns")).not.toBeInTheDocument();
    expect(screen.queryByText("Public Campaigns")).not.toBeInTheDocument();
    expect(screen.queryByText("Aggregate Report")).not.toBeInTheDocument();
  });

  it("preserves the existing Coach lane exactly while Referred Results is off", () => {
    render(<AssessmentsSidebar session={makeSession("COACH")} />);

    expect(
      screen.getAllByRole("link").map((link) => link.textContent?.trim()),
    ).toEqual(["My Campaigns", "Members"]);
    expect(screen.getByText(/coach lane/i)).toBeInTheDocument();
    expect(screen.queryByText("Referred Results")).not.toBeInTheDocument();
  });

  it("does NOT render coach portal entries for ADMIN", () => {
    render(<AssessmentsSidebar session={makeSession("ADMIN")} />);
    expect(screen.queryByText("My Campaigns")).not.toBeInTheDocument();
    expect(screen.queryByText("Members")).not.toBeInTheDocument();
    expect(screen.queryByText("Referred Results")).not.toBeInTheDocument();
  });

  it("does NOT render coach portal entries for STAFF", () => {
    render(<AssessmentsSidebar session={makeSession("STAFF")} />);
    expect(screen.queryByText("My Campaigns")).not.toBeInTheDocument();
    expect(screen.queryByText("Members")).not.toBeInTheDocument();
    expect(screen.queryByText("Referred Results")).not.toBeInTheDocument();
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

  });
});
