import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

jest.mock("@/components/assessments/AssessmentResultView", () => ({
  AssessmentResultView: () => <div data-testid="mock-result-view" />,
}));

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

import { CampaignDetail } from "@/components/assessments/CampaignDetail";
import type { CampaignOverview } from "@/lib/assessments/campaign-detail";

const CAMPAIGN_ID = "camp-summary-1";
const GROUP_REPORT_HREF = `/assessments/${CAMPAIGN_ID}/report`;

function makeOverview(): CampaignOverview {
  return {
    campaign: {
      id: CAMPAIGN_ID,
      name: "Acme Q3",
      alias: "acme-q3",
      status: "ACTIVE",
      templateId: "tpl-scaling",
      templateName: "Scaling Up Full",
      organizationId: "org-1",
      organizationName: "Acme",
      openAt: null,
      closeAt: null,
      createdAt: new Date("2026-08-01T00:00:00Z"),
      invitationSubject: null,
      invitationBodyMarkdown: null,
      invitationBodyHtml: null,
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

const summaryReporting = {
  campaignId: CAMPAIGN_ID,
  campaignName: "Acme Q3",
  assessmentName: "Scaling Up Full",
  implementedTypes: [
    {
      type: "SCALING_CEO_FULL" as const,
      label: "Scaling Up · CEO Full",
      description: "Compare one CEO with an explicitly selected leadership team.",
    },
  ],
};

describe("CampaignDetail — Summary Reports integration", () => {
  it("keeps the existing group-report link DOM when summary reporting capability is absent or null", () => {
    const baseProps = {
      initialOverview: makeOverview(),
      initialRespondents: [],
      canViewGroupReport: true,
      groupReportHref: GROUP_REPORT_HREF,
    };
    const { container, unmount } = render(<CampaignDetail {...baseProps} />);
    const disabledMarkup = container.innerHTML;
    unmount();

    const withNullCapability = render(
      <CampaignDetail
        {...baseProps}
        summaryReporting={null}
      />,
    );

    expect(withNullCapability.container.innerHTML).toBe(disabledMarkup);
    expect(screen.getByTestId("campaign-detail-view-group-report")).toHaveAttribute(
      "href",
      GROUP_REPORT_HREF,
    );
    expect(screen.queryByText("Summary Reports")).toBeNull();
  });

  it("replaces the primary group-report link with the campaign-local Summary Reports panel when authorized", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ reports: [] }),
    });

    render(
      <CampaignDetail
        initialOverview={makeOverview()}
        initialRespondents={[]}
        canViewGroupReport
        groupReportHref={GROUP_REPORT_HREF}
        summaryReporting={summaryReporting}
      />,
    );

    expect(screen.queryByTestId("campaign-detail-view-group-report")).toBeNull();
    expect(screen.getByText("Summary Reports")).toBeInTheDocument();
    expect(screen.getByText("Acme Q3 · Scaling Up Full")).toBeInTheDocument();
    expect(await screen.findByText("No summary reports yet.")).toBeInTheDocument();
  });
});
