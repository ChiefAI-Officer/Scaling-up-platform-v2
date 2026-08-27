import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { SummaryReportWizard } from "@/components/assessments/SummaryReportWizard";

const CAMPAIGN_ID = "campaign-123";
const BASE_URL = `/api/assessment-campaigns/${CAMPAIGN_ID}/summary-reports`;

const IMPLEMENTED_TYPES = [
  {
    type: "SCALING_CEO_FULL" as const,
    label: "Scaling CEO Full",
    description: "A full executive summary.",
  },
];

const CEO = {
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

const TEAM = {
  ...CEO,
  submissionId: "submission-team-abcdef",
  respondentId: "respondent-team",
  respondentName: "Toni Team",
  jobTitle: "Chief Operating Officer",
};

const TEAM_TWO = {
  ...TEAM,
  submissionId: "submission-team-two-9999",
  respondentId: "respondent-team-two",
  respondentName: "Riley Team",
};

const CEO_TWO = {
  ...CEO,
  submissionId: "submission-ceo-two-9999",
  respondentId: "respondent-ceo-two",
  respondentName: "Casey CEO",
};

const INCOMPATIBLE = {
  ...CEO,
  submissionId: "submission-stale-0000",
  respondentId: "respondent-stale",
  respondentName: "Sam Stale",
  versionId: "version-6",
  versionNumber: 6,
  eligible: false,
  disabledReason: "INCOMPATIBLE_VERSION" as const,
};

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function renderWizard(
  overrides: Partial<React.ComponentProps<typeof SummaryReportWizard>> = {},
) {
  const onClose = jest.fn();
  const onSuccess = jest.fn();
  return {
    onClose,
    onSuccess,
    ...render(
      <SummaryReportWizard
        open
        onClose={onClose}
        onSuccess={onSuccess}
        campaignId={CAMPAIGN_ID}
        campaignName="Northstar Growth Campaign"
        assessmentName="Scaling Up Assessment"
        implementedTypes={IMPLEMENTED_TYPES}
        {...overrides}
      />,
    ),
  };
}

describe("SummaryReportWizard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { randomUUID: jest.fn(() => "request-uuid-1") },
    });
  });

  it("shows only available type cards and creates nothing when cancelled", () => {
    const { onClose } = renderWizard();

    expect(
      screen.getByRole("button", { name: "Scaling CEO Full" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Scaling Up · Condensed CEO")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("keeps refreshed incompatible assignments visible and blocks review until they are removed", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(response({ candidates: [CEO, TEAM] }))
      .mockResolvedValueOnce(response({ errors: [{ code: "source_incompatible", submissionId: TEAM.submissionId }] }, 422))
      .mockResolvedValueOnce(response({ candidates: [CEO, { ...TEAM, eligible: false, disabledReason: "INCOMPATIBLE_VERSION" }] }));
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Scaling CEO Full" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Avery CEO");
    fireEvent.click(screen.getByRole("button", { name: "Select Avery CEO" }));
    fireEvent.click(screen.getByRole("button", { name: "Add selected to CEO" }));
    fireEvent.click(screen.getByRole("button", { name: "Select Toni Team" }));
    fireEvent.click(screen.getByRole("button", { name: "Add selected to Team" }));
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Create report" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    const included = screen.getByRole("region", { name: "Team component" });
    expect(await within(included).findByText(/Incompatible version/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Remove Toni Team from Team" }));
    expect(screen.getByRole("button", { name: "Review" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Toni Team.*Incompatible version/ })).toBeDisabled();
  });

  it("exposes source identity to assistive technology when names match", async () => {
    const historical = { ...TEAM_TWO, respondentName: TEAM.respondentName, campaignName: "Previous Quarter" };
    (global.fetch as jest.Mock).mockResolvedValue(response({ candidates: [TEAM, historical] }));
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Scaling CEO Full" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const options = await screen.findAllByRole("button", { name: "Select Toni Team" });
    expect(options[0]).toHaveAccessibleDescription(expect.stringContaining(TEAM.submissionId));
    expect(options[1]).toHaveAccessibleDescription(expect.stringContaining(historical.submissionId));
    expect(options[1]).toHaveAccessibleDescription(expect.stringContaining("Previous Quarter"));
  });

  it("transfers a selected batch into Team, excludes assigned sources, and clears them back to available reports", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(response({ candidates: [CEO, TEAM, TEAM_TWO, INCOMPATIBLE] }));
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Scaling CEO Full" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Avery CEO");
    fireEvent.click(screen.getByRole("button", { name: "Select Avery CEO" }));
    fireEvent.click(screen.getByRole("button", { name: "Add selected to CEO" }));
    expect(within(screen.getByRole("region", { name: "Available reports" })).queryByText("Avery CEO")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByRole("button", { name: "Select Toni Team" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Sam Stale.*Incompatible version/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Add selected to Team" }));
    const teamRegion = screen.getByRole("region", { name: "Team component" });
    expect(within(teamRegion).getByText("Toni Team")).toBeInTheDocument();
    expect(within(teamRegion).getByText("Riley Team")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Select Toni Team" })).toBeNull();
    expect(screen.getByRole("button", { name: "Add selected to Team" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Clear Team" }));
    expect(within(teamRegion).queryByText("Toni Team")).toBeNull();
    expect(screen.getByRole("button", { name: "Select Toni Team" })).toHaveAttribute("aria-pressed", "false");
    expect(within(screen.getByRole("region", { name: "CEO component" })).getByText("Avery CEO")).toBeInTheDocument();
  });

  it("searches sources and limits Select all to visible eligible reports without losing assigned roles", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(response({ candidates: [CEO, TEAM, TEAM_TWO] }));
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Scaling CEO Full" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Avery CEO");
    fireEvent.click(screen.getByRole("button", { name: "Select Avery CEO" }));
    fireEvent.click(screen.getByRole("button", { name: "Add selected to CEO" }));
    const search = screen.getByRole("searchbox", { name: "Search report sources" });
    fireEvent.change(search, { target: { value: "riley" } });
    expect(screen.queryByRole("button", { name: "Select Toni Team" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.click(screen.getByRole("button", { name: "Add selected to Team" }));
    expect(within(screen.getByRole("region", { name: "Team component" })).getByText("Riley Team")).toBeInTheDocument();
    fireEvent.change(search, { target: { value: "Northstar Growth Campaign" } });
    expect(screen.getByRole("button", { name: "Select Toni Team" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select Toni Team" }));
    fireEvent.change(search, { target: { value: "does not exist" } });
    expect(screen.getByRole("button", { name: "Add selected to Team" })).toBeDisabled();
    expect(screen.getByText("No matching reports. Try a different search.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review" })).toBeEnabled();
  });

  it("blocks review with pending selections and requires clearing the occupied CEO slot before replacement", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(response({ candidates: [CEO, CEO_TWO, TEAM] }));
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Scaling CEO Full" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Avery CEO");
    fireEvent.click(screen.getByRole("button", { name: "Select Avery CEO" }));
    fireEvent.click(screen.getByRole("button", { name: "Select Casey CEO" }));
    expect(screen.getByRole("button", { name: "Add selected to CEO" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    fireEvent.click(screen.getByRole("button", { name: "Select Avery CEO" }));
    fireEvent.click(screen.getByRole("button", { name: "Add selected to CEO" }));
    fireEvent.click(screen.getByRole("button", { name: "Select Casey CEO" }));
    expect(screen.getByRole("button", { name: "Add selected to CEO" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Review" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("not yet included");
    fireEvent.click(screen.getByRole("button", { name: "Clear CEO" }));
    fireEvent.click(screen.getByRole("button", { name: "Add selected to CEO" }));
    expect(within(screen.getByRole("region", { name: "CEO component" })).getByText("Casey CEO")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select Toni Team" }));
    fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(screen.getByRole("button", { name: "Review" })).toBeEnabled();
  });

  it("disambiguates same-name historical sources in Review and preserves their explicit order", async () => {
    const historical = {
      ...TEAM_TWO,
      respondentName: TEAM.respondentName,
      campaignId: "historical-campaign",
      campaignName: "Northstar Previous Quarter",
      submittedAt: "2026-07-10T09:30:00.000Z",
    };
    (global.fetch as jest.Mock).mockResolvedValue(
      response({ candidates: [CEO, TEAM, historical] }),
    );
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Scaling CEO Full" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Avery CEO");
    fireEvent.click(screen.getByRole("button", { name: "Select Avery CEO" }));
    fireEvent.click(screen.getByRole("button", { name: "Add selected to CEO" }));
    for (const button of screen.getAllByRole("button", { name: "Select Toni Team" })) fireEvent.click(button);
    fireEvent.click(screen.getByRole("button", { name: "Add selected to Team" }));
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByText("Organization: Northstar Growth")).toBeInTheDocument();
    expect(screen.getByText(`Submission: ${CEO.submissionId}`)).toBeInTheDocument();
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText(`Submission: ${TEAM.submissionId}`)).toBeInTheDocument();
    expect(within(rows[1]).getByText(`Submission: ${historical.submissionId}`)).toBeInTheDocument();
    expect(within(rows[1]).getByText("Northstar Previous Quarter · scaling-up-full · v7 · en")).toBeInTheDocument();
    expect(within(rows[1]).getByText(`Completed: ${historical.submittedAt}`)).toBeInTheDocument();
    fireEvent.click(within(rows[1]).getByRole("button", { name: "Move up" }));
    expect(within(screen.getAllByRole("listitem")[0]).getByText(`Submission: ${historical.submissionId}`)).toBeInTheDocument();
  });

  it("keeps selection separate from CEO assignment and shows candidate metadata", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      response({ candidates: [CEO, TEAM, INCOMPATIBLE] }),
    );
    renderWizard();

    fireEvent.click(screen.getByRole("button", { name: "Scaling CEO Full" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Avery CEO")).toBeInTheDocument();
    expect(
      screen.getAllByText(
        (_, element) =>
          element?.tagName === "SPAN" &&
          element.textContent ===
            "Northstar Growth Campaign · v7 · en · Aug 20, 2026",
      ),
    ).toHaveLength(2);
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "SPAN" &&
          element.textContent === "Submission …o-123456",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Sam Stale.*Incompatible version/i }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /Select Avery CEO/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Add selected to CEO/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Select Toni Team/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Add selected to Team/i }),
    );

    expect(within(screen.getByRole("region", { name: "CEO component" })).getByText("Avery CEO")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Team component" })).getByText("Toni Team")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(await screen.findByText("Team count: 1")).toBeInTheDocument();
    expect(
      screen.getByText("Northstar Growth Campaign — Scaling CEO Full"),
    ).toBeInTheDocument();
  });

  it("preserves assignments through scope changes and Back, then posts the exact ordered role payload once", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) =>
      Promise.resolve(
        url.includes("/candidates")
          ? response({ candidates: [CEO, TEAM] })
          : response({ id: "report-1" }, 201),
      ),
    );
    const { onClose, onSuccess } = renderWizard();

    fireEvent.click(screen.getByRole("button", { name: "Scaling CEO Full" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Avery CEO");
    fireEvent.click(screen.getByRole("button", { name: /Select Avery CEO/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Add selected to CEO/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Select Toni Team/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Add selected to Team/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "All campaigns" }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        `${BASE_URL}/candidates?type=SCALING_CEO_FULL&scope=all`,
        expect.anything(),
      ),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(within(screen.getByRole("region", { name: "CEO component" })).getByText("Avery CEO")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));

    const create = screen.getByRole("button", { name: "Create report" });
    fireEvent.click(create);
    fireEvent.click(create);

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
    const createCalls = (global.fetch as jest.Mock).mock.calls.filter(
      ([url]) => url === BASE_URL,
    );
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0][1]).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportType: "SCALING_CEO_FULL",
          creationRequestId: "request-uuid-1",
          sources: [
            {
              submissionId: CEO.submissionId,
              sourceCampaignId: CAMPAIGN_ID,
              role: "CEO",
              position: 0,
            },
            {
              submissionId: TEAM.submissionId,
              sourceCampaignId: CAMPAIGN_ID,
              role: "TEAM",
              position: 0,
            },
          ],
        }),
      }),
    );
  });

  it.each([
    ["source_not_found", "The selected source is no longer available."],
    ["source_not_completed", "The selected source is no longer completed."],
    ["source_incompatible", "The selected source is no longer compatible."],
  ])("identifies an authorized %s failure, refreshes candidates and retains assignments", async (code, message) => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(response({ candidates: [CEO] }))
      .mockResolvedValueOnce(response({ errors: [{ code, message, submissionId: CEO.submissionId }] }, 422))
      .mockResolvedValueOnce(response({ candidates: [CEO, INCOMPATIBLE] }));
    renderWizard();

    fireEvent.click(screen.getByRole("button", { name: "Scaling CEO Full" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Avery CEO");
    fireEvent.click(screen.getByRole("button", { name: /Select Avery CEO/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Add selected to CEO/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Create report" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      `Avery CEO (${CEO.submissionId}): ${message}`,
    );
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(within(screen.getByRole("region", { name: "CEO component" })).getByText("Avery CEO")).toBeInTheDocument();
    await screen.findByRole("button", { name: /Sam Stale.*Incompatible version/i });
    expect((global.fetch as jest.Mock).mock.calls.filter(([url]) => url.includes("/candidates"))).toHaveLength(2);
    expect((global.fetch as jest.Mock).mock.calls.filter(([url]) => url === BASE_URL)).toHaveLength(1);
  });

  it.each([
    [{ errors: [{ code: "source_unavailable", message: "Private source Avery CEO", submissionId: CEO.submissionId }] }, "One or more selected sources are unavailable. Review your selection and try again."],
    [{ errors: "bad" }, "Please correct the composition and try again."],
    [{ errors: [null] }, "Please correct the composition and try again."],
    [{ errors: [{ code: "unknown", message: "untrusted detail" }] }, "Please correct the composition and try again."],
  ])("handles concealed or malformed validation without leaking source details", async (envelope, expected) => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(response({ candidates: [CEO] }))
      .mockResolvedValueOnce(response(envelope, 422));
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Scaling CEO Full" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Avery CEO");
    fireEvent.click(screen.getByRole("button", { name: "Select Avery CEO" }));
    fireEvent.click(screen.getByRole("button", { name: "Add selected to CEO" }));
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Create report" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(expected);
    expect(screen.getByRole("alert")).not.toHaveTextContent("Avery CEO");
    expect(screen.getByRole("alert")).not.toHaveTextContent(CEO.submissionId);
    expect(screen.getByRole("button", { name: "Back" })).toBeEnabled();
  });

  it("returns a cleared CEO to available reports, supports an empty Team, and shows the persisted automatic name", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      response({ candidates: [CEO, CEO_TWO] }),
    );
    renderWizard();

    fireEvent.click(screen.getByRole("button", { name: "Scaling CEO Full" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Avery CEO");
    fireEvent.click(screen.getByRole("button", { name: /Select Avery CEO/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Add selected to CEO/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear CEO" }));
    fireEvent.click(screen.getByRole("button", { name: /Select Casey CEO/i }));
    fireEvent.click(screen.getByRole("button", { name: /Add selected to CEO/i }));
    expect(within(screen.getByRole("region", { name: "CEO component" })).getByText("Casey CEO")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select Avery CEO" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByText("Team count: 0")).toBeInTheDocument();
    expect(
      screen.getByText("Name: Northstar Growth Campaign"),
    ).toBeInTheDocument();
  });

  it("prevents duplicate Team assignment and posts explicit reordered Team positions", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) =>
      Promise.resolve(
        url.includes("/candidates")
          ? response({ candidates: [CEO, TEAM, TEAM_TWO] })
          : response({ id: "report-1" }, 201),
      ),
    );
    renderWizard();

    fireEvent.click(screen.getByRole("button", { name: "Scaling CEO Full" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Avery CEO");
    fireEvent.click(screen.getByRole("button", { name: "Select Avery CEO" }));
    fireEvent.click(screen.getByRole("button", { name: "Add selected to CEO" }));
    for (const candidate of [TEAM, TEAM_TWO]) {
      fireEvent.click(screen.getByRole("button", { name: `Select ${candidate.respondentName}` }));
    }
    fireEvent.click(screen.getByRole("button", { name: "Add selected to Team" }));
    expect(screen.getByRole("button", { name: "Add selected to Team" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Select Toni Team" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Move down" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Create report" }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(BASE_URL, expect.anything()),
    );
    const createCall = (global.fetch as jest.Mock).mock.calls.find(
      ([url]) => url === BASE_URL,
    );
    expect(JSON.parse(createCall?.[1].body)).toMatchObject({
      sources: [
        { submissionId: CEO.submissionId, role: "CEO", position: 0 },
        { submissionId: TEAM_TWO.submissionId, role: "TEAM", position: 0 },
        { submissionId: TEAM.submissionId, role: "TEAM", position: 1 },
      ],
    });
  });

  it("retries the exact frozen ambiguous command, blocks Back, and starts a new UUID after close and reopen", async () => {
    const uuid = jest
      .fn()
      .mockReturnValueOnce("request-uuid-1")
      .mockReturnValueOnce("request-uuid-2");
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { randomUUID: uuid },
    });
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(response({ candidates: [CEO] }))
      .mockResolvedValueOnce(response({ error: "unavailable" }, 503))
      .mockResolvedValueOnce(response({ id: "report-1" }, 200));
    const { rerender, onClose } = renderWizard();

    fireEvent.click(screen.getByRole("button", { name: "Scaling CEO Full" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Avery CEO");
    fireEvent.click(screen.getByRole("button", { name: /Select Avery CEO/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Add selected to CEO/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Create report" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Retry this exact request",
    );
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const posts = (global.fetch as jest.Mock).mock.calls.filter(
      ([url]) => url === BASE_URL,
    );
    expect(posts).toHaveLength(2);
    expect(posts[1][1].body).toBe(posts[0][1].body);

    rerender(
      <SummaryReportWizard
        open={false}
        onClose={onClose}
        onSuccess={jest.fn()}
        campaignId={CAMPAIGN_ID}
        campaignName="Northstar Growth Campaign"
        assessmentName="Scaling Up Assessment"
        implementedTypes={IMPLEMENTED_TYPES}
      />,
    );
    rerender(
      <SummaryReportWizard
        open
        onClose={onClose}
        onSuccess={jest.fn()}
        campaignId={CAMPAIGN_ID}
        campaignName="Northstar Growth Campaign"
        assessmentName="Scaling Up Assessment"
        implementedTypes={IMPLEMENTED_TYPES}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Scaling CEO Full" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(uuid).toHaveBeenCalledTimes(2));
  });

  it("guards Back, close, escape, and draft edits synchronously while create is in flight", async () => {
    let resolveCreate: ((value: Response) => void) | undefined;
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(response({ candidates: [CEO, TEAM] }))
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveCreate = resolve;
        }),
      );
    const { onClose } = renderWizard();

    fireEvent.click(screen.getByRole("button", { name: "Scaling CEO Full" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Avery CEO");
    fireEvent.click(screen.getByRole("button", { name: /Select Avery CEO/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Add selected to CEO/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Create report" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("Team count: 0")).toBeInTheDocument();

    await act(async () => {
      resolveCreate?.(response({ id: "report-1" }, 201));
    });
  });
});
