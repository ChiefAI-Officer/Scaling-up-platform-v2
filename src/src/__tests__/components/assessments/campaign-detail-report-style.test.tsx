import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
}));
jest.mock("@/components/assessments/AssessmentResultView", () => ({
  AssessmentResultView: () => <div />,
}));
const toast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast }) }));

import { CampaignDetail } from "@/components/assessments/CampaignDetail";
import type { CampaignOverview } from "@/lib/assessments/campaign-detail";

const LOCKED_MESSAGE = "Report appearance was locked when the first response completed. Refresh to see the final style.";

function overview(lockedAt: Date | null = null): CampaignOverview {
  return {
    campaign: {
      id: "camp-style-1", name: "Q3", alias: "q3", status: "ACTIVE",
      templateId: "tpl-1", templateName: "Scaling Up Full", organizationId: "org-1", organizationName: "Acme",
      openAt: new Date("2026-08-01T00:00:00Z"), closeAt: null, createdAt: new Date("2026-07-01T00:00:00Z"),
      invitationSubject: null, invitationBodyMarkdown: null, invitationBodyHtml: null,
      templateAlias: "scaling-up-full", reportStyle: "CLASSIC", reportStyleSource: "TEMPLATE_DEFAULT", reportStyleLockedAt: lockedAt,
    },
    stats: { totalParticipants: 0, invited: 0, viewed: 0, submitted: 0, completionPct: 0 },
  };
}

function closedOverview(): CampaignOverview {
  const value = overview();
  return { ...value, campaign: { ...value.campaign, status: "CLOSED" } };
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ success: true, data: {} }) })) as unknown as typeof fetch;
});

describe("CampaignDetail report appearance", () => {
  it("renders the server-authorized editable picker and saves an override", async () => {
    render(
      <CampaignDetail
        initialOverview={overview()}
        initialRespondents={[]}
        reportStylesAvailable
        canEditReportAppearance
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Modern Dashboard/i }));
    fireEvent.click(screen.getByRole("button", { name: /Save report appearance/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({ reportStyle: "MODERN_DASHBOARD" });
  });

  it("uses sparse custom preview assets from pinned narrative-only capabilities", () => {
    const custom = overview();
    custom.campaign.templateAlias = "founder-prompts-custom";
    render(
      <CampaignDetail
        initialOverview={custom}
        initialRespondents={[]}
        reportStylesAvailable
        canEditReportAppearance
        reportStylePreviewCapabilities={{
          reportType: "scored",
          hasMetrics: false,
          hasNarrativeResponses: true,
        }}
      />,
    );

    expect(
      screen.getByRole("img", { name: "Classic Cover preview" }),
    ).toHaveAttribute(
      "src",
      "/report-style-previews/sparse-custom/classic/cover.webp",
    );
  });

  it("preserves an unsaved style when an equivalent server projection gets a new object identity", () => {
    const { rerender } = render(
      <CampaignDetail
        initialOverview={overview()}
        initialRespondents={[]}
        reportStylesAvailable
        canEditReportAppearance
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /Executive Boardroom/i }));
    expect(screen.getByRole("radio", { name: /Executive Boardroom/i })).toBeChecked();
    expect(screen.getByRole("button", { name: /Save report appearance/i })).toBeEnabled();

    rerender(
      <CampaignDetail
        initialOverview={overview()}
        initialRespondents={[]}
        reportStylesAvailable
        canEditReportAppearance
      />,
    );

    expect(screen.getByRole("radio", { name: /Executive Boardroom/i })).toBeChecked();
    expect(screen.getByRole("button", { name: /Save report appearance/i })).toBeEnabled();
  });

  it("adopts an authoritative style and lock delivered by a refreshed server projection", () => {
    const { rerender } = render(
      <CampaignDetail
        initialOverview={overview()}
        initialRespondents={[]}
        reportStylesAvailable
        canEditReportAppearance
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Executive Boardroom/i }));

    const refreshed = overview(new Date("2026-08-06T04:00:00Z"));
    refreshed.campaign.reportStyle = "MODERN_DASHBOARD";
    refreshed.campaign.reportStyleSource = "CAMPAIGN_OVERRIDE";
    rerender(
      <CampaignDetail
        initialOverview={refreshed}
        initialRespondents={[]}
        reportStylesAvailable
        canEditReportAppearance={false}
      />,
    );

    expect(screen.getByText("Modern Dashboard")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByText("Campaign choice")).toBeInTheDocument();
    expect(screen.getByText(/Locked on/i)).toBeInTheDocument();
  });

  it("supports keyboard selection before the first completion", () => {
    render(
      <CampaignDetail
        initialOverview={overview()}
        initialRespondents={[]}
        reportStylesAvailable
        canEditReportAppearance
      />,
    );

    const classic = screen.getByRole("radio", { name: /Classic/i });
    const boardroom = screen.getByRole("radio", { name: /Executive Boardroom/i });
    classic.focus();
    fireEvent.keyDown(classic, { key: "ArrowRight" });

    expect(boardroom).toHaveFocus();
    expect(boardroom).toBeChecked();
  });

  it("keeps the chosen style, provenance, and lock time visible after the first completion", () => {
    render(
      <CampaignDetail
        initialOverview={overview(new Date("2026-08-03T12:00:00Z"))}
        initialRespondents={[]}
        reportStylesAvailable
        canEditReportAppearance={false}
      />,
    );
    expect(
      screen.getByText(/Report appearance was fixed when the first response was completed/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Locked on/i)).toBeInTheDocument();
    expect(screen.getByText("Classic")).toBeInTheDocument();
    expect(screen.getByText("Template default")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save report appearance/i })).not.toBeInTheDocument();
  });

  it("keeps a closed campaign editable for its owner until the first completion", () => {
    render(
      <CampaignDetail
        initialOverview={closedOverview()}
        initialRespondents={[]}
        reportStylesAvailable
        canEditReportAppearance
      />,
    );

    expect(screen.getByTestId("campaign-report-style-card")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Classic/i })).toBeChecked();
    expect(screen.getByRole("button", { name: /Save report appearance/i })).toBeInTheDocument();
    expect(screen.queryByText(/first completed response/i)).not.toBeInTheDocument();
  });

  it("shows the stored selection and provenance without exposing a save path to a read-only viewer", () => {
    const readOnlyOverview = overview();
    readOnlyOverview.campaign.reportStyle = "EXECUTIVE_BOARDROOM";
    readOnlyOverview.campaign.reportStyleSource = "CAMPAIGN_OVERRIDE";

    render(
      <CampaignDetail
        initialOverview={readOnlyOverview}
        initialRespondents={[]}
        reportStylesAvailable
        canEditReportAppearance={false}
      />,
    );

    expect(screen.getByTestId("campaign-report-style-card")).toBeInTheDocument();
    expect(screen.getByText("Executive Boardroom")).toBeInTheDocument();
    expect(screen.getByText("Campaign choice")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save report appearance/i })).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("keeps the selected appearance visible when write availability is off", () => {
    render(
      <CampaignDetail
        initialOverview={overview()}
        initialRespondents={[]}
        reportStylesAvailable={false}
        canEditReportAppearance={false}
      />,
    );

    expect(screen.getByTestId("campaign-report-style-card")).toBeInTheDocument();
    expect(screen.getByText("Classic")).toBeInTheDocument();
    expect(screen.getByText("Template default")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("refreshes and surfaces the exact race explanation on a locked response", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 409, json: async () => ({ error: "REPORT_STYLE_LOCKED", message: LOCKED_MESSAGE }) })) as unknown as typeof fetch;
    render(
      <CampaignDetail
        initialOverview={overview()}
        initialRespondents={[]}
        reportStylesAvailable
        canEditReportAppearance
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Modern Dashboard/i }));
    fireEvent.click(screen.getByRole("button", { name: /Save report appearance/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: LOCKED_MESSAGE, variant: "destructive" }));
  });
});
