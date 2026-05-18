/**
 * Assessment v7.6 — CampaignDetail Close button + dialog (Task I).
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// next/navigation is required by the component (useRouter). Provide a mock
// before importing the component.
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
}));

// The detail component shows a nested AssessmentResultView when a row is
// expanded; we don't need its real implementation here.
jest.mock("@/components/assessments/AssessmentResultView", () => ({
  AssessmentResultView: () => <div data-testid="mock-result-view" />,
}));

// useToast is a hook with internal state; stub it to a no-op.
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

import { CampaignDetail } from "@/components/assessments/CampaignDetail";
import type {
  CampaignOverview,
  CampaignRespondentRow,
} from "@/lib/assessments/campaign-detail";

function makeOverview(
  status: "DRAFT" | "ACTIVE" | "CLOSED",
): CampaignOverview {
  return {
    campaign: {
      id: "c1",
      name: "Q1 Pulse",
      alias: "q1-pulse",
      status,
      templateName: "Rockefeller Habits",
      templateId: "tpl-1",
      organizationName: "Acme Inc.",
      organizationId: "org-1",
      openAt: new Date("2026-05-01T00:00:00Z"),
      closeAt: null,
      createdAt: new Date("2026-04-01T00:00:00Z"),
    },
    stats: {
      totalParticipants: 1,
      invited: 0,
      viewed: 0,
      submitted: 0,
      completionPct: 0,
    },
  };
}

const noRespondents: CampaignRespondentRow[] = [];

describe("CampaignDetail Close button", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it("HIDES the Close button when status is CLOSED", () => {
    render(
      <CampaignDetail
        initialOverview={makeOverview("CLOSED")}
        initialRespondents={noRespondents}
      />,
    );
    expect(screen.queryByTestId("campaign-close-btn")).toBeNull();
  });

  it("renders 'Discard Draft' when status is DRAFT", () => {
    render(
      <CampaignDetail
        initialOverview={makeOverview("DRAFT")}
        initialRespondents={noRespondents}
      />,
    );
    const btn = screen.getByTestId("campaign-close-btn");
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toMatch(/discard draft/i);
  });

  it("renders 'Close Campaign' when status is ACTIVE", () => {
    render(
      <CampaignDetail
        initialOverview={makeOverview("ACTIVE")}
        initialRespondents={noRespondents}
      />,
    );
    const btn = screen.getByTestId("campaign-close-btn");
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toMatch(/close campaign/i);
  });

  it("Cancel closes the dialog without POSTing", async () => {
    render(
      <CampaignDetail
        initialOverview={makeOverview("ACTIVE")}
        initialRespondents={noRespondents}
      />,
    );
    fireEvent.click(screen.getByTestId("campaign-close-btn"));
    await waitFor(() =>
      expect(screen.getByTestId("campaign-close-dialog")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("campaign-close-cancel"));
    await waitFor(() => {
      expect(screen.queryByTestId("campaign-close-dialog")).toBeNull();
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("Confirm POSTs to /api/assessment-campaigns/:id/close with the typed reason", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { id: "c1", status: "CLOSED", closedAt: "2026-05-18T00:00:00Z" },
      }),
    });

    render(
      <CampaignDetail
        initialOverview={makeOverview("ACTIVE")}
        initialRespondents={noRespondents}
      />,
    );
    fireEvent.click(screen.getByTestId("campaign-close-btn"));
    await waitFor(() =>
      expect(screen.getByTestId("campaign-close-dialog")).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByTestId("campaign-close-reason"), {
      target: { value: "debrief complete" },
    });
    fireEvent.click(screen.getByTestId("campaign-close-confirm"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/assessment-campaigns/c1/close",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "debrief complete" }),
        }),
      );
    });
  });
});
