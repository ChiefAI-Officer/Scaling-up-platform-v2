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
    render(<CampaignDetail initialOverview={overview()} initialRespondents={[]} reportStylesAvailable />);
    fireEvent.click(screen.getByRole("radio", { name: /Modern Dashboard/i }));
    fireEvent.click(screen.getByRole("button", { name: /Save report appearance/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({ reportStyle: "MODERN_DASHBOARD" });
  });

  it("keeps the chosen style and previews visible but read-only after the first completion", () => {
    render(<CampaignDetail initialOverview={overview(new Date("2026-08-03T12:00:00Z"))} initialRespondents={[]} reportStylesAvailable />);
    expect(screen.getByText(/Changes are unavailable after the first completed response/i)).toBeInTheDocument();
    expect(screen.getByText(/Locked on/i)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Classic/i })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Cover" })).toBeInTheDocument();
  });

  it("keeps report appearance visible but read-only for a closed unlocked campaign", () => {
    render(<CampaignDetail initialOverview={closedOverview()} initialRespondents={[]} reportStylesAvailable />);

    expect(screen.getByTestId("campaign-report-style-card")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Classic/i })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Cover" })).toBeInTheDocument();
    expect(screen.getByText("Closed campaigns cannot change report appearance.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save report appearance/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/first completed response/i)).not.toBeInTheDocument();
  });

  it("refreshes and surfaces the exact race explanation on a locked response", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 409, json: async () => ({ error: "REPORT_STYLE_LOCKED", message: LOCKED_MESSAGE }) })) as unknown as typeof fetch;
    render(<CampaignDetail initialOverview={overview()} initialRespondents={[]} reportStylesAvailable />);
    fireEvent.click(screen.getByRole("radio", { name: /Modern Dashboard/i }));
    fireEvent.click(screen.getByRole("button", { name: /Save report appearance/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: LOCKED_MESSAGE, variant: "destructive" }));
  });
});
