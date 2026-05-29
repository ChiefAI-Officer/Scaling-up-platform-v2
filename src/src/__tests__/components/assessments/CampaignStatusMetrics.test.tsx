/**
 * Task 5.2 — CampaignStatusMetrics presentational component (TDD red phase first).
 *
 * Tests:
 *  1. Renders all 5 tiles with correct labels + counts given a non-zero metrics object
 *  2. Total tile shows the sum count exactly (uses input total, not recomputed)
 *  3. Each tile has its expected data-testid
 *  4. Renders zeros when metrics are all zero and emptyHint is NOT provided
 *  5. Renders the emptyHint instead of tiles when metrics are all zero AND emptyHint IS provided
 *  6. emptyHint triggers only when total === 0 (non-zero sub-counts still show tiles)
 *  7. Compact mode applies smaller class names
 *  8. className passthrough applied on the container
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { CampaignStatusMetrics } from "@/components/assessments/CampaignStatusMetrics";
import type { CampaignStatusMetrics as CampaignStatusMetricsType } from "@/lib/assessments/campaign-status-metrics";

const nonZeroMetrics: CampaignStatusMetricsType = {
  total: 12,
  new: 2,
  invited: 4,
  started: 3,
  completed: 3,
  revoked: 0,
};

const zeroMetrics: CampaignStatusMetricsType = {
  total: 0,
  new: 0,
  invited: 0,
  started: 0,
  completed: 0,
  revoked: 0,
};

describe("CampaignStatusMetrics", () => {
  it("renders all 5 tiles with correct labels and counts", () => {
    render(<CampaignStatusMetrics metrics={nonZeroMetrics} />);

    expect(screen.getByText("Total:")).toBeInTheDocument();
    expect(screen.getByText("New:")).toBeInTheDocument();
    expect(screen.getByText("Invited:")).toBeInTheDocument();
    expect(screen.getByText("Started:")).toBeInTheDocument();
    expect(screen.getByText("Completed:")).toBeInTheDocument();

    expect(screen.getByTestId("campaign-status-metrics-total")).toHaveTextContent("12");
    expect(screen.getByTestId("campaign-status-metrics-new")).toHaveTextContent("2");
    expect(screen.getByTestId("campaign-status-metrics-invited")).toHaveTextContent("4");
    expect(screen.getByTestId("campaign-status-metrics-started")).toHaveTextContent("3");
    expect(screen.getByTestId("campaign-status-metrics-completed")).toHaveTextContent("3");
  });

  it("total tile shows the exact total from metrics (not recomputed)", () => {
    const customMetrics: CampaignStatusMetricsType = {
      total: 99,
      new: 10,
      invited: 20,
      started: 30,
      completed: 39,
      revoked: 5,
    };
    render(<CampaignStatusMetrics metrics={customMetrics} />);
    expect(screen.getByTestId("campaign-status-metrics-total")).toHaveTextContent("99");
  });

  it("each tile has its expected data-testid", () => {
    render(<CampaignStatusMetrics metrics={nonZeroMetrics} />);

    expect(screen.getByTestId("campaign-status-metrics-total")).toBeInTheDocument();
    expect(screen.getByTestId("campaign-status-metrics-new")).toBeInTheDocument();
    expect(screen.getByTestId("campaign-status-metrics-invited")).toBeInTheDocument();
    expect(screen.getByTestId("campaign-status-metrics-started")).toBeInTheDocument();
    expect(screen.getByTestId("campaign-status-metrics-completed")).toBeInTheDocument();
  });

  it("renders zero counts when all zero and emptyHint is NOT provided", () => {
    render(<CampaignStatusMetrics metrics={zeroMetrics} />);

    expect(screen.getByTestId("campaign-status-metrics-total")).toHaveTextContent("0");
    expect(screen.getByTestId("campaign-status-metrics-new")).toHaveTextContent("0");
    expect(screen.getByTestId("campaign-status-metrics-invited")).toHaveTextContent("0");
    expect(screen.getByTestId("campaign-status-metrics-started")).toHaveTextContent("0");
    expect(screen.getByTestId("campaign-status-metrics-completed")).toHaveTextContent("0");
  });

  it("renders emptyHint instead of tiles when total === 0 and emptyHint is provided", () => {
    render(<CampaignStatusMetrics metrics={zeroMetrics} emptyHint="No participants yet" />);

    expect(screen.getByText("No participants yet")).toBeInTheDocument();
    expect(screen.queryByTestId("campaign-status-metrics-total")).not.toBeInTheDocument();
    expect(screen.queryByTestId("campaign-status-metrics-new")).not.toBeInTheDocument();
  });

  it("renders tiles (not emptyHint) when total > 0 even if emptyHint is provided", () => {
    render(<CampaignStatusMetrics metrics={nonZeroMetrics} emptyHint="No participants yet" />);

    expect(screen.queryByText("No participants yet")).not.toBeInTheDocument();
    expect(screen.getByTestId("campaign-status-metrics-total")).toHaveTextContent("12");
  });

  it("compact mode adds smaller text class to the container", () => {
    const { container } = render(
      <CampaignStatusMetrics metrics={nonZeroMetrics} compact={true} />,
    );
    const wrapper = screen.getByTestId("campaign-status-metrics");
    expect(wrapper.className).toMatch(/text-\[10px\]/);
  });

  it("non-compact mode does NOT have the compact text class", () => {
    render(<CampaignStatusMetrics metrics={nonZeroMetrics} />);
    const wrapper = screen.getByTestId("campaign-status-metrics");
    expect(wrapper.className).not.toMatch(/text-\[10px\]/);
  });

  it("className passthrough is applied on the container", () => {
    render(<CampaignStatusMetrics metrics={nonZeroMetrics} className="my-custom" />);
    const wrapper = screen.getByTestId("campaign-status-metrics");
    expect(wrapper.className).toContain("my-custom");
  });

  it("testIdPrefix override applies to container and all tiles", () => {
    render(<CampaignStatusMetrics metrics={nonZeroMetrics} testIdPrefix="custom-prefix" />);

    expect(screen.getByTestId("custom-prefix")).toBeInTheDocument();
    expect(screen.getByTestId("custom-prefix-total")).toBeInTheDocument();
    expect(screen.getByTestId("custom-prefix-completed")).toBeInTheDocument();
  });
});
