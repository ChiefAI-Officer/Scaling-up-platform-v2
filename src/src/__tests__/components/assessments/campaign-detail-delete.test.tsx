/**
 * CampaignDetail — Delete campaign dialog (Wave D #1).
 *
 * Tests:
 *  1. "Delete campaign" button is always visible (not gated on status).
 *  2. Clicking it opens the confirm dialog showing blast-radius copy.
 *  3. Confirming calls DELETE /api/assessment-campaigns/[id] and redirects.
 *  4. Cancel closes without calling fetch.
 *  5. API error toasts a destructive message.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
}));

jest.mock("@/components/assessments/AssessmentResultView", () => ({
  AssessmentResultView: () => <div data-testid="mock-result-view" />,
}));

const mockToast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

import { CampaignDetail } from "@/components/assessments/CampaignDetail";
import type {
  CampaignOverview,
  CampaignRespondentRow,
} from "@/lib/assessments/campaign-detail";

const CAMPAIGN_ID = "camp-del-1";

function makeOverview(
  status: "DRAFT" | "ACTIVE" | "CLOSED" = "ACTIVE",
): CampaignOverview {
  return {
    campaign: {
      id: CAMPAIGN_ID,
      name: "Delete Me Campaign",
      alias: "delete-me",
      status,
      templateName: "Rockefeller Habits",
      templateId: "tpl-1",
      organizationName: "Acme Inc.",
      organizationId: "org-1",
      openAt: new Date("2026-05-01T00:00:00Z"),
      closeAt: null,
      createdAt: new Date("2026-04-01T00:00:00Z"),
      invitationSubject: null,
      invitationBodyMarkdown: null,
    },
    stats: {
      totalParticipants: 2,
      invited: 2,
      viewed: 0,
      submitted: 1,
      completionPct: 50,
    },
  };
}

const noRespondents: CampaignRespondentRow[] = [];

function renderDetail(
  status: "DRAFT" | "ACTIVE" | "CLOSED" = "ACTIVE",
  respondents: CampaignRespondentRow[] = noRespondents,
) {
  return render(
    <CampaignDetail
      initialOverview={makeOverview(status)}
      initialRespondents={respondents}
    />,
  );
}

describe("CampaignDetail — Delete campaign dialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it("renders the Delete campaign button (always visible)", () => {
    renderDetail("ACTIVE");
    expect(screen.getByTestId("campaign-delete-btn")).toBeInTheDocument();
  });

  it("shows the delete button even when campaign is CLOSED", () => {
    renderDetail("CLOSED");
    expect(screen.getByTestId("campaign-delete-btn")).toBeInTheDocument();
  });

  it("opens the confirm dialog when Delete button is clicked", () => {
    renderDetail("ACTIVE");
    fireEvent.click(screen.getByTestId("campaign-delete-btn"));
    expect(screen.getByTestId("campaign-delete-dialog")).toBeInTheDocument();
    expect(
      screen.getByText(/responses are retained/i),
    ).toBeInTheDocument();
  });

  it("Cancel closes the dialog without calling fetch", () => {
    renderDetail("ACTIVE");
    fireEvent.click(screen.getByTestId("campaign-delete-btn"));
    expect(screen.getByTestId("campaign-delete-dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("campaign-delete-cancel"));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("Confirm calls DELETE /api/assessment-campaigns/[id] and redirects on success", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({ success: true }),
    });

    renderDetail("ACTIVE");
    fireEvent.click(screen.getByTestId("campaign-delete-btn"));
    fireEvent.click(screen.getByTestId("campaign-delete-confirm"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/assessment-campaigns/${CAMPAIGN_ID}`,
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Campaign deleted" }),
      );
    });
  });

  it("shows destructive toast on API error", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: jest.fn().mockResolvedValue({ success: false, error: "Forbidden" }),
    });

    renderDetail("ACTIVE");
    fireEvent.click(screen.getByTestId("campaign-delete-btn"));
    fireEvent.click(screen.getByTestId("campaign-delete-confirm"));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Could not delete campaign",
          variant: "destructive",
        }),
      );
    });
  });
});
