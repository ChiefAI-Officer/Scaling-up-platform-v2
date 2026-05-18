/**
 * Assessment v7.6 — CampaignsListWithFilter pills (Task I).
 */

import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";

import {
  CampaignsListWithFilter,
  type CampaignListItem,
} from "@/components/assessments/CampaignsListWithFilter";

const fixture: CampaignListItem[] = [
  {
    id: "c1",
    name: "Q1 Pulse",
    alias: "q1-pulse",
    status: "DRAFT",
    templateName: "Rockefeller Habits",
    organizationName: "Acme",
    openAt: "2026-05-01T00:00:00Z",
  },
  {
    id: "c2",
    name: "Q2 Pulse",
    alias: "q2-pulse",
    status: "ACTIVE",
    templateName: "Rockefeller Habits",
    organizationName: "Acme",
    openAt: "2026-06-01T00:00:00Z",
  },
  {
    id: "c3",
    name: "Q3 Pulse",
    alias: "q3-pulse",
    status: "ACTIVE",
    templateName: "Rockefeller Habits",
    organizationName: "Beta",
    openAt: "2026-07-01T00:00:00Z",
  },
  {
    id: "c4",
    name: "Old Pulse",
    alias: "old-pulse",
    status: "CLOSED",
    templateName: "Rockefeller Habits",
    organizationName: "Beta",
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

  it("default filter is ALL — every campaign is rendered", () => {
    render(<CampaignsListWithFilter campaigns={fixture} />);
    expect(screen.getByTestId("campaign-row-c1")).toBeInTheDocument();
    expect(screen.getByTestId("campaign-row-c2")).toBeInTheDocument();
    expect(screen.getByTestId("campaign-row-c3")).toBeInTheDocument();
    expect(screen.getByTestId("campaign-row-c4")).toBeInTheDocument();
  });

  it("clicking a status pill filters the rendered rows", () => {
    render(<CampaignsListWithFilter campaigns={fixture} />);
    fireEvent.click(screen.getByTestId("campaign-filter-pill-active"));
    expect(screen.queryByTestId("campaign-row-c1")).toBeNull();
    expect(screen.getByTestId("campaign-row-c2")).toBeInTheDocument();
    expect(screen.getByTestId("campaign-row-c3")).toBeInTheDocument();
    expect(screen.queryByTestId("campaign-row-c4")).toBeNull();
  });

  it("clicking DRAFT shows only DRAFT campaigns", () => {
    render(<CampaignsListWithFilter campaigns={fixture} />);
    fireEvent.click(screen.getByTestId("campaign-filter-pill-draft"));
    expect(screen.getByTestId("campaign-row-c1")).toBeInTheDocument();
    expect(screen.queryByTestId("campaign-row-c2")).toBeNull();
    expect(screen.queryByTestId("campaign-row-c3")).toBeNull();
    expect(screen.queryByTestId("campaign-row-c4")).toBeNull();
  });

  it("returning to ALL re-displays everything", () => {
    render(<CampaignsListWithFilter campaigns={fixture} />);
    fireEvent.click(screen.getByTestId("campaign-filter-pill-closed"));
    expect(screen.queryByTestId("campaign-row-c1")).toBeNull();
    fireEvent.click(screen.getByTestId("campaign-filter-pill-all"));
    expect(screen.getByTestId("campaign-row-c1")).toBeInTheDocument();
    expect(screen.getByTestId("campaign-row-c2")).toBeInTheDocument();
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
        organizationName: "Acme",
        openAt: "2026-05-01T00:00:00Z",
      },
    ];
    render(<CampaignsListWithFilter campaigns={onlyDrafts} />);
    fireEvent.click(screen.getByTestId("campaign-filter-pill-active"));
    expect(screen.getByTestId("campaign-filter-empty")).toBeInTheDocument();
  });
});
