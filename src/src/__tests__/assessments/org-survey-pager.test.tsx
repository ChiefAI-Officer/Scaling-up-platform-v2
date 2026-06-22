/**
 * Task 6 — INVITED survey client (OrgSurveyClient) uses the shared SectionPager
 * + localStorage autosave, AND fixes the hidden-orphan submit dead-end.
 *
 * The old stacked render bucketed questions by `q.sectionStableKey ?? "__unassigned"`
 * and only rendered sections whose bucket was non-empty — so an orphan question
 * (no/blank sectionStableKey) was NEVER rendered, yet handleSubmit's required-scan
 * still counted it. A REQUIRED orphan therefore made Submit a permanent dead-end.
 *
 * SectionPager + buildSectionPages render the orphan in a trailing "Other" page,
 * making it answerable and the survey submittable.
 *
 * Asserts:
 *  1. The REQUIRED orphan question renders and is answerable (navigate the pager
 *     to the "Other" page; the field is present).
 *  2. After answering BOTH the section question and the orphan, Submit POSTs to
 *     /org-survey/<alias>/submit with BOTH answers and router.push reaches
 *     thank-you (no dead-end).
 *  3. A reload (fresh mount) hydrates answers from invitedDraftKey(alias)
 *     localStorage.
 */

import React from "react";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
  }),
  useSearchParams: () => ({ get: jest.fn() }),
  usePathname: () => "/",
}));

import { OrgSurveyClient } from "@/components/assessments/org-survey-client";
import { invitedDraftKey } from "@/lib/assessments/use-answer-draft";

const ALIAS = "team-invited";
const RESPONDENT_KEY = "resp-123";

const surveyData = {
  campaign: { name: "Invited Assessment", alias: ALIAS },
  version: { language: "en" },
  // Opaque per-respondent id (the invitation cuid) surfaced by /me so the
  // localStorage draft is keyed per-respondent, not per-campaign — two
  // invitees of the same campaign on a shared device must not collide.
  respondentKey: RESPONDENT_KEY,
  sections: [{ stableKey: "S1", sortOrder: 1, name: "One" }],
  questions: [
    {
      stableKey: "q1",
      sortOrder: 1,
      sectionStableKey: "S1",
      type: "SLIDER_LIKERT",
      label: "Q1",
      isRequired: true,
      scale: { min: 0, max: 3, step: 1, anchorMin: "lo", anchorMax: "hi" },
    },
    {
      stableKey: "orphanReq",
      sortOrder: 2,
      sectionStableKey: undefined,
      type: "TEXT",
      label: "Orphan Q",
      isRequired: true,
    },
  ],
};

/** Mock GET /me → { success, data }. No window hash ⇒ exchange step is skipped. */
function mockMeFetch() {
  global.fetch = jest.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/me")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: surveyData }),
      } as Response);
    }
    // /submit (and anything else) — default 200 OK
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { submissionId: "sub_1" } }),
    } as Response);
  }) as unknown as typeof fetch;
}

/** Render + advance through the intro phase into the pager (ready phase). */
async function reachPager() {
  render(<OrgSurveyClient campaignAlias={ALIAS} />);
  // intro phase: "Start the assessment →" (approved participant welcome CTA)
  const start = await screen.findByRole("button", { name: /start the assessment/i });
  fireEvent.click(start);
}

describe("OrgSurveyClient — SectionPager wiring + hidden-orphan fix", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    // Ensure no exchange token in the hash.
    window.history.replaceState(null, "", "/");
    mockMeFetch();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the REQUIRED orphan question on the trailing 'Other' page (was hidden)", async () => {
    await reachPager();

    // Section 1 of 2 (S1 + the Other page for the orphan).
    expect(await screen.findByText(/section 1 of 2/i)).toBeInTheDocument();
    // Section question visible; orphan NOT yet (different page).
    expect(screen.getByText("Q1")).toBeInTheDocument();
    expect(screen.queryByText("Orphan Q")).not.toBeInTheDocument();

    // Answer the required scale by dragging the slider to value 2, then advance.
    fireEvent.change(screen.getByRole("slider"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // The "Other" page now renders the orphan question (previously invisible).
    expect(await screen.findByText(/section 2 of 2/i)).toBeInTheDocument();
    expect(screen.getByText("Orphan Q")).toBeInTheDocument();
    // And it is answerable.
    const orphanField = screen.getByLabelText(/Orphan Q/i) as HTMLTextAreaElement;
    expect(orphanField).toBeInTheDocument();
  });

  it("G1: a section WITH a description renders the 'What this section covers' callout AND its question on the SAME screen (no separate Begin step)", async () => {
    // Wave G merged the per-section intro into the same page as its questions,
    // applied UNIFORMLY across the public AND invited flows (G1). A described
    // section must render its "What this section covers" callout + question
    // TOGETHER, with NO intermediate "Begin section" affordance.
    const describedSurveyData = {
      ...surveyData,
      sections: [
        { stableKey: "S1", sortOrder: 1, name: "Strategy", description: "How you set direction." },
      ],
      questions: [
        {
          stableKey: "q1",
          sortOrder: 1,
          sectionStableKey: "S1",
          type: "SLIDER_LIKERT",
          label: "Strategy Question",
          isRequired: true,
          scale: { min: 0, max: 3, step: 1, anchorMin: "lo", anchorMax: "hi" },
        },
      ],
    };
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: describedSurveyData }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { submissionId: "sub_1" } }),
      } as Response);
    }) as unknown as typeof fetch;

    await reachPager();

    // On the FIRST screen, simultaneously (no intermediate click):
    // the description callout label, the description text, AND the question label.
    expect(await screen.findByText(/what this section covers/i)).toBeInTheDocument();
    expect(screen.getByText(/how you set direction/i)).toBeInTheDocument();
    expect(screen.getByText("Strategy Question")).toBeInTheDocument();

    // No "Begin section" affordance — the merged page has no separate intro step.
    expect(
      screen.queryByRole("button", { name: /begin section/i }),
    ).not.toBeInTheDocument();
  });

  it("submits BOTH answers and reaches thank-you (no dead-end)", async () => {
    await reachPager();

    await screen.findByText(/section 1 of 2/i);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await screen.findByText(/section 2 of 2/i);
    fireEvent.change(screen.getByLabelText(/Orphan Q/i), {
      target: { value: "free text" },
    });
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    // Find the /submit call.
    await waitFor(() => {
      const calls = (global.fetch as jest.Mock).mock.calls;
      expect(calls.some(([u]) => String(u).includes("/submit"))).toBe(true);
    });

    const submitCall = (global.fetch as jest.Mock).mock.calls.find(([u]) =>
      String(u).includes("/submit"),
    );
    const url = submitCall[0];
    const init = submitCall[1];
    expect(String(url)).toBe(`/org-survey/${ALIAS}/submit`);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.answers).toEqual(
      expect.arrayContaining([
        { stableKey: "q1", value: 2 },
        { stableKey: "orphanReq", value: "free text" },
      ]),
    );
    expect(body.answers).toHaveLength(2);

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(`/org-survey/${ALIAS}/thank-you`),
    );
  });

  it("hydrates answers from the per-respondent invitedDraftKey(respondentKey) localStorage on mount", async () => {
    // Seed a draft BEFORE mount, under the per-RESPONDENT key (not the alias).
    const key = invitedDraftKey(RESPONDENT_KEY);
    localStorage.setItem(key, JSON.stringify({ q1: 3, orphanReq: "restored" }));

    await reachPager();
    await screen.findByText(/section 1 of 2/i);

    // The scale reflects the restored value 3 (draft hydrated once /me loaded
    // the respondentKey and the draftKey transitioned null → value): the slider
    // now holds value 3 (max, anchored "hi").
    const slider = screen.getByRole("slider") as HTMLInputElement;
    expect(slider.value).toBe("3");

    // Advance to the Other page and confirm the orphan textarea restored.
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText(/section 2 of 2/i);
    const orphanField = screen.getByLabelText(/Orphan Q/i) as HTMLTextAreaElement;
    expect(orphanField.value).toBe("restored");
  });

  it("does NOT hydrate a draft keyed by the campaign alias (per-respondent isolation)", async () => {
    // A draft stored under the OLD per-campaign key must be ignored — proves
    // the key is now per-respondent, so two invitees on a shared device never
    // cross-hydrate each other's answers.
    localStorage.setItem(
      invitedDraftKey(ALIAS),
      JSON.stringify({ q1: 3, orphanReq: "leaked from another respondent" }),
    );

    await reachPager();
    await screen.findByText(/section 1 of 2/i);

    // The scale stays unanswered — the alias-keyed draft was NOT loaded, so the
    // slider sits at its default minimum (0), not the leaked value 3.
    const slider = screen.getByRole("slider") as HTMLInputElement;
    expect(slider.value).toBe("0");
  });

  it("keys the autosaved draft by the per-respondent invitedDraftKey(respondentKey)", async () => {
    await reachPager();
    await screen.findByText(/section 1 of 2/i);

    // Answer and let the 500ms debounced autosave flush.
    fireEvent.change(screen.getByRole("slider"), { target: { value: "2" } });

    await waitFor(() => {
      expect(localStorage.getItem(invitedDraftKey(RESPONDENT_KEY))).not.toBeNull();
    });
    // The legacy per-campaign-alias key must never be written.
    expect(localStorage.getItem(invitedDraftKey(ALIAS))).toBeNull();

    const saved = JSON.parse(
      localStorage.getItem(invitedDraftKey(RESPONDENT_KEY)) as string,
    );
    expect(saved.q1).toBe(2);
  });

  it("prunes a stale draft answer key (no longer a rendered question) from the submit POST body (R3-M2)", async () => {
    // Seed a draft containing a STALE key ("removedQ") that maps to no current
    // question, alongside the two valid answers, under the per-respondent key.
    localStorage.setItem(
      invitedDraftKey(RESPONDENT_KEY),
      JSON.stringify({ q1: 2, orphanReq: "free text", removedQ: 9 }),
    );

    await reachPager();
    await screen.findByText(/section 1 of 2/i);

    // Advance to the Other page (the slider already holds the restored value 2)
    // and submit.
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText(/section 2 of 2/i);
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      const calls = (global.fetch as jest.Mock).mock.calls;
      expect(calls.some(([u]) => String(u).includes("/submit"))).toBe(true);
    });

    const submitCall = (global.fetch as jest.Mock).mock.calls.find(([u]) =>
      String(u).includes("/submit"),
    );
    const body = JSON.parse((submitCall[1] as RequestInit).body as string);
    const keys = body.answers.map((a: { stableKey: string }) => a.stableKey);
    // The stale key is gone; only the two real questions are POSTed.
    expect(keys).not.toContain("removedQ");
    expect(keys.sort()).toEqual(["orphanReq", "q1"]);
  });

  it("keeps the participant ON the pager (inline error, not a terminal screen) when submit fails (R2-M1)", async () => {
    // /me succeeds; /submit returns a 500 — the participant must stay on the
    // pager with an inline error, NOT land on the terminal error phase.
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: surveyData }),
        } as Response);
      }
      // /submit fails.
      return Promise.resolve({
        ok: false,
        status: 500,
        json: async () => ({ success: false, error: "Failed to submit answers" }),
      } as Response);
    }) as unknown as typeof fetch;

    await reachPager();
    await screen.findByText(/section 1 of 2/i);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText(/section 2 of 2/i);
    fireEvent.change(screen.getByLabelText(/Orphan Q/i), {
      target: { value: "free text" },
    });
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    // Inline error appears AND the pager is still mounted (the question is
    // still present); router.push to thank-you was never called.
    await screen.findByRole("alert");
    expect(screen.getByText("Orphan Q")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("keeps the participant ON the pager (inline alert, not terminal) when the pre-submit required/empty gate fires (R2-M1 parity)", async () => {
    // The two pre-submit gates in handleSubmit (global required-unanswered scan
    // + zero-answer EMPTY_ANSWERS guard) used to call setPhase({ kind: "error" })
    // — a terminal dead-end screen. They now surface inline via setSubmitError so
    // the participant stays on the pager and can fix the answer in place, matching
    // the genuine POST-failure recovery (and the public quiz client).
    //
    // Reachable path: a survey with sections but NO questions renders the pager's
    // ungated "Nothing to answer yet" Submit (the per-page required gate never
    // runs), so clicking Submit reaches handleSubmit with zero answers → the
    // empty-answer gate fires. The participant must NOT be dead-ended.
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            // Zero sections + zero questions ⇒ buildSectionPages returns [] ⇒ the
            // pager shows the ungated Submit, so handleSubmit's pre-submit gate is
            // the only enforcement and IS reached.
            data: { ...surveyData, sections: [], questions: [] },
          }),
        } as Response);
      }
      // /submit must NEVER be hit — the gate returns before any POST.
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { submissionId: "sub_x" } }),
      } as Response);
    }) as unknown as typeof fetch;

    await reachPager();

    // The ungated Submit appears (no required gating, no answers).
    const submitBtn = await screen.findByRole("button", { name: /submit/i });
    fireEvent.click(submitBtn);

    // Inline alert appears, the pager stays mounted (Submit still present), the
    // terminal error screen is NOT shown, no /submit POST fires, and navigation
    // never happens.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/please answer at least one question/i);
    expect(screen.getByRole("button", { name: /submit/i })).toBeInTheDocument();
    // Terminal error phase copy must NOT appear.
    expect(screen.queryByText(/can't open this survey/i)).not.toBeInTheDocument();
    // No POST to /submit and no thank-you navigation.
    const submitCalls = (global.fetch as jest.Mock).mock.calls.filter(([u]) =>
      String(u).includes("/submit"),
    );
    expect(submitCalls).toHaveLength(0);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("Screen 1 (welcome) renders the value-prop list with INVITED team framing + stat chips from real data", async () => {
    render(<OrgSurveyClient campaignAlias={ALIAS} />);
    // Wait for the intro (welcome) phase to render after /me resolves.
    await screen.findByRole("button", { name: /start the assessment/i });

    const expectations = screen.getByTestId("welcome-expectations");
    // INVITED team framing — "feed the team picture", NOT the public lead-magnet copy.
    expect(within(expectations).getByText(/feed the team picture/i)).toBeInTheDocument();

    // Stat chips reflect the real counts (2 questions; 1 defined section) and the
    // derived 0–3 scale (from the slider question).
    const stats = screen.getByTestId("welcome-stats");
    expect(within(stats).getByText("2")).toBeInTheDocument();
    expect(within(stats).getByText("0–3")).toBeInTheDocument();

    // Invited fine print mentions the facilitator/coach (team framing kept).
    expect(screen.getByText(/facilitator or coach/i)).toBeInTheDocument();
  });
});
