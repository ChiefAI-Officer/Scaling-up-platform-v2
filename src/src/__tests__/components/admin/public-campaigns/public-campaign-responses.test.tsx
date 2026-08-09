import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { PublicCampaignResponses } from "@/components/admin/public-campaigns/PublicCampaignResponses";

const enrichedResponses = [
  {
    id: "response-1",
    takerName: "Jane Smith",
    takerEmail: "jane@example.com",
    referringCoachEmail: "legacy-coach@example.com",
    submittedAt: "2026-07-20T10:00:00.000Z",
    referringCoach: {
      name: "Ada Coach",
      email: "ada@scalingup.com",
    },
    template: {
      id: "template-1",
      name: "Scaling Up Assessment",
      alias: "scaling-up-assessment",
    },
    summary: {
      kind: "scored" as const,
      overallScore: 7.4,
      tierLabel: "On the way",
      domains: [
        { key: "people", label: "People", score: 7.1 },
        { key: "strategy", label: "Strategy", score: 7.2 },
        { key: "execution", label: "Execution", score: 7.3 },
        { key: "cash", label: "Cash", score: 8 },
      ],
    },
    reportHref: "/assessments/public-submissions/response-1/report",
  },
  {
    id: "response-2",
    takerName: "bob@example.com",
    takerEmail: "bob@example.com",
    referringCoachEmail: null,
    submittedAt: "2026-07-19T10:00:00.000Z",
    referringCoach: null,
    template: {
      id: "template-1",
      name: "Scaling Up Assessment",
      alias: "scaling-up-assessment",
    },
    summary: { kind: "degraded" as const, label: "Result unavailable" as const },
    reportHref: "/assessments/public-submissions/response-2/report",
  },
];

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

describe("PublicCampaignResponses", () => {
  it("waits for expansion and reuses successful responses after reopening (catches eager or duplicate requests)", async () => {
    global.fetch = jest.fn(async () =>
      response({ success: true, data: enrichedResponses }),
    ) as jest.MockedFunction<typeof fetch>;

    const { rerender } = render(
      <PublicCampaignResponses campaignId="campaign-1" expanded={false} />,
    );

    expect(global.fetch).not.toHaveBeenCalled();

    rerender(<PublicCampaignResponses campaignId="campaign-1" expanded />);
    expect(await screen.findByText("Jane Smith")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/admin/public-campaigns/campaign-1/submissions",
    );

    rerender(<PublicCampaignResponses campaignId="campaign-1" expanded={false} />);
    rerender(<PublicCampaignResponses campaignId="campaign-1" expanded />);

    expect(screen.getByText("Jane Smith")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("uses response language for loading and empty results (catches legacy submission wording)", async () => {
    let resolveRequest!: (value: Response) => void;
    global.fetch = jest.fn(
      () => new Promise<Response>((resolve) => (resolveRequest = resolve)),
    ) as jest.MockedFunction<typeof fetch>;

    const { container } = render(
      <PublicCampaignResponses campaignId="campaign-1" expanded />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Loading responses…");
    expect(container).not.toHaveTextContent(/submissions/i);

    resolveRequest(response({ success: true, data: [] }));

    expect(await screen.findByText("No responses yet.")).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/submissions/i);
  });

  it("uses the friendly response error without leaking the API payload (catches raw server errors)", async () => {
    global.fetch = jest.fn(async () =>
      response(
        { success: false, error: "SUBMISSIONS_FORBIDDEN confidential detail" },
        false,
        403,
      ),
    ) as jest.MockedFunction<typeof fetch>;

    const { container } = render(
      <PublicCampaignResponses campaignId="campaign-1" expanded />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't load responses. Try again.",
    );
    expect(container).not.toHaveTextContent("SUBMISSIONS_FORBIDDEN");
    expect(container).not.toHaveTextContent("403");
    expect(container).not.toHaveTextContent(/submissions/i);
  });

  it("shows enriched response ownership, results, dates, details, and server report links (catches lost management context)", async () => {
    global.fetch = jest.fn(async () =>
      response({ success: true, data: enrichedResponses }),
    ) as jest.MockedFunction<typeof fetch>;

    render(<PublicCampaignResponses campaignId="campaign-1" expanded />);

    const table = await screen.findByRole("table", { name: "Campaign responses" });
    expect(within(table).getByRole("columnheader", { name: "Respondent" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Referring coach" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Result" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Submitted" })).toBeInTheDocument();
    expect(within(table).getByText("Jane Smith")).toBeInTheDocument();
    expect(within(table).getByText("jane@example.com")).toBeInTheDocument();
    expect(within(table).getByText("Ada Coach")).toBeInTheDocument();
    expect(within(table).getByText("ada@scalingup.com")).toBeInTheDocument();
    expect(within(table).getByText("Scaling Up only")).toBeInTheDocument();
    expect(within(table).getByText("7.4")).toBeInTheDocument();
    expect(within(table).getByText("On the way")).toBeInTheDocument();
    expect(within(table).getByText("2026-07-20")).toBeInTheDocument();

    const detailButton = within(table).getByRole("button", { name: "Details" });
    expect(detailButton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(detailButton);
    expect(detailButton).toHaveAttribute("aria-expanded", "true");
    expect(within(table).getByText("People")).toBeInTheDocument();
    expect(within(table).getByText("7.1")).toBeInTheDocument();

    expect(within(table).getAllByRole("link", { name: "View report" })[0]).toHaveAttribute(
      "href",
      "/assessments/public-submissions/response-1/report",
    );
    expect(within(screen.getByLabelText("Four Decisions result")).getAllByTestId(
      "four-decisions-segment",
    )).toHaveLength(4);
  });
});
