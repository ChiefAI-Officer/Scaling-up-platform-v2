import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh,
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

jest.mock("@/components/assessments/AssessmentResultView", () => ({
  AssessmentResultView: () => <div data-testid="mock-result-view" />,
}));

const toast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast }),
}));

import { CampaignDetail } from "@/components/assessments/CampaignDetail";
import type { CampaignOverview } from "@/lib/assessments/campaign-detail";

const CAMPAIGN_ID = "camp-email-notifications-1";
const CARD = "campaign-email-notifications-card";
const RESULTS_LABEL = "Email each respondent their results";
const COACH_LABEL = "Email me when someone completes the assessment";

function makeOverview(
  opts: {
    status?: "DRAFT" | "ACTIVE" | "CLOSED";
    sendResultsToRespondent?: boolean;
    notifyCoachOnCompletion?: boolean;
  } = {},
): CampaignOverview {
  return {
    campaign: {
      id: CAMPAIGN_ID,
      name: "Email Notifications Campaign",
      alias: "email-notifications-test",
      status: opts.status ?? "ACTIVE",
      templateId: "tpl-1",
      templateName: "Rockefeller Habits Checklist",
      templateAlias: "rockefeller-habits",
      reportStyle: "CLASSIC",
      reportStyleSource: "TEMPLATE_DEFAULT",
      reportStyleLockedAt: null,
      organizationId: "org-1",
      organizationName: "Acme Corp",
      openAt: new Date("2026-07-01T00:00:00Z"),
      closeAt: null,
      createdAt: new Date("2026-06-01T00:00:00Z"),
      invitationSubject: null,
      invitationBodyMarkdown: null,
      invitationBodyHtml: null,
      sendResultsToRespondent: opts.sendResultsToRespondent ?? false,
      notifyCoachOnCompletion: opts.notifyCoachOnCompletion ?? false,
    },
    stats: {
      totalParticipants: 0,
      invited: 0,
      viewed: 0,
      submitted: 0,
      completionPct: 0,
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
});

describe("CampaignDetail — existing-campaign email notifications", () => {
  it("renders both enabled choices for an approved active campaign", () => {
    render(
      <CampaignDetail
        initialOverview={makeOverview()}
        initialRespondents={[]}
        resultsEmailEnabled
        resultsEmailApproved
        coachNotifyEnabled
      />,
    );

    expect(
      screen.getByRole("checkbox", { name: RESULTS_LABEL }),
    ).toBeEnabled();
    expect(
      screen.getByRole("checkbox", { name: COACH_LABEL }),
    ).toBeEnabled();
  });

  it("hides the card when both capabilities are false", () => {
    render(
      <CampaignDetail
        initialOverview={makeOverview()}
        initialRespondents={[]}
        resultsEmailEnabled={false}
        coachNotifyEnabled={false}
      />,
    );

    expect(screen.queryByTestId(CARD)).not.toBeInTheDocument();
  });

  it("shows a stored respondent choice but disables it when approval is absent", () => {
    render(
      <CampaignDetail
        initialOverview={makeOverview({ sendResultsToRespondent: true })}
        initialRespondents={[]}
        resultsEmailEnabled
        resultsEmailApproved={false}
      />,
    );

    expect(screen.getByTestId(CARD)).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: RESULTS_LABEL }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: RESULTS_LABEL }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        "Not available for this assessment. Ask an admin to enable respondent results email.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps an unapproved stored-false respondent choice unchecked and disabled", () => {
    render(
      <CampaignDetail
        initialOverview={makeOverview({ sendResultsToRespondent: false })}
        initialRespondents={[]}
        resultsEmailEnabled
        resultsEmailApproved={false}
      />,
    );

    expect(
      screen.getByRole("checkbox", { name: RESULTS_LABEL }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: RESULTS_LABEL }),
    ).toBeDisabled();
  });

  it("shows only the coach choice when only coach notifications are enabled", () => {
    render(
      <CampaignDetail
        initialOverview={makeOverview()}
        initialRespondents={[]}
        coachNotifyEnabled
      />,
    );

    expect(
      screen.queryByRole("checkbox", { name: RESULTS_LABEL }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: COACH_LABEL }),
    ).toBeEnabled();
  });

  it("hides editable email choices for a closed campaign", () => {
    render(
      <CampaignDetail
        initialOverview={makeOverview({ status: "CLOSED" })}
        initialRespondents={[]}
        resultsEmailEnabled
        resultsEmailApproved
        coachNotifyEnabled
      />,
    );

    expect(screen.queryByTestId(CARD)).not.toBeInTheDocument();
  });

  it("initializes both checkboxes from stored true values", () => {
    render(
      <CampaignDetail
        initialOverview={makeOverview({
          sendResultsToRespondent: true,
          notifyCoachOnCompletion: true,
        })}
        initialRespondents={[]}
        resultsEmailEnabled
        resultsEmailApproved
        coachNotifyEnabled
      />,
    );

    expect(
      screen.getByRole("checkbox", { name: RESULTS_LABEL }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: RESULTS_LABEL }),
    ).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: COACH_LABEL })).toBeChecked();
  });

  it("PATCHes only the respondent-results choice and accepts its exact echo", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { sendResultsToRespondent: true },
      }),
    });
    render(
      <CampaignDetail
        initialOverview={makeOverview()}
        initialRespondents={[]}
        resultsEmailEnabled
        resultsEmailApproved
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: RESULTS_LABEL }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/assessment-campaigns/${CAMPAIGN_ID}`,
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ sendResultsToRespondent: true }),
        }),
      ),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(
      screen.getByRole("checkbox", { name: RESULTS_LABEL }),
    ).toBeChecked();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.any(String) }),
    );
    expect(toast.mock.calls[0][0]).not.toHaveProperty(
      "variant",
      "destructive",
    );
  });

  it("PATCHes only the coach-notification choice and accepts its exact echo", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { notifyCoachOnCompletion: true },
      }),
    });
    render(
      <CampaignDetail
        initialOverview={makeOverview()}
        initialRespondents={[]}
        coachNotifyEnabled
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: COACH_LABEL }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/assessment-campaigns/${CAMPAIGN_ID}`,
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ notifyCoachOnCompletion: true }),
        }),
      ),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("checkbox", { name: COACH_LABEL })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: COACH_LABEL }),
    ).toBeEnabled();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.any(String) }),
    );
    expect(toast.mock.calls[0][0]).not.toHaveProperty(
      "variant",
      "destructive",
    );
  });

  it("reverts the respondent-results choice after an HTTP failure", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ success: false, error: "Request failed" }),
    });
    render(
      <CampaignDetail
        initialOverview={makeOverview()}
        initialRespondents={[]}
        resultsEmailEnabled
        resultsEmailApproved
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: RESULTS_LABEL }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", { name: RESULTS_LABEL }),
      ).not.toBeChecked(),
    );
    expect(
      screen.getByRole("checkbox", { name: RESULTS_LABEL }),
    ).toBeEnabled();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reverts the respondent-results choice when a 200 response omits data", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    render(
      <CampaignDetail
        initialOverview={makeOverview()}
        initialRespondents={[]}
        resultsEmailEnabled
        resultsEmailApproved
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: RESULTS_LABEL }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", { name: RESULTS_LABEL }),
      ).not.toBeChecked(),
    );
    expect(
      screen.getByRole("checkbox", { name: RESULTS_LABEL }),
    ).toBeEnabled();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reverts the coach-notification choice after an HTTP failure", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ success: false, error: "Request failed" }),
    });
    render(
      <CampaignDetail
        initialOverview={makeOverview()}
        initialRespondents={[]}
        coachNotifyEnabled
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: COACH_LABEL }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", { name: COACH_LABEL }),
      ).not.toBeChecked(),
    );
    expect(
      screen.getByRole("checkbox", { name: COACH_LABEL }),
    ).toBeEnabled();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reverts the coach-notification choice after a mismatched 200 echo", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { notifyCoachOnCompletion: false },
      }),
    });
    render(
      <CampaignDetail
        initialOverview={makeOverview()}
        initialRespondents={[]}
        coachNotifyEnabled
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: COACH_LABEL }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", { name: COACH_LABEL }),
      ).not.toBeChecked(),
    );
    expect(
      screen.getByRole("checkbox", { name: COACH_LABEL }),
    ).toBeEnabled();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
