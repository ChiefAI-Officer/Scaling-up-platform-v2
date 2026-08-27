import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
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
          element?.tagName === "P" &&
          element.textContent ===
            "Northstar Growth Campaign · Scaling Up · v7 · Aug 20, 2026",
      ),
    ).toHaveLength(2);
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          element.textContent === "Submission …o-123456",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Sam Stale.*Incompatible version/i }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /Select Avery CEO/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Assign Avery CEO as CEO/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Select Toni Team/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Assign Toni Team as Team/i }),
    );

    expect(screen.getByText("CEO: Avery CEO")).toBeInTheDocument();
    expect(screen.getByText("Team: Toni Team")).toBeInTheDocument();
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
      screen.getByRole("button", { name: /Assign Avery CEO as CEO/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Select Toni Team/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Assign Toni Team as Team/i }),
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
    expect(screen.getByText("CEO: Avery CEO")).toBeInTheDocument();
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

  it("keeps the editable draft after a conclusive validation response", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(response({ candidates: [CEO] }))
      .mockResolvedValueOnce(response({ error: "invalid composition" }, 422));
    renderWizard();

    fireEvent.click(screen.getByRole("button", { name: "Scaling CEO Full" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Avery CEO");
    fireEvent.click(screen.getByRole("button", { name: /Select Avery CEO/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Assign Avery CEO as CEO/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Create report" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "invalid composition",
    );
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("CEO: Avery CEO")).toBeInTheDocument();
  });

  it("retains a replaced CEO card as selected, supports an empty Team, and shows the persisted automatic name", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      response({ candidates: [CEO, CEO_TWO] }),
    );
    renderWizard();

    fireEvent.click(screen.getByRole("button", { name: "Scaling CEO Full" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Avery CEO");
    fireEvent.click(screen.getByRole("button", { name: /Select Avery CEO/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Assign Avery CEO as CEO/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Select Casey CEO/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Assign Casey CEO as CEO/i }),
    );

    expect(screen.getByText("CEO: Casey CEO")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Avery CEO" }),
    ).toBeInTheDocument();
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
    for (const candidate of [CEO, TEAM, TEAM_TWO]) {
      fireEvent.click(
        screen.getByRole("button", {
          name: new RegExp(`Select ${candidate.respondentName}`),
        }),
      );
    }
    fireEvent.click(
      screen.getByRole("button", { name: /Assign Avery CEO as CEO/i }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Assign Toni Team as Team/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Toni Team is Team/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Assign Riley Team as Team/i }),
    );
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
      screen.getByRole("button", { name: /Assign Avery CEO as CEO/i }),
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
      screen.getByRole("button", { name: /Assign Avery CEO as CEO/i }),
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
