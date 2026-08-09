import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PublicCampaignReportDesign } from "@/components/admin/public-campaigns/PublicCampaignReportDesign";
import type { PublicCampaignViewModel } from "@/lib/assessments/public-campaign-ui";

function campaign(
  overrides: Partial<PublicCampaignViewModel> = {},
): PublicCampaignViewModel {
  return {
    id: "campaign-1",
    name: "August lead campaign",
    alias: "august-lead-campaign",
    status: "ACTIVE",
    openAt: "2026-08-01T12:00:00.000Z",
    closeAt: null,
    responseCount: 0,
    reportStyle: "EXECUTIVE_BOARDROOM",
    reportStyleSource: "TEMPLATE_DEFAULT",
    reportStyleLockedAt: null,
    reportStylesAvailable: true,
    reportStylePreviewCapabilities: {
      reportType: "qualitative",
      hasMetrics: false,
      hasNarrativeResponses: true,
    },
    template: {
      id: "template-1",
      name: "Leadership narrative",
      alias: "leadership-narrative",
    },
    ...overrides,
  };
}

function response(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("PublicCampaignReportDesign", () => {
  it("shows the current selection, resolved preview anatomy, and approved source copy (catches stale picker inputs)", () => {
    render(
      <PublicCampaignReportDesign
        campaign={campaign()}
        expanded
        onCampaignUpdated={jest.fn()}
      />,
    );

    expect(screen.getByRole("radio", { name: /executive boardroom/i })).toBeChecked();
    expect(
      screen.getByRole("img", { name: "Executive Boardroom Cover preview" }),
    ).toHaveAttribute(
      "src",
      "/report-style-previews/sparse-custom/executive-boardroom/cover.webp",
    );
    expect(screen.getByText("Uses the assessment's default design")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save report design" })).toBeDisabled();
  });

  it("PATCHes a changed unlocked design and emits only owned report fields (catches stale full-row replacement)", async () => {
    global.fetch = jest.fn(async () =>
      response({
        success: true,
        data: {
          id: "campaign-1",
          reportStyle: "MODERN_DASHBOARD",
          reportStyleSource: "CAMPAIGN_OVERRIDE",
          reportStyleLockedAt: null,
        },
      }),
    ) as jest.MockedFunction<typeof fetch>;
    const onCampaignUpdated = jest.fn();
    render(
      <PublicCampaignReportDesign
        campaign={campaign()}
        expanded
        onCampaignUpdated={onCampaignUpdated}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /modern dashboard/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save report design" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/admin/public-campaigns/campaign-1/report-style",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportStyle: "MODERN_DASHBOARD" }),
        },
      );
    });
    expect(onCampaignUpdated).toHaveBeenCalledWith({
      reportStyle: "MODERN_DASHBOARD",
      reportStyleSource: "CAMPAIGN_OVERRIDE",
      reportStyleLockedAt: null,
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Report design saved.",
    );
  });

  it("disables a locked design and explains why it cannot change (catches mutable frozen reports)", () => {
    render(
      <PublicCampaignReportDesign
        campaign={campaign({
          reportStyleSource: "CAMPAIGN_OVERRIDE",
          reportStyleLockedAt: "2026-08-09T12:00:00.000Z",
        })}
        expanded
        onCampaignUpdated={jest.fn()}
      />,
    );

    screen.getAllByRole("radio").forEach((radio) => expect(radio).toBeDisabled());
    expect(screen.getByText("Customized for this campaign")).toBeInTheDocument();
    expect(
      screen.getByText("This report design cannot be changed after the first response."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save report design" })).not.toBeInTheDocument();
  });

  it("immediately reconciles an authoritative 409 without reloading the list (catches completion-race drift)", async () => {
    const initialCampaign = campaign({ reportStyle: "CLASSIC" });
    global.fetch = jest.fn(async () =>
      response(
        {
          error: "REPORT_STYLE_LOCKED",
          message: "Refresh to see the final style.",
          data: {
            id: "campaign-1",
            reportStyle: "EXECUTIVE_BOARDROOM",
            reportStyleSource: "CAMPAIGN_OVERRIDE",
            reportStyleLockedAt: "2026-08-10T01:15:00.000Z",
          },
        },
        false,
        409,
      ),
    ) as jest.MockedFunction<typeof fetch>;
    const onCampaignUpdated = jest.fn();
    render(
      <PublicCampaignReportDesign
        campaign={initialCampaign}
        expanded
        onCampaignUpdated={onCampaignUpdated}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /modern dashboard/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save report design" }));

    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /executive boardroom/i })).toBeChecked(),
    );
    screen.getAllByRole("radio").forEach((radio) => expect(radio).toBeDisabled());
    expect(screen.getByText("Customized for this campaign")).toBeInTheDocument();
    expect(
      screen.getByText("This report design cannot be changed after the first response."),
    ).toBeInTheDocument();
    expect(onCampaignUpdated).toHaveBeenCalledWith({
      reportStyle: "EXECUTIVE_BOARDROOM",
      reportStyleSource: "CAMPAIGN_OVERRIDE",
      reportStyleLockedAt: "2026-08-10T01:15:00.000Z",
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("uses the friendly save error without leaking status or server enum (catches raw API errors)", async () => {
    global.fetch = jest.fn(async () =>
      response(
        { success: false, error: "REPORT_STYLE_INVALID internal status 500" },
        false,
        500,
      ),
    ) as jest.MockedFunction<typeof fetch>;
    const { container } = render(
      <PublicCampaignReportDesign
        campaign={campaign()}
        expanded
        onCampaignUpdated={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /modern dashboard/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save report design" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't save the report design. Try again.",
    );
    expect(container).not.toHaveTextContent("REPORT_STYLE_INVALID");
    expect(container).not.toHaveTextContent("500");
  });
});
