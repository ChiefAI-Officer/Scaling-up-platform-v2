import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

  it("rejects a valid legacy flag-off row without rendering an undefined response count", async () => {
    mockList({
      success: true,
      data: [
        {
          id: "campaign-new",
          name: "August lead campaign",
          alias: "august-lead-campaign-secret-alias",
          status: "DRAFT",
          accessMode: "PUBLIC",
          openAt: "2020-08-01T12:00:00.000Z",
          closeAt: null,
          reportStyle: "CLASSIC",
          reportStyleSource: "TEMPLATE_DEFAULT",
          reportStyleLockedAt: null,
          reportStylesAvailable: true,
          template: {
            id: "template-1",
            name: "Scaling Up Assessment",
            alias: "scaling-up-assessment",
          },
          organization: null,
        },
      ],
    });

    render(<PublicCampaignList />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't load campaigns. Try again.",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("undefined responses")).not.toBeInTheDocument();
  });

  it.each([
    ["id", { ...campaigns[0], id: undefined }],
    ["name", { ...campaigns[0], name: null }],
    ["alias", { ...campaigns[0], alias: 42 }],
    ["status", { ...campaigns[0], status: "PAUSED" }],
    ["open date", { ...campaigns[0], openAt: "not-a-date" }],
    ["close date", { ...campaigns[0], closeAt: "not-a-date" }],
    ["negative response count", { ...campaigns[0], responseCount: -1 }],
    ["non-finite response count", { ...campaigns[0], responseCount: Infinity }],
    ["report design key", { ...campaigns[0], reportStyle: "NEON" }],
    ["report design source", { ...campaigns[0], reportStyleSource: "SERVER_DEFAULT" }],
    ["report design lock date", { ...campaigns[0], reportStyleLockedAt: "not-a-date" }],
    ["report design availability", { ...campaigns[0], reportStylesAvailable: "yes" }],
    [
      "template",
      {
        ...campaigns[0],
        template: { id: "template-1", name: "Scaling Up Assessment" },
      },
    ],
    [
      "preview report type",
      {
        ...campaigns[0],
        reportStylePreviewCapabilities: {
          reportType: "unknown",
          hasMetrics: true,
          hasNarrativeResponses: false,
        },
      },
    ],
    [
      "preview metric capability",
      {
        ...campaigns[0],
        reportStylePreviewCapabilities: {
          reportType: "scored",
          hasMetrics: "yes",
          hasNarrativeResponses: false,
        },
      },
    ],
    [
      "preview narrative capability",
      {
        ...campaigns[0],
        reportStylePreviewCapabilities: {
          reportType: "scored",
          hasMetrics: true,
          hasNarrativeResponses: null,
        },
      },
    ],
  ])("rejects a row with an invalid %s instead of rendering partial data", async (_field, row) => {
    mockList({ success: true, data: [row] });

    render(<PublicCampaignList />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't load campaigns. Try again.",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
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
    expect(within(table).getByText("Draft")).toHaveClass(
      "bg-warning/10",
      "text-warning",
    );
    expect(within(table).getByText("Live")).toHaveClass(
      "bg-success/10",
      "text-success",
    );
    expect(within(table).getByText("Opens when published · No end date")).toBeInTheDocument();
    expect(within(table).getByText("Open until Sep 30, 2030")).toBeInTheDocument();
    expect(within(table).getByText("24 responses")).toBeInTheDocument();
    expect(within(table).getByText("Assessment unavailable")).toBeInTheDocument();

    const createdRow = within(table).getByText("August lead campaign").closest("tr");
    expect(createdRow).toHaveAttribute("data-created", "true");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Campaign created as a draft.",
    );
    expect(screen.getByRole("status")).toHaveClass(
      "border-success/20",
      "bg-success/10",
      "text-success",
    );
    await waitFor(() => expect(screen.getByRole("status")).toHaveFocus());

    const highlightedRows = within(table)
      .getAllByRole("row")
      .filter((row) => row.getAttribute("data-created") === "true");
    expect(highlightedRows).toHaveLength(1);

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
    expect(container.innerHTML).not.toMatch(
      /(?:^|[\s"])(?:emerald|amber|slate)-/,
    );
  });

  it("does not announce success when the created id is absent from the loaded rows (catches stale query feedback)", async () => {
    mockList({ success: true, data: campaigns });

    render(<PublicCampaignList createdCampaignId="campaign-missing" />);

    const table = await screen.findByRole("table");
    expect(screen.queryByText("Campaign created as a draft.")).not.toBeInTheDocument();
    expect(
      within(table)
        .getAllByRole("row")
        .some((row) => row.hasAttribute("data-created")),
    ).toBe(false);
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

  it("merges overlapping publish and authoritative report updates into the latest row (catches stale completion rollback)", async () => {
    let resolvePublish!: (value: Response) => void;
    let resolveReportDesign!: (value: Response) => void;

    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/admin/public-campaigns" && !init?.method) {
        return Promise.resolve(
          response({ success: true, data: [campaigns[0]] }),
        );
      }
      if (url.endsWith("/publish")) {
        return new Promise<Response>((resolve) => {
          resolvePublish = resolve;
        });
      }
      if (url.endsWith("/report-style")) {
        return new Promise<Response>((resolve) => {
          resolveReportDesign = resolve;
        });
      }
      return Promise.resolve(
        response({ success: false, error: "UNEXPECTED_ENDPOINT" }, false, 500),
      );
    }) as jest.MockedFunction<typeof fetch>;

    render(<PublicCampaignList />);
    await screen.findByText("August lead campaign");

    fireEvent.click(screen.getByText("More"));
    fireEvent.click(screen.getByRole("button", { name: "Report design" }));
    fireEvent.click(screen.getByRole("radio", { name: /executive boardroom/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save report design" }));

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Publish",
      }),
    );

    await waitFor(() => {
      expect(resolvePublish).toBeDefined();
      expect(resolveReportDesign).toBeDefined();
    });

    await act(async () => {
      resolveReportDesign(
        response(
          {
            error: "REPORT_STYLE_LOCKED",
            message: "Refresh to see the final style.",
            data: {
              id: "campaign-new",
              reportStyle: "MODERN_DASHBOARD",
              reportStyleSource: "CAMPAIGN_OVERRIDE",
              reportStyleLockedAt: "2026-08-10T01:15:00.000Z",
            },
          },
          false,
          409,
        ),
      );
    });

    await act(async () => {
      resolvePublish(
        response({
          success: true,
          data: { id: "campaign-new", status: "ACTIVE" },
        }),
      );
    });

    expect(await screen.findByText("Live")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /modern dashboard/i })).toBeChecked();
    screen.getAllByRole("radio").forEach((radio) => expect(radio).toBeDisabled());
    expect(screen.getByText("Customized for this campaign")).toBeInTheDocument();
  });

  it("keeps visited response panels mounted, makes responses exclusive, and manages report design independently", async () => {
    const disclosureCampaigns: PublicCampaignViewModel[] = [
      {
        ...campaigns[0],
        name: "First live campaign",
        status: "ACTIVE",
      },
      {
        ...campaigns[1],
        name: "Second live campaign",
        reportStylesAvailable: true,
        reportStyleLockedAt: null,
      },
    ];
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/admin/public-campaigns") {
        return response({ success: true, data: disclosureCampaigns });
      }
      if (url.endsWith("/submissions")) {
        return response({ success: true, data: [] });
      }
      return response({ success: false }, false, 500);
    }) as jest.MockedFunction<typeof fetch>;

    render(<PublicCampaignList />);

    const firstRow = (await screen.findByText("First live campaign")).closest("tr");
    const secondRow = screen.getByText("Second live campaign").closest("tr");
    expect(firstRow).not.toBeNull();
    expect(secondRow).not.toBeNull();

    fireEvent.click(
      within(firstRow!).getByRole("button", { name: "View responses" }),
    );
    const firstResponseRow = (await screen.findByText("No responses yet.")).closest(
      "tr",
    );
    expect(firstResponseRow).not.toBeNull();
    expect(firstResponseRow).not.toHaveAttribute("hidden");
    expect(firstResponseRow!.querySelector("td")).toHaveAttribute("colspan", "6");

    fireEvent.click(within(firstRow!).getByText("More"));
    fireEvent.click(
      within(firstRow!).getByRole("button", { name: "Report design" }),
    );
    expect(
      await screen.findByRole("region", { name: "First live campaign report design" }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(firstRow!).getByRole("button", { name: "Hide responses" }),
    );
    expect(firstResponseRow).toHaveAttribute("hidden");
    fireEvent.click(
      within(firstRow!).getByRole("button", { name: "View responses" }),
    );
    expect(firstResponseRow).not.toHaveAttribute("hidden");
    expect(
      (global.fetch as jest.Mock).mock.calls.filter(([input]) =>
        String(input).endsWith("/campaign-new/submissions"),
      ),
    ).toHaveLength(1);

    fireEvent.click(
      within(secondRow!).getByRole("button", { name: "View responses" }),
    );
    await waitFor(() => {
      expect(
        (global.fetch as jest.Mock).mock.calls.filter(([input]) =>
          String(input).endsWith("/campaign-live/submissions"),
        ),
      ).toHaveLength(1);
    });
    await waitFor(() =>
      expect(screen.getByText("No responses yet.").closest("tr")).not.toBe(
        firstResponseRow,
      ),
    );
    const secondResponseRow = screen.getByText("No responses yet.").closest("tr");
    expect(firstResponseRow).toBeInTheDocument();
    expect(firstResponseRow).toHaveAttribute("hidden");
    expect(firstResponseRow!.querySelector("td")).toHaveAttribute("colspan", "6");
    expect(secondResponseRow).not.toBeNull();
    expect(secondResponseRow).not.toHaveAttribute("hidden");
    expect(
      screen.getByRole("region", { name: "First live campaign report design" }),
    ).toBeInTheDocument();

    fireEvent.click(within(secondRow!).getByText("More"));
    fireEvent.click(
      within(secondRow!).getByRole("button", { name: "Report design" }),
    );
    expect(
      screen.queryByRole("region", { name: "First live campaign report design" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Second live campaign report design" }),
    ).toBeInTheDocument();
    expect(secondResponseRow).not.toHaveAttribute("hidden");
  });
});
