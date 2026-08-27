import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { SummaryReportsPanel } from "@/components/assessments/SummaryReportsPanel";

const CAMPAIGN_ID = "campaign-123";
const BASE_URL = `/api/assessment-campaigns/${CAMPAIGN_ID}/summary-reports`;
const IMPLEMENTED_TYPES = [
  {
    type: "SCALING_CEO_FULL" as const,
    label: "Scaling CEO Full",
    description: "A full executive summary.",
  },
];

const REPORTS = [
  {
    id: "report-older",
    campaignId: CAMPAIGN_ID,
    reportType: "SCALING_CEO_FULL",
    name: "Northstar Growth Campaign",
    createdByEmailSnapshot: "coach@example.com",
    createdAt: "2026-08-21T12:00:00.000Z",
  },
  {
    id: "report-newer",
    campaignId: CAMPAIGN_ID,
    reportType: "SCALING_CEO_FULL",
    name: "Northstar Growth Campaign",
    createdByEmailSnapshot: "admin@example.com",
    createdAt: "2026-08-22T12:00:00.000Z",
  },
];

const CANDIDATE = {
  submissionId: "submission-ceo-123456",
  campaignId: CAMPAIGN_ID,
  campaignName: "Northstar Growth Campaign",
  respondentId: "respondent-ceo",
  respondentName: "Avery CEO",
  jobTitle: "Chief Executive Officer",
  organizationId: "org-1",
  organizationName: "Northstar Growth",
  templateId: "template-1",
  templateAlias: "scaling-up-full",
  versionId: "version-7",
  versionNumber: 7,
  language: "en",
  submittedAt: "2026-08-20T12:00:00.000Z",
  eligible: true,
  disabledReason: null,
};

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function renderPanel() {
  return render(
    <SummaryReportsPanel
      campaignId={CAMPAIGN_ID}
      campaignName="Northstar Growth Campaign"
      assessmentName="Scaling Up Assessment"
      implementedTypes={IMPLEMENTED_TYPES}
    />,
  );
}

describe("SummaryReportsPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it("shows a loading state while it retrieves this campaign's reports", async () => {
    (global.fetch as jest.Mock).mockReturnValue(new Promise(() => undefined));

    renderPanel();

    expect(screen.getByText("Loading summary reports…")).toBeInTheDocument();
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        BASE_URL,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
  });

  it("shows an empty campaign library and opens its own wizard", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(response({ reports: [] }));

    renderPanel();

    expect(
      await screen.findByText("No summary reports yet."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          element.textContent ===
            "Northstar Growth Campaign · Scaling Up Assessment",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Wizard" }));
    expect(
      screen.getByRole("dialog", { name: "Create summary report" }),
    ).toBeInTheDocument();
  });

  it("offers a retry after an unavailable list response", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(response({ error: "unavailable" }, 503))
      .mockResolvedValueOnce(response({ reports: [] }));

    renderPanel();

    expect(
      await screen.findByText("Summary reports are temporarily unavailable."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByText("No summary reports yet."),
    ).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("conceals itself when the capability endpoint is unavailable", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      response({ error: "Not found" }, 404),
    );

    const { container } = renderPanel();

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("lists serialized reports newest first with type, date, and creator metadata", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      response({ reports: REPORTS }),
    );

    renderPanel();

    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("admin@example.com");
    expect(rows[0]).toHaveTextContent("Scaling CEO Full");
    expect(rows[0]).toHaveTextContent("Aug 22, 2026");
    expect(rows[1]).toHaveTextContent("coach@example.com");
  });

  it("rejects a malformed report type instead of rendering an arbitrary registry label", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      response({ reports: [{ ...REPORTS[0], reportType: "NOT_A_REPORT" }] }),
    );

    renderPanel();

    expect(
      await screen.findByText("Summary reports are temporarily unavailable."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  it("creates through its real wizard, closes it, and refreshes the report list", async () => {
    let listCalls = 0;
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/candidates"))
        return Promise.resolve(response({ candidates: [CANDIDATE] }));
      if (url === BASE_URL) {
        listCalls += 1;
        if (listCalls === 1) return Promise.resolve(response({ reports: [] }));
        if (listCalls === 2)
          return Promise.resolve(response({ id: "report-new" }, 201));
        return Promise.resolve(
          response({ reports: [{ ...REPORTS[0], id: "report-new" }] }),
        );
      }
      return Promise.reject(new Error("Unexpected request"));
    });

    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Open Wizard" }));
    fireEvent.click(screen.getByRole("button", { name: "Scaling CEO Full" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Avery CEO");
    fireEvent.click(screen.getByRole("button", { name: /Select Avery CEO/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Add selected to CEO/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Create report" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Create summary report" }),
      ).toBeNull(),
    );
    expect(await screen.findByRole("listitem")).toHaveTextContent(
      "Northstar Growth Campaign",
    );
  });

  it("does not create an artifact iframe until the user chooses View", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      response({ reports: [REPORTS[0]] }),
    );

    renderPanel();

    expect(await screen.findByRole("listitem")).toHaveTextContent(
      "coach@example.com",
    );
    expect(
      screen.queryByTitle("Northstar Growth Campaign PDF preview"),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "View Northstar Growth Campaign" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", {
        name: "Northstar Growth Campaign",
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByTitle("Northstar Growth Campaign PDF preview"),
    ).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "View" }));
    expect(
      within(dialog).getByTitle("Northstar Growth Campaign PDF preview"),
    ).toHaveAttribute(
      "src",
      `${BASE_URL}/report-older/artifact?disposition=inline`,
    );
  });

  it("uses explicit plain anchors for new-tab viewing and download", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      response({ reports: [REPORTS[0]] }),
    );

    renderPanel();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "View Northstar Growth Campaign",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    const newTab = within(dialog).getByRole("link", {
      name: "View in new tab",
    });
    const download = within(dialog).getByRole("link", { name: "Download" });

    expect(newTab.tagName).toBe("A");
    expect(newTab).toHaveAttribute("target", "_blank");
    expect(newTab).toHaveAttribute("rel", "noopener noreferrer");
    expect(newTab).toHaveAttribute(
      "href",
      `${BASE_URL}/report-older/artifact?disposition=inline`,
    );
    expect(download.tagName).toBe("A");
    expect(download).toHaveAttribute("download");
    expect(download).toHaveAttribute(
      "href",
      `${BASE_URL}/report-older/artifact?disposition=attachment`,
    );
  });

  it("returns focus to the selected report when the modal closes", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      response({ reports: [REPORTS[0]] }),
    );

    renderPanel();

    const trigger = await screen.findByRole("button", {
      name: "View Northstar Growth Campaign",
    });
    fireEvent.click(trigger);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it("clears a previous campaign's report rows immediately when the campaign changes", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(response({ reports: [REPORTS[0]] }))
      .mockReturnValueOnce(new Promise(() => undefined));

    const { rerender } = renderPanel();
    expect(await screen.findByRole("listitem")).toHaveTextContent(
      "Scaling CEO Full",
    );

    rerender(
      <SummaryReportsPanel
        campaignId="campaign-456"
        campaignName="New Campaign"
        assessmentName="Scaling Up Assessment"
        implementedTypes={IMPLEMENTED_TYPES}
      />,
    );

    expect(screen.queryByRole("listitem")).toBeNull();
    expect(screen.getByText("Loading summary reports…")).toBeInTheDocument();

    await act(async () => {
      await Promise.resolve();
    });
  });

  it("ignores an old campaign response whose JSON body resolves after the new campaign is ready", async () => {
    let resolveOldJson: ((value: unknown) => void) | undefined;
    const oldResponse = {
      ok: true,
      status: 200,
      json: () =>
        new Promise<unknown>((resolve) => {
          resolveOldJson = resolve;
        }),
    } as Response;
    const newCampaignReport = {
      ...REPORTS[1],
      id: "report-new-campaign",
      campaignId: "campaign-456",
      name: "New Campaign Report",
    };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(oldResponse)
      .mockResolvedValueOnce(response({ reports: [newCampaignReport] }));

    const { rerender } = renderPanel();
    await waitFor(() => expect(resolveOldJson).toBeDefined());

    rerender(
      <SummaryReportsPanel
        campaignId="campaign-456"
        campaignName="New Campaign"
        assessmentName="Scaling Up Assessment"
        implementedTypes={IMPLEMENTED_TYPES}
      />,
    );

    expect(await screen.findByRole("listitem")).toHaveTextContent(
      "New Campaign Report",
    );

    await act(async () => {
      resolveOldJson?.({ reports: [REPORTS[0]] });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByRole("listitem")).toHaveTextContent(
      "New Campaign Report",
    );
  });
});
