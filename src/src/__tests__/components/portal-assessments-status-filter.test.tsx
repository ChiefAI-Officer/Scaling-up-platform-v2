/**
 * Assessment v7.6 — CampaignsListWithFilter pills (Task I).
 */

import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";

import {
  CampaignsListWithFilter,
  type CampaignListItem,
} from "@/components/assessments/CampaignsListWithFilter";

const zeroMetrics = {
  total: 0,
  new: 0,
  invited: 0,
  started: 0,
  completed: 0,
  revoked: 0,
};

const fixture: CampaignListItem[] = [
  {
    id: "c1",
    name: "Q1 Pulse",
    alias: "q1-pulse",
    status: "DRAFT",
    templateName: "Rockefeller Habits",
    organizationId: "org-acme",
    organizationName: "Acme",
    metrics: zeroMetrics,
    edition: null,
    openAt: "2026-05-01T00:00:00Z",
  },
  {
    id: "c2",
    name: "Q2 Pulse",
    alias: "q2-pulse",
    status: "ACTIVE",
    templateName: "Rockefeller Habits",
    organizationId: "org-acme",
    organizationName: "Acme",
    metrics: zeroMetrics,
    edition: null,
    openAt: "2026-06-01T00:00:00Z",
  },
  {
    id: "c3",
    name: "Q3 Pulse",
    alias: "q3-pulse",
    status: "ACTIVE",
    templateName: "Rockefeller Habits",
    organizationId: "org-beta",
    organizationName: "Beta",
    metrics: zeroMetrics,
    edition: null,
    openAt: "2026-07-01T00:00:00Z",
  },
  {
    id: "c4",
    name: "Old Pulse",
    alias: "old-pulse",
    status: "CLOSED",
    templateName: "Rockefeller Habits",
    organizationId: "org-beta",
    organizationName: "Beta",
    metrics: zeroMetrics,
    edition: null,
    openAt: "2026-01-01T00:00:00Z",
  },
];

describe("CampaignsListWithFilter", () => {
  it("renders pill counts derived from the fixture", () => {
    render(<CampaignsListWithFilter campaigns={fixture} />);
    expect(
      within(screen.getByTestId("campaign-filter-count-all")).getByText("4"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("campaign-filter-count-draft")).getByText("1"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("campaign-filter-count-active")).getByText("2"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("campaign-filter-count-closed")).getByText("1"),
    ).toBeInTheDocument();
  });

  it("default filter is ALL — every company is listed and collapsed", () => {
    render(<CampaignsListWithFilter campaigns={fixture} />);
    expect(
      screen.getByRole("button", { name: /Acme.*2 campaigns/i }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("button", { name: /Beta.*2 campaigns/i }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("campaign-row-c1")).not.toBeInTheDocument();
  });

  it("clicking a status pill filters each company's expanded rows", () => {
    render(<CampaignsListWithFilter campaigns={fixture} />);
    fireEvent.click(screen.getByTestId("campaign-filter-pill-active"));

    fireEvent.click(screen.getByRole("button", { name: /Acme.*1 campaign$/i }));
    expect(screen.queryByTestId("campaign-row-c1")).toBeNull();
    expect(screen.getByTestId("campaign-row-c2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Beta.*1 campaign$/i }));
    expect(screen.queryByTestId("campaign-row-c2")).toBeNull();
    expect(screen.getByTestId("campaign-row-c3")).toBeInTheDocument();
    expect(screen.queryByTestId("campaign-row-c4")).toBeNull();
  });

  it("clicking DRAFT shows only DRAFT campaigns", () => {
    render(<CampaignsListWithFilter campaigns={fixture} />);
    fireEvent.click(screen.getByTestId("campaign-filter-pill-draft"));
    fireEvent.click(screen.getByRole("button", { name: /Acme.*1 campaign$/i }));
    expect(screen.getByTestId("campaign-row-c1")).toBeInTheDocument();
    expect(screen.queryByTestId("campaign-row-c2")).toBeNull();
    expect(screen.queryByTestId("campaign-row-c3")).toBeNull();
    expect(screen.queryByTestId("campaign-row-c4")).toBeNull();
  });

  it("returning to ALL restores every company in a collapsed state", () => {
    render(<CampaignsListWithFilter campaigns={fixture} />);
    fireEvent.click(screen.getByTestId("campaign-filter-pill-closed"));
    expect(screen.queryByText("Acme")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("campaign-filter-pill-all"));

    const acme = screen.getByRole("button", { name: /Acme.*2 campaigns/i });
    const beta = screen.getByRole("button", { name: /Beta.*2 campaigns/i });
    expect(acme).toHaveAttribute("aria-expanded", "false");
    expect(beta).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(acme);
    expect(screen.getByTestId("campaign-row-c1")).toBeInTheDocument();
    expect(screen.getByTestId("campaign-row-c2")).toBeInTheDocument();

    fireEvent.click(beta);
    expect(screen.queryByTestId("campaign-row-c1")).toBeNull();
    expect(screen.getByTestId("campaign-row-c3")).toBeInTheDocument();
    expect(screen.getByTestId("campaign-row-c4")).toBeInTheDocument();
  });

  it("shows an empty-state row when the active filter has 0 matches", () => {
    const onlyDrafts: CampaignListItem[] = [
      {
        id: "c1",
        name: "Q1",
        alias: "q1",
        status: "DRAFT",
        templateName: "Rock",
        organizationId: "org-acme",
        organizationName: "Acme",
        metrics: zeroMetrics,
        edition: null,
        openAt: "2026-05-01T00:00:00Z",
      },
    ];
    render(<CampaignsListWithFilter campaigns={onlyDrafts} />);
    fireEvent.click(screen.getByTestId("campaign-filter-pill-active"));
    expect(screen.getByTestId("campaign-filter-empty")).toBeInTheDocument();
  });
});
