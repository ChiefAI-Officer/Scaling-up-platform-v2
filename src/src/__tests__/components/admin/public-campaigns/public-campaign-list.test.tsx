import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { PublicCampaignList } from "@/components/admin/public-campaigns/PublicCampaignList";
import type { PublicCampaignViewModel } from "@/lib/assessments/public-campaign-ui";

const campaigns: PublicCampaignViewModel[] = [
  {
    id: "campaign-new",
    name: "August lead campaign",
    alias: "august-lead-campaign-secret-alias",
    status: "DRAFT",
    openAt: "2020-08-01T12:00:00.000Z",
    closeAt: null,
    responseCount: 0,
    reportStyle: "CLASSIC",
    reportStyleSource: "TEMPLATE_DEFAULT",
    reportStyleLockedAt: null,
    reportStylesAvailable: true,
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
  },
  {
    id: "campaign-live",
    name: "Quarterly habits check",
    alias: "quarterly-habits-check",
    status: "ACTIVE",
    openAt: "2020-08-01T12:00:00.000Z",
    closeAt: "2030-09-30T12:00:00.000Z",
    responseCount: 24,
    reportStyle: "EXECUTIVE_BOARDROOM",
    reportStyleSource: "CAMPAIGN_OVERRIDE",
    reportStyleLockedAt: "2026-08-09T12:00:00.000Z",
    reportStylesAvailable: false,
    template: {
      id: "template-2",
      name: "Rockefeller Habits Checklist",
      alias: "rockefeller-habits",
    },
  },
  {
    id: "campaign-closed",
    name: "Annual planning readiness",
    alias: "annual-planning-readiness",
    status: "CLOSED",
    openAt: "2020-01-01T12:00:00.000Z",
    closeAt: "2026-07-31T12:00:00.000Z",
    responseCount: 86,
    reportStyle: "MODERN_DASHBOARD",
    reportStyleSource: "TEMPLATE_DEFAULT",
    reportStyleLockedAt: null,
    reportStylesAvailable: false,
    template: null,
  },
];

function response(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

function mockList(body: unknown, ok = true, status = 200) {
  global.fetch = jest.fn(async () => response(body, ok, status)) as jest.MockedFunction<
    typeof fetch
  >;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("PublicCampaignList", () => {
  it("shows loading while the campaign request is pending (catches a missing progress state)", () => {
    global.fetch = jest.fn(() => new Promise<Response>(() => {})) as jest.MockedFunction<
      typeof fetch
    >;

    render(<PublicCampaignList />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading campaigns…");
  });

  it("shows a plain empty state after an empty response (catches an empty table shell)", async () => {
    mockList({ success: true, data: [] });

    render(<PublicCampaignList />);

    expect(await screen.findByText("No public campaigns yet.")).toBeInTheDocument();
  });

  it("uses the friendly list error without leaking server details (catches raw API errors)", async () => {
    mockList(
      { success: false, error: "422 OPEN_END internal validation failure" },
      false,
      422,
    );

    render(<PublicCampaignList />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't load campaigns. Try again.");
    expect(alert).not.toHaveTextContent("422");
    expect(alert).not.toHaveTextContent("OPEN_END");
    expect(alert).not.toHaveTextContent("internal validation failure");
  });

  it("renders the approved list language and natural campaign details (catches technical-copy regressions)", async () => {
    mockList({ success: true, data: campaigns });

    const { container } = render(
      <PublicCampaignList createdCampaignId="campaign-new" />,
    );

    const table = await screen.findByRole("table");
    for (const column of [
      "Campaign",
      "Assessment",
      "Status",
      "Availability",
      "Responses",
      "Actions",
    ]) {
      expect(within(table).getByRole("columnheader", { name: column })).toBeInTheDocument();
    }
    expect(within(table).getByText("August lead campaign")).toBeInTheDocument();
    expect(within(table).getByText("Scaling Up Assessment")).toBeInTheDocument();
    expect(within(table).getByText("Draft")).toBeInTheDocument();
    expect(within(table).getByText("Live")).toBeInTheDocument();
    expect(within(table).getByText("Closed", { selector: "span" })).toBeInTheDocument();
    expect(within(table).getByText("Opens when published · No end date")).toBeInTheDocument();
    expect(within(table).getByText("Open until Sep 30, 2030")).toBeInTheDocument();
    expect(within(table).getByText("24 responses")).toBeInTheDocument();
    expect(within(table).getByText("Assessment unavailable")).toBeInTheDocument();

    const createdRow = within(table).getByText("August lead campaign").closest("tr");
    expect(createdRow).toHaveAttribute("data-created", "true");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Campaign created as a draft.",
    );

    const forbidden = [
      'accessMode="PUBLIC"',
      "organizationId",
      "createdByCoachId",
      "NOT NULL FK",
      "422",
      "OPEN_END",
      "ENDS_AFTER",
      "DRAFT",
      "ACTIVE",
      "CLOSED",
      "august-lead-campaign-secret-alias",
    ];
    for (const text of forbidden) {
      expect(container).not.toHaveTextContent(text);
    }
  });

  it("replaces a published row locally without refetching the list (catches field loss and unnecessary reloads)", async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/admin/public-campaigns" && !init?.method) {
        return response({ success: true, data: [campaigns[0]] });
      }
      return response({
        success: true,
        data: { id: "campaign-new", status: "ACTIVE" },
      });
    }) as jest.MockedFunction<typeof fetch>;

    render(<PublicCampaignList />);

    expect(await screen.findByText("August lead campaign")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Publish" }));

    expect(await screen.findByRole("button", { name: "Copy link" })).toBeInTheDocument();
    expect(screen.getByText("Scaling Up Assessment")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledWith("/api/admin/public-campaigns");
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/admin/public-campaigns/campaign-new/publish",
      { method: "POST" },
    );
  });
});
