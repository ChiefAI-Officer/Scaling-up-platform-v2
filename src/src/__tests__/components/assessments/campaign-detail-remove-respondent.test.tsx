/**
 * CHI-35 / Jeff #59 — CampaignDetail respondent-removal client contract.
 *
 * The API route has its own response-contract coverage. These tests pin the
 * user-visible seam that was previously missing: a body-less 204 is success,
 * while a failed DELETE leaves the respondent visible and reports the error.
 */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockToast = jest.fn();
const mockRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: mockRefresh,
    back: jest.fn(),
  }),
}));

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

jest.mock("@/components/assessments/AssessmentResultView", () => ({
  AssessmentResultView: () => <div data-testid="mock-result-view" />,
}));

import { CampaignDetail } from "@/components/assessments/CampaignDetail";
import type {
  CampaignOverview,
  CampaignRespondentRow,
} from "@/lib/assessments/campaign-detail";

const CAMPAIGN_ID = "campaign-59";
const PARTICIPANT_ID = "participant-59";
const RESPONDENT_ID = "respondent-59";
const DELETE_URL = `/api/assessment-campaigns/${CAMPAIGN_ID}/participants/${PARTICIPANT_ID}`;
const RESPONDENTS_URL = `/api/assessment-campaigns/${CAMPAIGN_ID}/respondents`;

const overview: CampaignOverview = {
  campaign: {
    id: CAMPAIGN_ID,
    name: "Spectrum",
    alias: "spectrum",
    status: "ACTIVE",
    openAt: new Date("2026-07-01T00:00:00Z"),
    closeAt: null,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    templateId: "template-59",
    templateName: "Scaling Up Full",
    organizationId: "organization-59",
    organizationName: "Spectrum",
    invitationSubject: null,
    invitationBodyMarkdown: null,
    invitationBodyHtml: null,
  },
  stats: {
    totalParticipants: 1,
    invited: 1,
    viewed: 0,
    submitted: 0,
    completionPct: 0,
  },
};

const removableRespondent: CampaignRespondentRow = {
  participantId: PARTICIPANT_ID,
  respondent: {
    id: RESPONDENT_ID,
    firstName: "Alice",
    lastName: "Smith",
    email: "alice@example.com",
    jobTitle: null,
  },
  teamSnapshot: { pathIds: [], pathLabels: [] },
  isCEO: false,
  invitation: {
    id: "invitation-59",
    status: "SENT",
    sentAt: new Date("2026-07-02T00:00:00Z"),
    submittedAt: null,
    expiresAt: new Date("2026-08-02T00:00:00Z"),
    resentCount: 0,
    revokedAt: null,
  },
  hasSubmission: false,
  submissionId: null,
  submittedAt: null,
};

/**
 * A FAITHFUL Response stub — `json()` must reject when there is no body.
 *
 * This is load-bearing, not pedantry. The production defect behind Jeff #59 was
 * a bodyless `204` being handed JSON: a real `Response` with no body REJECTS on
 * `.json()` with a SyntaxError, and that reject is what threw after the
 * transaction had already committed. A stub that resolves `undefined` instead
 * makes the whole bug class invisible — reading the body before checking the
 * status would pass here and still fail in production.
 *
 * Verified by mutation: inserting `await res.json()` above the `res.status === 204`
 * check in `handleConfirmRemove` passes against a resolving stub and FAILS
 * against this one. Matches the faithful-Response approach the route-level
 * regression test already uses for the same reason.
 */
function response({
  ok,
  status,
  body,
}: {
  ok: boolean;
  status: number;
  body?: unknown;
}): Response {
  return {
    ok,
    status,
    json:
      body === undefined
        ? jest
            .fn()
            .mockRejectedValue(new SyntaxError("Unexpected end of JSON input"))
        : jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function renderRemovalFlow() {
  render(
    <CampaignDetail
      initialOverview={overview}
      initialRespondents={[removableRespondent]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Remove Alice Smith" }));
  fireEvent.click(screen.getByTestId("remove-respondent-confirm"));
}

describe("CampaignDetail — respondent removal (CHI-35 / Jeff #59)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("treats an empty 204 as success, refreshes respondents, and never shows the false-error toast", async () => {
    global.fetch = jest.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : String(input);
        if (url === DELETE_URL && init?.method === "DELETE") {
          return response({ ok: true, status: 204 });
        }
        if (url === RESPONDENTS_URL && !init?.method) {
          return response({
            ok: true,
            status: 200,
            body: { success: true, data: { respondents: [] } },
          });
        }
        throw new Error(`Unhandled fetch: ${init?.method ?? "GET"} ${url}`);
      },
    ) as unknown as typeof fetch;

    renderRemovalFlow();

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Respondent removed" }),
      ),
    );
    expect(mockToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "Could not remove respondent" }),
    );
    expect(global.fetch).toHaveBeenCalledWith(DELETE_URL, { method: "DELETE" });
    expect(global.fetch).toHaveBeenCalledWith(RESPONDENTS_URL);
    await waitFor(() =>
      expect(
        screen.queryByTestId(`respondent-row-${RESPONDENT_ID}`),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByTestId("remove-respondent-dialog"),
    ).not.toBeInTheDocument();
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("keeps the respondent visible and shows a destructive toast when removal fails", async () => {
    global.fetch = jest.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : String(input);
        if (url === DELETE_URL && init?.method === "DELETE") {
          return response({
            ok: false,
            status: 500,
            body: { success: false, error: "Removal failed safely" },
          });
        }
        throw new Error(`Unhandled fetch: ${init?.method ?? "GET"} ${url}`);
      },
    ) as unknown as typeof fetch;

    renderRemovalFlow();

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Could not remove respondent",
          description: "Removal failed safely",
          variant: "destructive",
        }),
      ),
    );
    expect(
      screen.getByTestId(`respondent-row-${RESPONDENT_ID}`),
    ).toBeInTheDocument();
    expect(screen.getByTestId("remove-respondent-dialog")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
