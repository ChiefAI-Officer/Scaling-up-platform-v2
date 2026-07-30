/**
 * CampaignDetail — "Results on screen" control (Wave OSR, #71).
 *
 * This control is the reachability fix, and therefore the load-bearing piece of
 * the launch: the column was writable only at CREATE, so every campaign that
 * already existed was stuck opted-out. Closing the API gap without a control would
 * move the dead end rather than remove it, which is why this file guards the
 * control itself and not only the route.
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
 *   7. a SILENTLY IGNORED PATCH also reverts. The route drops this field when the
 *      flag is off and still answers 200 {success:true}, so `res.ok` alone would
 *      leave the box ticked over a column that never changed.
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
  // The handler verifies the echoed row, so this mock echoes the value back — the
  // realistic shape, since the route returns the updated row. Note the guard is
  // PRESENCE-gated (`"showResultsOnScreen" in body.data`), so a bare `data: {}`
  // also passes; the silent-no-op branch is exercised by its own test below, which
  // echoes a value that DISAGREES with what was sent.
  global.fetch = jest.fn(async (_url: unknown, init?: { body?: string }) => {
    const sent = init?.body ? JSON.parse(init.body) : {};
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { showResultsOnScreen: sent.showResultsOnScreen },
      }),
    };
  }) as unknown as typeof fetch;
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

  /**
   * TIMEOUTS — the async tests in this file pass an explicit per-test budget as
   * `it`'s third argument, and raise `waitFor`'s own timeout to match.
   *
   * BOTH are required, and it is easy to get this wrong: `waitFor` defaults to 1s
   * while jest's own `testTimeout` defaults to 5s (this repo sets neither in
   * `jest.config.js`/`jest.setup.js`). Raising only `waitFor` to 15s is
   * self-defeating — jest aborts the test at 5s and the larger budget is never
   * reachable. This suite renders the entire CampaignDetail tree in jsdom, which is
   * slow enough under parallel full-suite load to matter.
   */
  it(
    "PATCHes the campaign when ticked",
    async () => {
      render(
        <CampaignDetail
          initialOverview={makeOverview({ showResultsOnScreen: false })}
          initialRespondents={[ROW]}
          onScreenResultsEnabled
        />,
      );

      fireEvent.click(screen.getByTestId(TOGGLE));

      await waitFor(() => expect(global.fetch).toHaveBeenCalled(), {
        timeout: 15000,
      });
      const call = (global.fetch as jest.Mock).mock.calls.find((c) =>
        String(c[0]).includes(`/api/assessment-campaigns/${CAMPAIGN_ID}`),
      );
      expect(call).toBeDefined();
      expect(call![1].method).toBe("PATCH");
      expect(JSON.parse(call![1].body as string)).toEqual({
        showResultsOnScreen: true,
      });
      expect(screen.getByTestId(TOGGLE)).toBeChecked();
    },
    20000,
  );

  it(
    "reverts the checkbox when the server SILENTLY ignores the field",
    async () => {
      // The flag-off branch of the route drops the field and still returns
      // 200 {success:true} with the unchanged row. From the operator's point of view
      // that is a failure, so the echoed value — not the status — decides.
      global.fetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { showResultsOnScreen: false },
        }),
      })) as unknown as typeof fetch;

      render(
        <CampaignDetail
          initialOverview={makeOverview({ showResultsOnScreen: false })}
          initialRespondents={[ROW]}
          onScreenResultsEnabled
        />,
      );

      fireEvent.click(screen.getByTestId(TOGGLE));

      // positive control: the request WAS made and reported success…
      await waitFor(() => expect(global.fetch).toHaveBeenCalled(), {
        timeout: 15000,
      });
      // …and the checkbox still goes back, because nothing was actually stored.
      await waitFor(
        () => expect(screen.getByTestId(TOGGLE)).not.toBeChecked(),
        { timeout: 15000 },
      );
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      );
    },
    20000,
  );

  it(
    "reverts the checkbox when the server refuses the change",
    async () => {
      global.fetch = jest.fn(async () => ({
        ok: false,
        status: 409,
        json: async () => ({
          success: false,
          error: "Closed campaigns cannot be edited",
        }),
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
      await waitFor(() => expect(global.fetch).toHaveBeenCalled(), {
        timeout: 15000,
      });
      await waitFor(
        () => expect(screen.getByTestId(TOGGLE)).not.toBeChecked(),
        { timeout: 15000 },
      );
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      );
    },
    20000,
  );
});
