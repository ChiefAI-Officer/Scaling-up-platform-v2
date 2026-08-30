import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

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
import { resolveSummaryReportingCapability } from "@/lib/assessments/summary-reports/capability";
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
      templateAlias: "scaling-up-full",
      reportStyle: null,
      reportStyleSource: null,
      reportStyleLockedAt: null,
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
  it.each([
    { state: "unsupported family", alias: "RockHabits", killed: "0", status: "ACTIVE" as const, visible: false },
    { state: "kill override", alias: "scaling-up-full", killed: "1", status: "ACTIVE" as const, visible: false },
    { state: "DRAFT destination with published version", alias: "scaling-up-full", killed: "0", status: "DRAFT" as const, visible: true },
  ])("preserves the real DOM contract for $state", async ({ alias, killed, status, visible }) => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ reports: [] }) });
    const overview = makeOverview();
    overview.campaign.status = status;
    const capability = resolveSummaryReportingCapability(
      { SUMMARY_REPORTING_ENABLED: "1", SUMMARY_REPORTING_KILL: killed },
      { id: CAMPAIGN_ID, accessMode: "INVITED", template: { alias }, version: { publishedAt: new Date("2026-08-01") } },
      "Acme Q3", "Scaling Up Full",
    );
    render(<CampaignDetail initialOverview={overview} initialRespondents={[]} canViewGroupReport groupReportHref={GROUP_REPORT_HREF} summaryReporting={capability} />);
    if (visible) {
      const trigger = screen.getByTestId("campaign-detail-view-group-report");
      expect(trigger.tagName).toBe("BUTTON");
      expect(trigger).toHaveTextContent("View reports");
      expect(screen.queryByText("Summary Reports")).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    } else {
      expect(screen.queryByText("Summary Reports")).toBeNull();
      expect(screen.getByTestId("campaign-detail-view-group-report")).toHaveAttribute("href", GROUP_REPORT_HREF);
      expect(global.fetch).not.toHaveBeenCalled();
    }
  });

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

  it("turns the primary group-report entry into a non-prefetching report dropdown when authorized", async () => {
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

    const trigger = screen.getByTestId("campaign-detail-view-group-report");
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger).toHaveTextContent("View reports");
    expect(screen.queryByText("Summary Reports")).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();

    fireEvent.keyDown(trigger, { key: "ArrowDown" });

    const groupReport = await screen.findByTestId(
      "campaign-detail-group-report-option",
    );
    expect(groupReport.tagName).toBe("A");
    expect(groupReport).toHaveTextContent("Group report");
    expect(groupReport).toHaveAttribute("href", GROUP_REPORT_HREF);
    expect(groupReport).toHaveAttribute("target", "_blank");
    expect(groupReport).toHaveAttribute("rel", "noopener noreferrer");
    expect(groupReport).not.toHaveAttribute("data-prefetch");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
