import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn(), push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));
jest.mock("@/components/assessments/AssessmentResultView", () => ({
  AssessmentResultView: () => <div data-testid="mock-result-view" />,
}));
const mockToast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: mockToast }) }));

import { CampaignDetail } from "@/components/assessments/CampaignDetail";
import type {
  CampaignOverview,
  CampaignRespondentRow,
} from "@/lib/assessments/campaign-detail";

const CAMPAIGN_ID = "campaign-member-links";

const overview: CampaignOverview = {
  campaign: {
    id: CAMPAIGN_ID,
    name: "Leadership Alignment",
    alias: "leadership-alignment",
    status: "ACTIVE",
    templateId: "template-1",
    templateName: "Leadership Vision Alignment",
    templateAlias: "leadership-vision-alignment",
    reportStyle: "CLASSIC",
    reportStyleSource: "TEMPLATE_DEFAULT",
    reportStyleLockedAt: null,
    organizationId: "org-1",
    organizationName: "Acme",
    openAt: new Date("2026-09-01T00:00:00.000Z"),
    closeAt: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    invitationSubject: null,
    invitationBodyMarkdown: null,
  },
  stats: { totalParticipants: 2, invited: 2, viewed: 0, submitted: 1, completionPct: 50 },
};

function respondent(id: string, hasSubmission: boolean): CampaignRespondentRow {
  return {
    participantId: `participant-${id}`,
    respondent: {
      id: `respondent-${id}`,
      firstName: id === "done" ? "Dana" : "Pat",
      lastName: "Member",
      email: `${id}@example.com`,
      jobTitle: null,
    },
    teamSnapshot: { pathIds: [], pathLabels: [] },
    invitation: null,
    hasSubmission,
    submissionId: hasSubmission ? `submission-${id}` : null,
    submittedAt: hasSubmission ? new Date("2026-09-10T00:00:00.000Z") : null,
    isCEO: false,
  };
}

const respondents = [respondent("done", true), respondent("pending", false)];

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: { sent: 2, skipped: 0 } }),
  });
});

describe("CampaignDetail member report links", () => {
  it("uses a counted dialog with the 24-hour caveat for the bulk send", async () => {
    const confirm = jest.spyOn(window, "confirm");
    render(
      <CampaignDetail
        initialOverview={overview}
        initialRespondents={respondents}
        memberPortalSendEnabled
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Send report links" }));
    expect(screen.getByTestId("member-links-dialog")).toBeInTheDocument();
    expect(screen.getByText(/email 2 people/i)).toBeInTheDocument();
    expect(screen.getByText(/expire in 24 hours/i)).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("member-links-confirm"));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/assessment-campaigns/${CAMPAIGN_ID}/member-links`,
        expect.objectContaining({ method: "POST", body: JSON.stringify({}) }),
      ),
    );
    confirm.mockRestore();
  });

  it("offers a per-person send for both completed and incomplete respondents", async () => {
    render(
      <CampaignDetail
        initialOverview={overview}
        initialRespondents={respondents}
        memberPortalSendEnabled
      />,
    );

    const buttons = screen.getAllByRole("button", { name: "Send report link" });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);
    expect(screen.getByText(/email Pat Member/i)).toBeInTheDocument();
    expect(screen.getByText(/expire in 24 hours/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("member-links-confirm"));

    await waitFor(() => {
      const init = (global.fetch as jest.Mock).mock.calls[0][1];
      expect(JSON.parse(init.body)).toEqual({ respondentIds: ["respondent-pending"] });
    });
  });

  it("renders no send controls when the server-resolved portal gate is off", () => {
    render(<CampaignDetail initialOverview={overview} initialRespondents={respondents} />);
    expect(screen.queryByRole("button", { name: "Send report links" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send report link" })).not.toBeInTheDocument();
  });
});
