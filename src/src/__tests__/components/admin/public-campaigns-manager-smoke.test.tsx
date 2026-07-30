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
  template: { id: "t1", name: "Scaling Up Quick", alias: "scaling-up-quick" },
  organization: { id: "o1", name: "Acme Corp" },
};

beforeEach(() => {
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : String(input);
    const json =
      url.endsWith("/api/assessment-campaigns")
        ? { success: true, data: [PUBLIC_CAMPAIGN] }
        : url.endsWith("/api/admin/assessment-templates")
          ? { success: true, data: [{ id: "t1", name: "Scaling Up Quick", alias: "scaling-up-quick", disabledAt: null }] }
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
      const json = url.endsWith("/api/assessment-campaigns")
        ? { success: true, data: [PUBLIC_CAMPAIGN] }
        : url.endsWith("/api/admin/assessment-templates")
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
        const json = url.endsWith("/api/assessment-campaigns")
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
