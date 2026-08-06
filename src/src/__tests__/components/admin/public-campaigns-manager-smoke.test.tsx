/**
 * Wave Z (Z-1) smoke-verify — the Public Campaigns admin page has been ORPHANED
 * (no nav entry) since Task 8; before the sidebar rewire surfaces it we confirm
 * `PublicCampaignsManager` renders its list + create form without crashing,
 * against the three GET endpoints it loads in-mount. No prod contact (fetch mocked).
 */

import React from "react";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";
import { PublicCampaignsManager } from "@/components/admin/PublicCampaignsManager";

const PUBLIC_CAMPAIGN = {
  id: "pc-1",
  name: "Quick Scaling Up Check",
  alias: "scaling-up-quick",
  status: "ACTIVE",
  accessMode: "PUBLIC",
  openAt: "2026-06-01T00:00:00.000Z",
  closeAt: null,
  reportStyle: "EXECUTIVE_BOARDROOM",
  reportStyleSource: "CAMPAIGN_OVERRIDE",
  reportStyleLockedAt: null,
  reportStylesAvailable: true,
  reportStylePreviewCapabilities: {
    reportType: "scored",
    hasMetrics: false,
    hasNarrativeResponses: true,
  },
  template: { id: "t1", name: "Founder Prompts", alias: "founder-prompts-custom" },
  organization: { id: "o1", name: "Acme Corp" },
};

beforeEach(() => {
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : String(input);
    const json =
      url.endsWith("/api/admin/public-campaigns")
        ? { success: true, data: [PUBLIC_CAMPAIGN] }
        : url.endsWith("/api/assessment-templates")
          ? {
              success: true,
              data: [{
                id: "t1",
                name: "Founder Prompts",
                alias: "founder-prompts-custom",
                disabledAt: null,
                defaultReportStyle: "MODERN_DASHBOARD",
                reportStylesEnabled: true,
                reportStylePreviewCapabilities: {
                  reportType: "scored",
                  hasMetrics: false,
                  hasNarrativeResponses: true,
                },
              }],
            }
          : url.endsWith("/api/organizations")
            ? { success: true, data: [{ id: "o1", name: "Acme Corp" }] }
            : { success: true, data: [] };
    return { ok: true, status: 200, json: async () => json } as unknown as Response;
  }) as unknown as typeof fetch;
});

afterEach(() => jest.restoreAllMocks());

describe("PublicCampaignsManager — orphaned-page render smoke (Z-1)", () => {
  it("renders the list and the create form without crashing", async () => {
    render(<PublicCampaignsManager />);
    // Create form is always present.
    expect(
      await screen.findByText("Create New PUBLIC Campaign"),
    ).toBeInTheDocument();
    // The loaded PUBLIC campaign row shows once the in-mount fetch resolves.
    await waitFor(() =>
      expect(screen.getByText("Quick Scaling Up Check")).toBeInTheDocument(),
    );
    expect(screen.getByText("Existing PUBLIC Campaigns")).toBeInTheDocument();
  });

  it("shows template inheritance during creation and submits an explicit campaign choice", async () => {
    render(<PublicCampaignsManager />);

    const createSection = await screen.findByRole("region", {
      name: "Create public campaign",
    });
    fireEvent.change(within(createSection).getByLabelText(/template/i), {
      target: { value: "t1" },
    });
    expect(
      within(createSection).getByText(
        "Report appearance: Modern Dashboard · Template default",
      ),
    ).toBeInTheDocument();
    expect(
      within(createSection).getByRole("img", {
        name: "Modern Dashboard selected thumbnail",
      }),
    ).toHaveAttribute(
      "src",
      "/report-style-previews/sparse-custom/modern-dashboard/cover.webp",
    );
    expect(
      within(createSection).queryByRole("img", {
        name: "Modern Dashboard Cover preview",
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(createSection).getByText("Preview selected appearance"),
    );
    expect(
      within(createSection).getByRole("img", {
        name: "Modern Dashboard Cover preview",
      }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(createSection).getByRole("radio", {
        name: /Executive Boardroom/i,
      }),
    );
    expect(
      within(createSection).getByText(
        "Report appearance: Executive Boardroom · Campaign choice",
      ),
    ).toBeInTheDocument();

    fireEvent.change(within(createSection).getByLabelText(/organization/i), {
      target: { value: "o1" },
    });
    fireEvent.change(within(createSection).getByLabelText(/campaign name/i), {
      target: { value: "Public report test" },
    });
    fireEvent.change(within(createSection).getByLabelText(/open at/i), {
      target: { value: "2026-08-06T09:00" },
    });
    fireEvent.click(
      within(createSection).getByRole("button", {
        name: "Create PUBLIC Campaign",
      }),
    );

    await waitFor(() => {
      const createCall = (global.fetch as jest.Mock).mock.calls.find(
        ([url, init]) =>
          String(url).endsWith("/api/admin/public-campaigns") &&
          init?.method === "POST",
      );
      expect(JSON.parse(createCall?.[1]?.body as string)).toEqual(
        expect.objectContaining({ reportStyle: "EXECUTIVE_BOARDROOM" }),
      );
    });
  });

  it("lets privileged users preview and save an unlocked public campaign appearance", async () => {
    render(<PublicCampaignsManager />);
    await screen.findByText("Quick Scaling Up Check");

    fireEvent.click(
      screen.getByRole("button", { name: "Manage report appearance" }),
    );
    const editor = screen.getByRole("region", {
      name: "Quick Scaling Up Check report appearance",
    });
    expect(
      within(editor).getByRole("img", {
        name: "Executive Boardroom Cover preview",
      }),
    ).toHaveAttribute(
      "src",
      "/report-style-previews/sparse-custom/executive-boardroom/cover.webp",
    );
    fireEvent.click(
      within(editor).getByRole("radio", { name: /Modern Dashboard/i }),
    );
    fireEvent.click(
      within(editor).getByRole("button", { name: "Save report appearance" }),
    );

    await waitFor(() => {
      const updateCall = (global.fetch as jest.Mock).mock.calls.find(
        ([url, init]) =>
          String(url).endsWith("/pc-1/report-style") && init?.method === "PATCH",
      );
      expect(JSON.parse(updateCall?.[1]?.body as string)).toEqual({
        reportStyle: "MODERN_DASHBOARD",
      });
    });
  });

  it("removes every existing-campaign appearance affordance when rollout availability is off while retaining server data", async () => {
    const lockedCampaign = {
      ...PUBLIC_CAMPAIGN,
      reportStyleLockedAt: "2026-08-06T04:00:00.000Z",
      // Kill/rollback renders Classic without erasing the stored provenance or
      // hiding the durable lock metadata.
      reportStylesAvailable: false,
    };
    (global.fetch as jest.Mock).mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : String(input);
        const json = url.endsWith("/api/admin/public-campaigns")
          ? { success: true, data: [lockedCampaign] }
          : { success: true, data: [] };
        return {
          ok: true,
          status: 200,
          json: async () => json,
        } as unknown as Response;
      },
    );

    render(<PublicCampaignsManager />);
    await screen.findByText("Quick Scaling Up Check");
    expect(
      screen.queryByRole("button", { name: /report appearance/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", {
        name: "Quick Scaling Up Check report appearance",
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Executive Boardroom/i })).not.toBeInTheDocument();
    expect(lockedCampaign.reportStyle).toBe("EXECUTIVE_BOARDROOM");
    expect(lockedCampaign.reportStyleSource).toBe("CAMPAIGN_OVERRIDE");
    expect(lockedCampaign.reportStyleLockedAt).toBe("2026-08-06T04:00:00.000Z");
  });

  it("reconciles a 409 immediately from authoritative response data without reloading the list", async () => {
    let campaignLoads = 0;
    (global.fetch as jest.Mock).mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : String(input);
        if (url.endsWith("/pc-1/report-style") && init?.method === "PATCH") {
          return {
            ok: false,
            status: 409,
            json: async () => ({
              error: "REPORT_STYLE_LOCKED",
              message:
                "Report appearance was locked when the first response completed. Refresh to see the final style.",
              data: {
                id: "pc-1",
                reportStyle: "CLASSIC",
                reportStyleSource: "TEMPLATE_DEFAULT",
                reportStyleLockedAt: "2026-08-06T05:00:00.000Z",
              },
            }),
          } as unknown as Response;
        }
        if (url.endsWith("/api/admin/public-campaigns")) {
          campaignLoads += 1;
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true, data: [PUBLIC_CAMPAIGN] }),
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: [] }),
        } as unknown as Response;
      },
    );

    render(<PublicCampaignsManager />);
    await screen.findByText("Quick Scaling Up Check");
    fireEvent.click(
      screen.getByRole("button", { name: "Manage report appearance" }),
    );
    const panel = screen.getByRole("region", {
      name: "Quick Scaling Up Check report appearance",
    });
    fireEvent.click(
      within(panel).getByRole("radio", { name: /Modern Dashboard/i }),
    );
    fireEvent.click(
      within(panel).getByRole("button", { name: "Save report appearance" }),
    );

    await waitFor(() => {
      const reconciledPanel = screen.getByRole("region", {
        name: "Quick Scaling Up Check report appearance",
      });
      expect(
        within(reconciledPanel).getByRole("radio", { name: /Classic/i }),
      ).toBeChecked();
      expect(
        within(reconciledPanel).getByRole("radio", { name: /Classic/i }),
      ).toBeDisabled();
    });
    const reconciledPanel = screen.getByRole("region", {
      name: "Quick Scaling Up Check report appearance",
    });
    expect(
      within(reconciledPanel).getByText("Source: Template default"),
    ).toBeInTheDocument();
    expect(within(reconciledPanel).getByRole("time")).toHaveAttribute(
      "datetime",
      "2026-08-06T05:00:00.000Z",
    );
    expect(campaignLoads).toBe(1);
  });
});

// #83 — surface public-quiz submissions (taker + referring coach) per campaign.
describe("PublicCampaignsManager — public-quiz submissions (#83)", () => {
  const SUBMISSIONS = [
    {
      id: "s1",
      takerName: "Jane Smith",
      takerEmail: "jane@x.com",
      referringCoachEmail: "legacy@x.com",
      submittedAt: "2026-07-20T10:00:00.000Z",
      referringCoach: {
        name: "Ada Coach",
        email: "ada@scalingup.com",
      },
      template: {
        id: "t1",
        name: "Rockefeller Habits",
        alias: "RockHabits",
      },
      summary: {
        kind: "scored",
        overallScore: 7.4,
        tierLabel: "On the way",
        domains: [
          { key: "people", label: "People", score: 7.1 },
          { key: "strategy", label: "Strategy", score: 7.2 },
          { key: "execution", label: "Execution", score: 7.3 },
          { key: "cash", label: "Cash", score: 8 },
        ],
      },
      reportHref: "/assessments/public-submissions/s1/report",
    },
    {
      id: "s2",
      takerName: "bob@x.com",
      takerEmail: "bob@x.com",
      referringCoachEmail: null,
      submittedAt: "2026-07-19T10:00:00.000Z",
      referringCoach: null,
      template: {
        id: "t1",
        name: "Rockefeller Habits",
        alias: "RockHabits",
      },
      summary: { kind: "degraded", label: "Result unavailable" },
      reportHref: "/assessments/public-submissions/s2/report",
    },
  ];

  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);
      const json = url.endsWith("/api/admin/public-campaigns")
        ? { success: true, data: [PUBLIC_CAMPAIGN] }
        : url.endsWith("/api/assessment-templates")
          ? { success: true, data: [] }
          : url.endsWith("/api/organizations")
            ? { success: true, data: [] }
            : url.endsWith("/api/admin/public-campaigns/pc-1/submissions")
              ? { success: true, data: SUBMISSIONS }
              : { success: true, data: [] };
      return { ok: true, status: 200, json: async () => json } as unknown as Response;
    }) as unknown as typeof fetch;
  });

  it("renders canonical Coach ownership, frozen summaries, details, and report links", async () => {
    render(<PublicCampaignsManager />);
    await screen.findByText("Quick Scaling Up Check");

    fireEvent.click(screen.getByRole("button", { name: /view submissions/i }));

    await waitFor(() =>
      expect(screen.getByText("Jane Smith")).toBeInTheDocument(),
    );
    expect(screen.getByText("Ada Coach")).toBeInTheDocument();
    expect(screen.getByText("ada@scalingup.com")).toBeInTheDocument();
    expect(screen.getByText("Scaling Up only")).toBeInTheDocument();
    expect(screen.getByText("bob@x.com")).toBeInTheDocument();
    expect(screen.getByText("7.4")).toBeInTheDocument();
    expect(screen.getByText("On the way")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Referring coach" }),
    ).toBeInTheDocument();
    const decisionStrip = screen.getByLabelText("Four Decisions result");
    const segments = within(decisionStrip).getAllByTestId(
      "four-decisions-segment",
    );
    expect(segments.map((segment) => segment.style.backgroundColor)).toEqual([
      "rgb(247, 166, 0)",
      "rgb(0, 139, 210)",
      "rgb(148, 107, 54)",
      "rgb(149, 193, 31)",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.getByText("People")).toBeInTheDocument();
    expect(screen.getByText("7.1")).toBeInTheDocument();

    expect(screen.getAllByRole("link", { name: "View report" })[0]).toHaveAttribute(
      "href",
      "/assessments/public-submissions/s1/report",
    );
  });

  it("keeps the legacy three-column expander when enrichment is absent", async () => {
    const legacyRows = [
      {
        id: "s1",
        takerName: "Jane Smith",
        takerEmail: "jane@x.com",
        referringCoachEmail: "coach@x.com",
        submittedAt: "2026-07-20T10:00:00.000Z",
      },
    ];
    (global.fetch as jest.Mock).mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : String(input);
        const json = url.endsWith("/api/admin/public-campaigns")
          ? { success: true, data: [PUBLIC_CAMPAIGN] }
          : url.endsWith("/api/admin/public-campaigns/pc-1/submissions")
            ? { success: true, data: legacyRows }
            : { success: true, data: [] };
        return {
          ok: true,
          status: 200,
          json: async () => json,
        } as unknown as Response;
      },
    );

    render(<PublicCampaignsManager />);
    await screen.findByText("Quick Scaling Up Check");
    fireEvent.click(screen.getByRole("button", { name: /view submissions/i }));

    await screen.findByText("coach@x.com");
    expect(
      screen.getByRole("columnheader", { name: "Referred by coach" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Result" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View report" })).not.toBeInTheDocument();
  });
});
