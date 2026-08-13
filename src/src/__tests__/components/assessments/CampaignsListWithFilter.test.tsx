/**
 * Task 5.3 — CampaignsListWithFilter grouped-by-company with per-campaign metrics (TDD).
 *
 * Tests:
 *  1. Renders company sections — both company headers and their campaigns appear under the right company
 *  2. Hides a company with zero matching campaigns after filter
 *  3. CampaignStatusMetrics renders per campaign — tile group appears for each campaign
 *  4. EmptyHint shown for DRAFT-with-zero-metrics, NOT for ACTIVE-with-zero-metrics
 *  5. Global pill counts are correct — All/Draft/Active/Closed sum across companies
 *  6. Empty campaigns array — component renders without crashing
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { CampaignsListWithFilter } from "@/components/assessments/CampaignsListWithFilter";
import type { CampaignListItem } from "@/components/assessments/CampaignsListWithFilter";
import type { CampaignStatusMetrics } from "@/lib/assessments/campaign-status-metrics";

const zeroMetrics: CampaignStatusMetrics = {
  total: 0,
  new: 0,
  invited: 0,
  started: 0,
  completed: 0,
  revoked: 0,
};

const nonZeroMetrics: CampaignStatusMetrics = {
  total: 10,
  new: 2,
  invited: 4,
  started: 3,
  completed: 1,
  revoked: 0,
};

function makeCampaign(
  overrides: Partial<CampaignListItem> & Pick<CampaignListItem, "id" | "organizationId" | "organizationName">
): CampaignListItem {
  return {
    name: `Campaign ${overrides.id}`,
    alias: `alias-${overrides.id}`,
    status: "ACTIVE",
    templateName: "QSP v2",
    openAt: "2026-06-01T00:00:00.000Z",
    metrics: nonZeroMetrics,
    edition: null,
    ...overrides,
  };
}

// Two companies, mixed statuses
const campaignAlphaA = makeCampaign({ id: "c1", organizationId: "org-alpha", organizationName: "Alpha Corp", status: "ACTIVE" });
const campaignAlphaB = makeCampaign({ id: "c2", organizationId: "org-alpha", organizationName: "Alpha Corp", status: "DRAFT" });
const campaignBetaA = makeCampaign({ id: "c3", organizationId: "org-beta", organizationName: "Beta Inc", status: "CLOSED" });
const campaignBetaB = makeCampaign({ id: "c4", organizationId: "org-beta", organizationName: "Beta Inc", status: "ACTIVE" });

const twoCompanyCampaigns: CampaignListItem[] = [
  campaignAlphaA,
  campaignAlphaB,
  campaignBetaA,
  campaignBetaB,
];

describe("CampaignsListWithFilter — grouped by company", () => {
  it("keeps long campaign and company identities wrappable and makes every filter touch-sized", () => {
    const longOrganizationName = "A Very Long Organization Name That Must Wrap On Compact Screens";
    const longCampaignName = "A Very Long Campaign Name That Must Wrap On Compact Screens";
    render(
      <CampaignsListWithFilter
        responsiveEnabled
        campaigns={[
          makeCampaign({
            id: "long",
            organizationId: "org-long",
            organizationName: longOrganizationName,
            name: longCampaignName,
          }),
        ]}
      />,
    );

    const campaignIdentity = screen.getByRole("link", {
      name: longCampaignName,
    });
    expect(campaignIdentity).toHaveClass("min-w-0 break-words");
    expect(screen.getByText(longOrganizationName)).toHaveClass(
      "min-w-0 break-words",
    );
    for (const status of ["all", "draft", "active", "closed"]) {
      expect(screen.getByTestId(`campaign-filter-pill-${status}`)).toHaveAttribute(
        "data-touch-target",
      );
    }
  });

  // Test 1: Renders company sections with correct grouping
  it("renders a heading for each company and campaigns appear under the right company", () => {
    render(<CampaignsListWithFilter campaigns={twoCompanyCampaigns} />);

    // Company headers — at least one element contains the company name
    expect(screen.getAllByText(/Alpha Corp/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Beta Inc/).length).toBeGreaterThanOrEqual(1);

    // Campaigns appear (by name)
    expect(screen.getByText("Campaign c1")).toBeInTheDocument();
    expect(screen.getByText("Campaign c2")).toBeInTheDocument();
    expect(screen.getByText("Campaign c3")).toBeInTheDocument();
    expect(screen.getByText("Campaign c4")).toBeInTheDocument();
  });

  // Test 1b: Campaign count appears in company header
  it("shows campaign count in company header", () => {
    render(<CampaignsListWithFilter campaigns={twoCompanyCampaigns} />);
    // Company name + count appear in the section heading
    expect(screen.getAllByText(/Alpha Corp/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Beta Inc/).length).toBeGreaterThanOrEqual(1);
    // Count text appears near the headings
    expect(screen.getAllByText(/2 campaigns/).length).toBeGreaterThanOrEqual(2);
  });

  // Test 2: Filtering hides companies with zero visible campaigns
  it("hides a company section when all its campaigns are filtered out", () => {
    render(<CampaignsListWithFilter campaigns={twoCompanyCampaigns} />);

    // Click the CLOSED filter pill — only Beta Inc has a CLOSED campaign
    fireEvent.click(screen.getByTestId("campaign-filter-pill-closed"));

    // Beta Inc should still be visible (has a CLOSED campaign)
    expect(screen.getAllByText(/Beta Inc/).length).toBeGreaterThanOrEqual(1);
    // Alpha Corp has no CLOSED campaigns — should be hidden entirely
    expect(screen.queryByText(/Alpha Corp/)).not.toBeInTheDocument();
  });

  // Test 2b: Filtering keeps companies that have matching campaigns
  it("shows a company when it has campaigns matching the selected filter", () => {
    render(<CampaignsListWithFilter campaigns={twoCompanyCampaigns} />);

    // Click DRAFT filter — only Alpha Corp has a DRAFT campaign
    fireEvent.click(screen.getByTestId("campaign-filter-pill-draft"));

    expect(screen.getAllByText(/Alpha Corp/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Beta Inc/)).not.toBeInTheDocument();
    expect(screen.getByText("Campaign c2")).toBeInTheDocument(); // the DRAFT one
    expect(screen.queryByText("Campaign c1")).not.toBeInTheDocument(); // ACTIVE
  });

  // Test 3: CampaignStatusMetrics renders per campaign
  it("renders a CampaignStatusMetrics tile group for each campaign", () => {
    render(<CampaignsListWithFilter campaigns={twoCompanyCampaigns} />);

    // Each campaign should have a metrics wrapper with testIdPrefix = "campaign-metrics-{id}"
    // The container div has data-testid="campaign-metrics-c1" etc (exact match, not sub-tiles).
    // Sub-tiles have "-total" "-new" suffix — use an exact array of the 4 container IDs.
    const c1Group = screen.getByTestId("campaign-metrics-c1");
    const c2Group = screen.getByTestId("campaign-metrics-c2");
    const c3Group = screen.getByTestId("campaign-metrics-c3");
    const c4Group = screen.getByTestId("campaign-metrics-c4");
    expect(c1Group).toBeInTheDocument();
    expect(c2Group).toBeInTheDocument();
    expect(c3Group).toBeInTheDocument();
    expect(c4Group).toBeInTheDocument();
  });

  // Test 3b: Metrics counts are wired through correctly
  it("passes the precomputed metrics to each CampaignStatusMetrics with correct counts", () => {
    const customMetrics: CampaignStatusMetrics = { total: 5, new: 1, invited: 2, started: 1, completed: 1, revoked: 0 };
    const campaigns: CampaignListItem[] = [
      makeCampaign({ id: "cx1", organizationId: "org-x", organizationName: "X Corp", metrics: customMetrics }),
    ];
    render(<CampaignsListWithFilter campaigns={campaigns} />);

    // Total tile should show 5
    const totalTile = screen.getByTestId("campaign-metrics-cx1-total");
    expect(totalTile).toHaveTextContent("5");
  });

  // Test 4: EmptyHint shown for DRAFT with zero metrics, NOT for ACTIVE with zero metrics
  it("shows empty hint for DRAFT campaign with total=0 metrics", () => {
    const campaigns: CampaignListItem[] = [
      makeCampaign({ id: "d1", organizationId: "org-a", organizationName: "Org A", status: "DRAFT", metrics: zeroMetrics }),
    ];
    render(<CampaignsListWithFilter campaigns={campaigns} />);
    expect(screen.getByText(/No invitations yet/)).toBeInTheDocument();
  });

  it("does NOT show empty hint for ACTIVE campaign with total=0 metrics", () => {
    const campaigns: CampaignListItem[] = [
      makeCampaign({ id: "a1", organizationId: "org-a", organizationName: "Org A", status: "ACTIVE", metrics: zeroMetrics }),
    ];
    render(<CampaignsListWithFilter campaigns={campaigns} />);
    expect(screen.queryByText(/No invitations yet/)).not.toBeInTheDocument();
  });

  // Test 5: Global pill counts sum correctly across companies
  it("shows correct global pill counts summed across all companies", () => {
    render(<CampaignsListWithFilter campaigns={twoCompanyCampaigns} />);

    // All=4, DRAFT=1 (c2), ACTIVE=2 (c1,c4), CLOSED=1 (c3)
    expect(screen.getByTestId("campaign-filter-count-all")).toHaveTextContent("4");
    expect(screen.getByTestId("campaign-filter-count-draft")).toHaveTextContent("1");
    expect(screen.getByTestId("campaign-filter-count-active")).toHaveTextContent("2");
    expect(screen.getByTestId("campaign-filter-count-closed")).toHaveTextContent("1");
  });

  // Test 6: Empty campaigns array — renders without crashing
  it("renders without crashing when campaigns is empty", () => {
    const { container } = render(<CampaignsListWithFilter campaigns={[]} />);
    expect(container).toBeTruthy();
    // No company sections
    expect(screen.queryByText(/campaigns$/)).not.toBeInTheDocument();
  });

  // Test 7: ALL filter restores all company sections
  it("restores all company sections when ALL filter is selected after filtering", () => {
    render(<CampaignsListWithFilter campaigns={twoCompanyCampaigns} />);

    // Filter to CLOSED
    fireEvent.click(screen.getByTestId("campaign-filter-pill-closed"));
    expect(screen.queryByText(/Alpha Corp/)).not.toBeInTheDocument();

    // Go back to ALL
    fireEvent.click(screen.getByTestId("campaign-filter-pill-all"));
    expect(screen.getAllByText(/Alpha Corp/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Beta Inc/).length).toBeGreaterThanOrEqual(1);
  });
});

// Wave Z Z-2a — detailBasePath prop (admin campaigns oversight reuse).
describe("CampaignsListWithFilter — detailBasePath", () => {
  const one: CampaignListItem[] = [
    makeCampaign({ id: "c1", organizationId: "org-alpha", organizationName: "Alpha Corp" }),
  ];

  it("defaults campaign detail links to the coach portal (regression)", () => {
    render(<CampaignsListWithFilter campaigns={one} />);
    // Both the name link and the "View" link point at the portal by default.
    expect(screen.getByRole("link", { name: "Campaign c1" })).toHaveAttribute(
      "href",
      "/portal/assessments/c1",
    );
    expect(screen.getByRole("link", { name: "View" })).toHaveAttribute(
      "href",
      "/portal/assessments/c1",
    );
  });

  it("points detail links at the admin base path when provided", () => {
    render(
      <CampaignsListWithFilter
        campaigns={one}
        detailBasePath="/admin/assessments/campaigns"
      />,
    );
    expect(screen.getByRole("link", { name: "Campaign c1" })).toHaveAttribute(
      "href",
      "/admin/assessments/campaigns/c1",
    );
    expect(screen.getByRole("link", { name: "View" })).toHaveAttribute(
      "href",
      "/admin/assessments/campaigns/c1",
    );
  });
});

describe("CampaignsListWithFilter — edition standing", () => {
  function editionCampaign(
    status: CampaignListItem["status"],
    edition: CampaignListItem["edition"],
  ): CampaignListItem {
    return makeCampaign({
      id: `${String(status).toLowerCase()}-edition`,
      organizationId: "org-edition",
      organizationName: "Edition Org",
      status,
      edition,
    });
  }

  const currentEdition = {
    versionNumber: 3,
    newerEditionAvailable: false,
    pinnedRetired: false,
  };

  it("shows persistent edition identity without a positive current badge", () => {
    render(
      <CampaignsListWithFilter
        campaigns={[editionCampaign("ACTIVE", currentEdition)]}
      />,
    );
    const identity = screen.getByTestId(
      "campaign-edition-identity-active-edition",
    );
    expect(identity).toHaveTextContent("QSP v2 · Edition 3");
    expect(identity).not.toHaveClass("hidden");
    expect(identity.className).not.toContain("sm:inline");
    expect(screen.queryByText("Current")).not.toBeInTheDocument();
  });

  it("uses a full-width campaign identity block before the sm breakpoint", () => {
    render(
      <CampaignsListWithFilter
        campaigns={[editionCampaign("ACTIVE", currentEdition)]}
      />,
    );
    const campaignLink = screen.getByRole("link", {
      name: "Campaign active-edition",
    });
    expect(campaignLink.parentElement).toHaveClass("basis-full", "sm:flex-1");
  });

  it("shows Not latest for actionable stale pins", () => {
    render(
      <CampaignsListWithFilter
        campaigns={[
          editionCampaign("DRAFT", {
            ...currentEdition,
            newerEditionAvailable: true,
          }),
        ]}
      />,
    );
    const marker = screen.getByTestId("campaign-edition-stale-draft-edition");
    expect(marker).toHaveTextContent("Not latest");
    expect(marker).toHaveClass(
      "border-warning/30",
      "bg-warning/10",
      "text-warning",
    );
  });

  it("gives Retired precedence over Not latest", () => {
    render(
      <CampaignsListWithFilter
        campaigns={[
          editionCampaign("ACTIVE", {
            versionNumber: 2,
            newerEditionAvailable: true,
            pinnedRetired: true,
          }),
        ]}
      />,
    );
    const marker = screen.getByTestId(
      "campaign-edition-retired-active-edition",
    );
    expect(marker).toHaveTextContent("Retired");
    expect(marker).toHaveClass(
      "border-destructive",
      "bg-destructive/10",
      "text-destructive",
    );
    expect(
      screen.queryByTestId("campaign-edition-stale-active-edition"),
    ).not.toBeInTheDocument();
  });

  it("keeps closed identity but suppresses both warnings", () => {
    render(
      <CampaignsListWithFilter
        campaigns={[
          editionCampaign("CLOSED", {
            versionNumber: 1,
            newerEditionAvailable: true,
            pinnedRetired: true,
          }),
        ]}
      />,
    );
    expect(
      screen.getByTestId("campaign-edition-identity-closed-edition"),
    ).toHaveTextContent("Edition 1");
    expect(screen.queryByText("Retired")).not.toBeInTheDocument();
    expect(screen.queryByText("Not latest")).not.toBeInTheDocument();
  });

  it("suppresses actionable warnings for an unrecognized lifecycle state", () => {
    render(
      <CampaignsListWithFilter
        campaigns={[
          editionCampaign("PAUSED", {
            versionNumber: 2,
            newerEditionAvailable: true,
            pinnedRetired: true,
          }),
        ]}
      />,
    );
    expect(screen.getByText("Edition 2")).toBeInTheDocument();
    expect(screen.queryByText("Retired")).not.toBeInTheDocument();
    expect(screen.queryByText("Not latest")).not.toBeInTheDocument();
  });

  it("preserves template-only presentation for unknown standing", () => {
    render(
      <CampaignsListWithFilter
        campaigns={[editionCampaign("ACTIVE", null)]}
      />,
    );
    expect(
      screen.getByTestId("campaign-edition-identity-active-edition"),
    ).toHaveTextContent("QSP v2");
    expect(
      screen.getByTestId("campaign-edition-identity-active-edition"),
    ).not.toHaveTextContent("Edition");
  });
});
