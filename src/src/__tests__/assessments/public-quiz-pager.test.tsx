/**
 * Task 5 — Public quiz uses the shared SectionPager + localStorage autosave.
 *
 * Asserts:
 *  - After reaching the "form" step, the pager renders ONE section per screen
 *    (a "Section N of M" label is present; only the first section's question
 *    shows, not every section stacked).
 *  - Advancing through every section to Submit POSTs to
 *    /api/quiz/<alias>/submit with the UNCHANGED body shape
 *    { publicTaker, answers: [{ stableKey, value }, ...] }.
 *  - On a mocked 200, the publicDraftKey(alias) localStorage entry is cleared.
 */

import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

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

import { PublicQuizClient } from "@/components/assessments/public-quiz-client";
import { publicDraftKey } from "@/lib/assessments/use-answer-draft";

const ALIAS = "team-alpha";

const sections = [
  { stableKey: "S1", sortOrder: 1, name: "Section One" },
  { stableKey: "S2", sortOrder: 2, name: "Section Two" },
];
const questions = [
  {
    stableKey: "q1",
    sortOrder: 1,
    sectionStableKey: "S1",
    type: "SLIDER_LIKERT",
    label: "Question One",
    isRequired: true,
    scale: { min: 0, max: 3, step: 1, anchorMin: "lo", anchorMax: "hi" },
  },
  {
    stableKey: "q2",
    sortOrder: 2,
    sectionStableKey: "S2",
    type: "SLIDER_LIKERT",
    label: "Question Two",
    isRequired: true,
    scale: { min: 0, max: 3, step: 1, anchorMin: "lo", anchorMax: "hi" },
  },
];

const baseProps = {
  campaignAlias: ALIAS,
  campaignName: "Team Alpha Assessment",
  campaignDescription: null,
  templateName: "Rockefeller",
  isOpen: true,
  status: "ACTIVE" as const,
  openAtIso: new Date(Date.now() - 86_400_000).toISOString(),
  closeAtIso: null,
  sections,
  questions,
};

/** Advance intro → info → fill public-taker fields → form step. */
function reachFormStep() {
  // intro
  fireEvent.click(screen.getByTestId("quiz-start"));
  // info — public taker fields
  fireEvent.change(screen.getByTestId("quiz-first-name"), { target: { value: "Ada" } });
  fireEvent.change(screen.getByTestId("quiz-last-name"), { target: { value: "Lovelace" } });
  fireEvent.change(screen.getByTestId("quiz-email"), { target: { value: "ada@example.com" } });
  fireEvent.click(screen.getByTestId("quiz-info-next"));
}

describe("PublicQuizClient — SectionPager wiring", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("renders one section per screen via the pager (not stacked)", () => {
    render(<PublicQuizClient {...baseProps} />);
    reachFormStep();

    // Pager owns progress: "Section 1 of 2".
    expect(screen.getByText(/section 1 of 2/i)).toBeInTheDocument();

    // First section's question is visible; the second section's is NOT yet.
    expect(screen.getByText("Question One")).toBeInTheDocument();
    expect(screen.queryByText("Question Two")).not.toBeInTheDocument();
  });

  it("G1: a section WITH a description renders the 'What this section covers' callout AND its question on the SAME screen (no separate Begin step)", () => {
    // Wave G merged the per-section intro into the same page as its questions —
    // applied UNIFORMLY, including the LIVE public quiz (G1). A described section
    // must render its "What this section covers" callout + first question TOGETHER,
    // with NO intermediate "Begin section" affordance.
    const describedSections = [
      { stableKey: "S1", sortOrder: 1, name: "Strategy", description: "How you set direction." },
      { stableKey: "S2", sortOrder: 2, name: "Section Two" },
    ];
    const describedQuestions = [
      {
        stableKey: "q1",
        sortOrder: 1,
        sectionStableKey: "S1",
        type: "SLIDER_LIKERT",
        label: "Strategy Question",
        isRequired: true,
        scale: { min: 0, max: 3, step: 1, anchorMin: "lo", anchorMax: "hi" },
      },
      {
        stableKey: "q2",
        sortOrder: 2,
        sectionStableKey: "S2",
        type: "SLIDER_LIKERT",
        label: "Question Two",
        isRequired: true,
        scale: { min: 0, max: 3, step: 1, anchorMin: "lo", anchorMax: "hi" },
      },
    ];

    render(
      <PublicQuizClient
        {...baseProps}
        sections={describedSections}
        questions={describedQuestions}
      />,
    );
    reachFormStep();

    // On the FIRST screen, simultaneously (no intermediate click):
    // the description callout label, the description text, AND the question label.
    expect(screen.getByText(/what this section covers/i)).toBeInTheDocument();
    expect(screen.getByText(/how you set direction/i)).toBeInTheDocument();
    expect(screen.getByText("Strategy Question")).toBeInTheDocument();

    // No "Begin section" affordance — the merged page has no separate intro step.
    expect(
      screen.queryByRole("button", { name: /begin section/i }),
    ).not.toBeInTheDocument();

    // The only forward affordance is the pager's Next/Submit button.
    expect(
      screen.getByRole("button", { name: /next|submit/i }),
    ).toBeInTheDocument();
  });

  it("submits the unchanged payload shape and shows results in-place on success (Task 7)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          submissionId: "sub_pager_1",
          scoreResult: {
            perQuestion: [],
            perSection: [],
            overallTotal: 0,
            overallAverage: 0,
            countAchieved: 0,
            tier: null,
            tierMetricValue: 0,
            unansweredKeys: [],
          },
          redirectUrl: "/quiz/team-alpha/thank-you",
        },
      }),
    });

    render(<PublicQuizClient {...baseProps} />);

    // The draft key is computed inside the component on first render; recompute
    // it the same way and seed a value so we can assert clearDraft removed it.
    const key = publicDraftKey(ALIAS);
    localStorage.setItem(key, JSON.stringify({ q1: 1 }));

    reachFormStep();

    // Section 1 — answer q1 by dragging the slider to value 2, then Next.
    fireEvent.change(screen.getByRole("slider"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Section 2 — answer q2 (max value 3, anchored "hi"), then Submit.
    expect(screen.getByText(/section 2 of 2/i)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(`/api/quiz/${ALIAS}/submit`);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.publicTaker).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
    });
    expect(body.answers).toEqual(
      expect.arrayContaining([
        { stableKey: "q1", value: 2 },
        { stableKey: "q2", value: 3 },
      ]),
    );
    expect(body.answers).toHaveLength(2);

    // Task 7: results render in-place; router.push is NOT called.
    await waitFor(() =>
      expect(screen.getByTestId("quiz-results")).toBeInTheDocument(),
    );
    expect(mockPush).not.toHaveBeenCalled();

    // Draft cleared on success.
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("prunes a stale draft answer key (no longer a rendered question) from the submit POST body (R3-M2)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          submissionId: "sub_prune_1",
          scoreResult: {
            perQuestion: [],
            perSection: [],
            overallTotal: 0,
            overallAverage: 0,
            countAchieved: 0,
            tier: null,
            tierMetricValue: 0,
            unansweredKeys: [],
          },
        },
      }),
    });

    // Seed a draft with a STALE key ("removedQ") that maps to no current
    // question, alongside a valid answer, BEFORE mount so the hook hydrates it.
    localStorage.setItem(
      publicDraftKey(ALIAS),
      JSON.stringify({ q1: 2, removedQ: 9 }),
    );

    render(<PublicQuizClient {...baseProps} />);
    reachFormStep();

    // Answer q1 explicitly (don't depend on debounced draft restore), advance,
    // answer q2, and submit. The stale "removedQ" must not reach the server.
    fireEvent.change(screen.getByRole("slider"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText(/section 2 of 2/i)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    const keys = body.answers.map((a: { stableKey: string }) => a.stableKey);
    // The stale key is gone; only the two real questions are POSTed.
    expect(keys).not.toContain("removedQ");
    expect(keys.sort()).toEqual(["q1", "q2"]);
  });

  it("still renders the intro and info phases with the public-taker fields intact", () => {
    render(<PublicQuizClient {...baseProps} />);
    // intro
    expect(screen.getByTestId("quiz-start")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("quiz-start"));
    // info — all three public-taker fields
    expect(screen.getByTestId("quiz-first-name")).toBeInTheDocument();
    expect(screen.getByTestId("quiz-last-name")).toBeInTheDocument();
    expect(screen.getByTestId("quiz-email")).toBeInTheDocument();
  });

  it("info step does NOT promise emailed results (D3 policy)", () => {
    render(<PublicQuizClient {...baseProps} />);
    fireEvent.click(screen.getByTestId("quiz-start"));
    // Old false promises must be absent
    expect(screen.queryByText(/send your results to the email/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/email your scoring summary/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/check your spam/i)).not.toBeInTheDocument();
    // Invited-flow wording must be absent on the public lead-magnet (PR #47).
    expect(screen.queryByText(/facilitator will follow up/i)).not.toBeInTheDocument();
    // Accurate public copy must be present.
    expect(screen.getByText(/show you your results/i)).toBeInTheDocument();
  });

  it("Screen 1 (welcome) renders the value-prop 'what to expect' list and stat chips from ACTUAL data", () => {
    render(<PublicQuizClient {...baseProps} />);
    // The de-bared welcome renders the value-prop expectation list...
    const expectations = screen.getByTestId("welcome-expectations");
    expect(expectations).toBeInTheDocument();
    expect(within(expectations).getByText(/honest & confidential/i)).toBeInTheDocument();
    // ...and the stat chips reflect the real counts (2 questions, 2 sections)
    // and the derived 0–3 scale — NOT hardcoded 38/5/1–5.
    const stats = screen.getByTestId("welcome-stats");
    // 2 questions + 2 sections → both chips read "2"; the scale chip reads "0–3".
    expect(within(stats).getAllByText("2")).toHaveLength(2);
    expect(within(stats).getByText("0–3")).toBeInTheDocument(); // derived from the slider scale
    expect(within(stats).queryByText("38")).not.toBeInTheDocument();
    // The expectation row also states the real count + scale.
    expect(within(expectations).getByText(/2 short statements, rated 0–3\./i)).toBeInTheDocument();
  });
});
