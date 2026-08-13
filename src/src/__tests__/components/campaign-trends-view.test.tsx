/**
 * Component tests for CampaignTrendsView (Task H).
 *
 * Covers:
 *   - empty state (zero campaigns)
 *   - single-campaign banner + stats
 *   - multi-campaign chart + section table render
 *   - hasMultipleVersions banner
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { CampaignTrendsView } from "@/components/assessments/CampaignTrendsView";
import type { LongitudinalTrend } from "@/lib/assessments/trends";

function baseTrend(
  overrides: Partial<LongitudinalTrend> = {},
): LongitudinalTrend {
  return {
    template: {
      id: "tpl-1",
      name: "Rockefeller Habits Checklist",
      alias: "RockHabits",
    },
    organization: { id: "org-1", name: "Acme Corp" },
    latestVersion: { id: "ver-1", versionNumber: 1, language: "enUS" },
    campaigns: [],
    questionSparklines: {},
    hasMultipleVersions: false,
    excludedCampaignCount: 0,
    ...overrides,
  };
}

function buildCampaign(
  id: string,
  openAt: Date,
  meanCountAchieved: number,
  submissions: number,
): LongitudinalTrend["campaigns"][number] {
  return {
    campaign: {
      id,
      name: `Campaign ${id}`,
      alias: `acme_${id}`,
      openAt,
      closeAt: null,
      status: "CLOSED",
      versionNumber: 1,
      language: "enUS",
    },
    submissions: Array.from({ length: submissions }).map((_, i) => ({
      respondentId: `r-${i}`,
      respondentName: `Resp ${i}`,
      submittedAt: openAt,
      countAchieved: meanCountAchieved,
      overallTotal: meanCountAchieved * 3,
      overallAverage: meanCountAchieved / 10,
      tierLabel: "OK",
      perSection: [
        {
          stableKey: "S1",
          name: "Section 1",
          totalPoints: 6,
          averagePoints: 2.0,
        },
      ],
    })),
    meanCountAchieved,
    meanOverallTotal: meanCountAchieved * 3,
    meanOverallAverage: meanCountAchieved / 10,
  };
}

describe("CampaignTrendsView", () => {
  it("empty state when no campaigns", () => {
    render(<CampaignTrendsView trend={baseTrend()} />);
    expect(screen.getByText(/No campaigns to compare yet/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Start a campaign/i }),
    ).toBeInTheDocument();
  });

  it("keeps the empty-state native anchor when off and sizes it only when responsive", () => {
    const { rerender } = render(<CampaignTrendsView trend={baseTrend()} />);
    const legacy = screen.getByRole("link", { name: /Start a campaign/i });
    expect(legacy.tagName).toBe("A");
    expect(legacy).not.toHaveClass("min-h-11");
    rerender(<CampaignTrendsView trend={baseTrend()} responsiveEnabled />);
    const responsive = screen.getByRole("link", { name: /Start a campaign/i });
    expect(responsive.tagName).toBe("A");
    expect(responsive).toHaveClass("min-h-11");
    expect(responsive).toHaveClass("min-w-11");
  });

  it("single-campaign state shows banner + stat cards", () => {
    const trend = baseTrend({
      campaigns: [
        buildCampaign("c1", new Date("2026-01-15T00:00:00Z"), 20, 4),
      ],
    });
    render(<CampaignTrendsView trend={trend} />);

    expect(
      screen.getByText(/Trends require 2\+ campaigns/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Campaign c1")).toBeInTheDocument();
    expect(screen.getByText(/Mean count achieved/i)).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
  });

  it("multi-campaign view renders chart + section table", () => {
    const trend = baseTrend({
      campaigns: [
        buildCampaign("c1", new Date("2026-01-15T00:00:00Z"), 15, 3),
        buildCampaign("c2", new Date("2026-03-15T00:00:00Z"), 23, 3),
        buildCampaign("c3", new Date("2026-05-15T00:00:00Z"), 28.6, 3),
      ],
      questionSparklines: {
        Q1: [
          {
            campaignId: "c1",
            campaignName: "Campaign c1",
            openAt: new Date("2026-01-15T00:00:00Z"),
            mean: 2.0,
            n: 3,
          },
          {
            campaignId: "c2",
            campaignName: "Campaign c2",
            openAt: new Date("2026-03-15T00:00:00Z"),
            mean: 2.5,
            n: 3,
          },
          {
            campaignId: "c3",
            campaignName: "Campaign c3",
            openAt: new Date("2026-05-15T00:00:00Z"),
            mean: 3.0,
            n: 3,
          },
        ],
      },
    });
    render(<CampaignTrendsView trend={trend} />);

    expect(
      screen.getByText(/Composite score over time/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Per-section trend/i)).toBeInTheDocument();
    expect(screen.getByTestId("trends-section-table")).toBeInTheDocument();
    expect(screen.getByText(/Per-question detail/i)).toBeInTheDocument();
    // Should NOT show single-campaign banner.
    expect(
      screen.queryByText(/Trends require 2\+ campaigns/i),
    ).not.toBeInTheDocument();
  });

  it("contains long responsive chart and table content without changing the flag-off root", () => {
    const trend = baseTrend({
      template: {
        id: "tpl-1",
        name: "A very long assessment name that must remain inside the available report width",
        alias: "a-very-long-assessment-alias-that-must-wrap",
      },
      organization: {
        id: "org-1",
        name: "A very long organization name that must wrap instead of widening the page",
      },
      campaigns: [
        buildCampaign("c1", new Date("2026-01-15T00:00:00Z"), 15, 3),
        buildCampaign("c2", new Date("2026-05-15T00:00:00Z"), 28, 3),
      ],
    });
    const { container, rerender } = render(<CampaignTrendsView trend={trend} />);
    expect(container.firstElementChild).toHaveAttribute(
      "class",
      "space-y-6",
    );
    expect(container.firstElementChild).not.toHaveAttribute(
      "data-responsive-report",
    );

    rerender(<CampaignTrendsView trend={trend} responsiveEnabled />);
    const root = screen.getByTestId("campaign-trends-view");
    expect(root).toHaveClass("min-w-0");
    expect(root).toHaveClass("max-w-full");
    expect(root).toHaveAttribute("data-responsive-report", "");
    expect(screen.getByTestId("trends-chart-region")).toHaveClass("min-w-0");
    expect(screen.getByTestId("trends-chart-region")).toHaveClass(
      "max-w-full",
    );
    const tableRegion = screen.getByRole("region", {
      name: "Per-section trend comparison table",
    });
    expect(tableRegion).toHaveAttribute("tabindex", "0");
    expect(tableRegion).toHaveClass("min-w-0");
    expect(tableRegion).toHaveClass("max-w-full");
  });

  it("hasMultipleVersions shows banner", () => {
    const trend = baseTrend({
      hasMultipleVersions: true,
      excludedCampaignCount: 2,
      campaigns: [],
    });
    render(<CampaignTrendsView trend={trend} />);
    expect(
      screen.getByText(/Multiple template versions exist/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/2 excluded/i)).toBeInTheDocument();
  });

  it("per-question sparklines collapsible toggles open", () => {
    const trend = baseTrend({
      campaigns: [
        buildCampaign("c1", new Date("2026-01-15T00:00:00Z"), 15, 3),
        buildCampaign("c2", new Date("2026-05-15T00:00:00Z"), 28, 3),
      ],
      questionSparklines: {
        Q1: [
          {
            campaignId: "c1",
            campaignName: "Campaign c1",
            openAt: new Date("2026-01-15T00:00:00Z"),
            mean: 2.0,
            n: 3,
          },
          {
            campaignId: "c2",
            campaignName: "Campaign c2",
            openAt: new Date("2026-05-15T00:00:00Z"),
            mean: 3.0,
            n: 3,
          },
        ],
      },
    });
    render(<CampaignTrendsView trend={trend} />);

    const toggle = screen.getByRole("button", { name: /Per-question detail/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
});
