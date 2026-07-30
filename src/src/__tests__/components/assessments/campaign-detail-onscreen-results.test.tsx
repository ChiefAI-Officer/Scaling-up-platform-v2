/**
 * CampaignDetail — "Results on screen" control (Wave OSR, #71).
 *
 * This control is the reachability fix, and therefore the load-bearing piece of
 * the launch: the column shipped create-only, so every campaign that already
 * existed was stuck opted-out and the production flag surfaced nothing. Closing
 * the API gap without a control would move the dead end rather than remove it,
 * which is why this file guards the control itself and not only the route.
 *
 * Gate shape copied from the group-report entry point (Wave F #22, T10): the
 * server computes the boolean, the client never recomputes it, absent ⇒ hidden.
 *
 * Covered:
 *   1. flag on  → the card + checkbox render, reflecting the stored value.
 *   2. flag off → nothing renders.
 *   3. prop absent → nothing renders (fail-closed default).
 *   4. CLOSED campaign → nothing renders, because the PATCH route 409s a closed
 *      campaign and offering the control would promise an edit the server refuses.
 *   5. ticking it PATCHes `{ showResultsOnScreen: true }` to this campaign.
 *   6. a REFUSED PATCH reverts the checkbox — it must never sit in a state the
 *      server rejected, or it misdescribes what respondents are about to see.
 */

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh,
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

jest.mock("@/components/assessments/AssessmentResultView", () => ({
  AssessmentResultView: () => <div data-testid="mock-result-view" />,
}));

const toast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast }),
}));

import { CampaignDetail } from "@/components/assessments/CampaignDetail";
import type {
  CampaignOverview,
  CampaignRespondentRow,
} from "@/lib/assessments/campaign-detail";

const CAMPAIGN_ID = "camp-osr-1";
const CARD = "campaign-onscreen-results-card";
const TOGGLE = "campaign-onscreen-results-toggle";

function makeOverview(opts: {
  status?: "DRAFT" | "ACTIVE" | "CLOSED";
  showResultsOnScreen?: boolean;
} = {}): CampaignOverview {
  return {
    campaign: {
      id: CAMPAIGN_ID,
      name: "On-screen Results Campaign",
      alias: "onscreen-results-test",
      status: opts.status ?? "ACTIVE",
      templateId: "tpl-1",
      templateName: "Rockefeller Habits Checklist",
      organizationId: "org-1",
      organizationName: "Acme Corp",
      openAt: new Date("2026-07-01T00:00:00Z"),
      closeAt: null,
      createdAt: new Date("2026-06-01T00:00:00Z"),
      invitationSubject: null,
      invitationBodyMarkdown: null,
      invitationBodyHtml: null,
      showResultsOnScreen: opts.showResultsOnScreen ?? false,
    },
    stats: {
      totalParticipants: 1,
      invited: 1,
      viewed: 0,
      submitted: 0,
      completionPct: 0,
    },
  };
}

const ROW: CampaignRespondentRow = {
  participantId: "part-1",
  respondent: {
    id: "resp-1",
    firstName: "Casey",
    lastName: "Respondent",
    email: "casey@test.com",
    jobTitle: null,
  },
  teamSnapshot: { pathIds: [], pathLabels: [] },
  invitation: {
    id: "inv-1",
    status: "SENT",
    sentAt: new Date("2026-07-02T00:00:00Z"),
    submittedAt: null,
    expiresAt: new Date("2026-08-02T00:00:00Z"),
    revokedAt: null,
    resentCount: 0,
  },
  hasSubmission: false,
  submissionId: null,
  submittedAt: null,
  isCEO: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: {} }),
  })) as unknown as typeof fetch;
});

describe("CampaignDetail — Results on screen control (Wave OSR #71)", () => {
  it("renders the control when the flag is on, reflecting the stored value", () => {
    render(
      <CampaignDetail
        initialOverview={makeOverview({ showResultsOnScreen: true })}
        initialRespondents={[ROW]}
        onScreenResultsEnabled
      />,
    );
    expect(screen.getByTestId(CARD)).toBeInTheDocument();
    expect(screen.getByTestId(TOGGLE)).toBeChecked();
  });

  it("renders it unchecked when the campaign has not opted in", () => {
    render(
      <CampaignDetail
        initialOverview={makeOverview({ showResultsOnScreen: false })}
        initialRespondents={[ROW]}
        onScreenResultsEnabled
      />,
    );
    expect(screen.getByTestId(TOGGLE)).not.toBeChecked();
  });

  it("renders nothing when the flag is off", () => {
    render(
      <CampaignDetail
        initialOverview={makeOverview({ showResultsOnScreen: true })}
        initialRespondents={[ROW]}
        onScreenResultsEnabled={false}
      />,
    );
    expect(screen.queryByTestId(CARD)).toBeNull();
  });

  it("fail-closed: renders nothing when the capability prop is absent", () => {
    render(
      <CampaignDetail
        initialOverview={makeOverview({ showResultsOnScreen: true })}
        initialRespondents={[ROW]}
      />,
    );
    expect(screen.queryByTestId(CARD)).toBeNull();
  });

  it("renders nothing on a CLOSED campaign — the route would 409 the edit", () => {
    render(
      <CampaignDetail
        initialOverview={makeOverview({ status: "CLOSED" })}
        initialRespondents={[ROW]}
        onScreenResultsEnabled
      />,
    );
    expect(screen.queryByTestId(CARD)).toBeNull();
  });

  it("PATCHes the campaign when ticked", async () => {
    render(
      <CampaignDetail
        initialOverview={makeOverview({ showResultsOnScreen: false })}
        initialRespondents={[ROW]}
        onScreenResultsEnabled
      />,
    );

    fireEvent.click(screen.getByTestId(TOGGLE));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const call = (global.fetch as jest.Mock).mock.calls.find((c) =>
      String(c[0]).includes(`/api/assessment-campaigns/${CAMPAIGN_ID}`),
    );
    expect(call).toBeDefined();
    expect(call![1].method).toBe("PATCH");
    expect(JSON.parse(call![1].body as string)).toEqual({
      showResultsOnScreen: true,
    });
    expect(screen.getByTestId(TOGGLE)).toBeChecked();
  });

  it("reverts the checkbox when the server refuses the change", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({ success: false, error: "Closed campaigns cannot be edited" }),
    })) as unknown as typeof fetch;

    render(
      <CampaignDetail
        initialOverview={makeOverview({ showResultsOnScreen: false })}
        initialRespondents={[ROW]}
        onScreenResultsEnabled
      />,
    );

    fireEvent.click(screen.getByTestId(TOGGLE));

    // positive control: the request WAS attempted, so the revert below is a
    // response to a refusal and not just "the click did nothing".
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId(TOGGLE)).not.toBeChecked());
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );
  });
});
