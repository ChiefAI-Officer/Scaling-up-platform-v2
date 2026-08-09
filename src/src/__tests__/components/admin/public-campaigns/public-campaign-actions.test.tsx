import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PublicCampaignActions } from "@/components/admin/public-campaigns/PublicCampaignActions";
import type { PublicCampaignViewModel } from "@/lib/assessments/public-campaign-ui";

function campaign(
  overrides: Partial<PublicCampaignViewModel> = {},
): PublicCampaignViewModel {
  return {
    id: "campaign-august",
    name: "August lead campaign",
    alias: "august lead/campaign",
    status: "DRAFT",
    openAt: "2026-08-18T12:00:00.000Z",
    closeAt: null,
    responseCount: 0,
    reportStyle: "CLASSIC",
    reportStyleSource: "TEMPLATE_DEFAULT",
    reportStyleLockedAt: null,
    reportStylesAvailable: false,
    reportStylePreviewCapabilities: {
      reportType: "scored",
      hasMetrics: true,
      hasNarrativeResponses: false,
    },
    template: {
      id: "template-1",
      name: "Scaling Up Assessment",
      alias: "scaling-up-assessment",
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

function renderActions(value: PublicCampaignViewModel) {
  const onCampaignUpdated = jest.fn();
  const onToggleResponses = jest.fn();
  const onToggleReportDesign = jest.fn();
  render(
    <PublicCampaignActions
      campaign={value}
      origin="https://host.example"
      onCampaignUpdated={onCampaignUpdated}
      onToggleResponses={onToggleResponses}
      responsesExpanded={false}
      onToggleReportDesign={onToggleReportDesign}
      reportDesignExpanded={false}
    />,
  );
  return { onCampaignUpdated, onToggleResponses, onToggleReportDesign };
}

beforeEach(() => {
  global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: jest.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("PublicCampaignActions", () => {
  it.each([
    ["DRAFT", ["Publish"], ["Copy link", "View responses"]],
    ["ACTIVE", ["Copy link", "View responses"], ["Publish"]],
    ["CLOSED", ["View responses"], ["Publish", "Copy link"]],
  ] as const)(
    "shows only useful %s actions (catches the wrong lifecycle branch)",
    (status, shown, hidden) => {
      renderActions(campaign({ status }));

      for (const name of shown) {
        expect(screen.getByRole("button", { name })).toBeInTheDocument();
      }
      for (const name of hidden) {
        expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
      }
      expect(screen.queryByText("More")).not.toBeInTheDocument();
    },
  );

  it.each(["DRAFT", "ACTIVE", "CLOSED"] as const)(
    "reveals report design from More for %s campaigns (catches a missing supported secondary action)",
    (status) => {
      const { onToggleReportDesign } = renderActions(
        campaign({ status, reportStylesAvailable: true }),
      );

      fireEvent.click(screen.getByText("More"));
      const reportDesign = screen.getByRole("button", { name: "Report design" });
      expect(reportDesign).toHaveAttribute("aria-expanded", "false");
      fireEvent.click(reportDesign);
      expect(onToggleReportDesign).toHaveBeenCalledTimes(1);
    },
  );

  it("opens and cancels the approved publish dialog (catches destructive publishing without confirmation)", async () => {
    renderActions(campaign());

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByRole("dialog")).toHaveAccessibleName(
      "Publish August lead campaign?",
    );
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Anyone with the link will be able to take it once the campaign opens.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("publishes and merges the partial response into the full row (catches field loss after publish)", async () => {
    const draft = campaign();
    (global.fetch as jest.Mock).mockResolvedValue(
      response({
        success: true,
        data: { id: "campaign-august", status: "ACTIVE" },
      }),
    );
    const { onCampaignUpdated } = renderActions(draft);

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Publish",
      }),
    );

    await waitFor(() => {
      expect(onCampaignUpdated).toHaveBeenCalledWith({
        ...draft,
        status: "ACTIVE",
      });
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/admin/public-campaigns/campaign-august/publish",
      { method: "POST" },
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Campaign published. Its public link is ready to share.",
    );
  });

  it.each([
    ["a mismatched id", { id: "another-campaign", status: "ACTIVE" }],
    ["a non-live status", { id: "campaign-august", status: "DRAFT" }],
  ])("rejects %s in a successful publish envelope (catches malformed response acceptance)", async (_label, data) => {
    (global.fetch as jest.Mock).mockResolvedValue(
      response({ success: true, data }),
    );
    const { onCampaignUpdated } = renderActions(campaign());

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Publish",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't publish this campaign. Try again.",
    );
    expect(onCampaignUpdated).not.toHaveBeenCalled();
  });

  it("uses the friendly publish error without leaking status or server code (catches raw publish errors)", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      response(
        { success: false, error: "ALREADY_CLOSED confidential detail" },
        false,
        409,
      ),
    );
    renderActions(campaign());

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Publish",
      }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't publish this campaign. Try again.");
    expect(alert).not.toHaveTextContent("409");
    expect(alert).not.toHaveTextContent("ALREADY_CLOSED");
    expect(alert).not.toHaveTextContent("confidential detail");
  });

  it("copies the complete encoded public link without exposing it (catches incomplete or visible links)", async () => {
    renderActions(campaign({ status: "ACTIVE" }));

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "https://host.example/quiz/august%20lead%2Fcampaign",
      );
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Public link copied.");
    expect(screen.queryByDisplayValue(/host\.example/)).not.toBeInTheDocument();
    expect(screen.queryByText("august lead/campaign")).not.toBeInTheDocument();
  });

  it("reveals a labelled readonly complete URL only after clipboard failure (catches a dead-end copy action)", async () => {
    (navigator.clipboard.writeText as jest.Mock).mockRejectedValue(
      new Error("Clipboard permission denied"),
    );
    renderActions(campaign({ status: "ACTIVE" }));

    expect(screen.queryByLabelText("Public link")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

    const input = await screen.findByLabelText("Public link");
    expect(input).toHaveValue(
      "https://host.example/quiz/august%20lead%2Fcampaign",
    );
    expect(input).toHaveAttribute("readonly");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn't copy the public link. Copy it manually below.",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "Clipboard permission denied",
    );
  });

  it("exposes response disclosure state and toggles it (catches inaccessible disclosure state)", () => {
    const onToggleResponses = jest.fn();
    render(
      <PublicCampaignActions
        campaign={campaign({ status: "CLOSED" })}
        origin="https://host.example"
        onCampaignUpdated={jest.fn()}
        onToggleResponses={onToggleResponses}
        responsesExpanded
        onToggleReportDesign={jest.fn()}
        reportDesignExpanded={false}
      />,
    );

    const responses = screen.getByRole("button", { name: "Hide responses" });
    expect(responses).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(responses);
    expect(onToggleResponses).toHaveBeenCalledTimes(1);
  });
});
