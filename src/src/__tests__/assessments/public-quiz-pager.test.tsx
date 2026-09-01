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
import { formatTimestamp } from "@/lib/utils";

const ALIAS = "team-alpha";
const LVA_ALIAS = "leadership-vision-alignment";

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

  it.each([
    {
      name: "future public assessment",
      status: "ACTIVE" as const,
      nowIso: "2026-01-01T00:00:00.000Z",
      openAtIso: "2026-01-02T12:00:00.000Z",
      closeAtIso: null,
      displayedAtIso: "2026-01-02T12:00:00.000Z",
      messagePrefix: "This assessment opens",
    },
    {
      name: "past-closing public assessment",
      status: "ACTIVE" as const,
      nowIso: "2026-01-03T00:00:00.000Z",
      openAtIso: "2025-12-01T12:00:00.000Z",
      closeAtIso: "2026-01-02T12:00:00.000Z",
      displayedAtIso: "2026-01-02T12:00:00.000Z",
      messagePrefix: "This assessment closed on",
    },
  ])("renders a medium-format date in the unavailable notice for a $name", ({
    status,
    nowIso,
    openAtIso,
    closeAtIso,
    displayedAtIso,
    messagePrefix,
  }) => {
    // This fails if the notice falls back to Date#toLocaleDateString(), which
    // produces the slash-form dates the BUG-05 guard was added to prevent.
    jest.useFakeTimers().setSystemTime(new Date(nowIso));
    const localDateSpy = jest
      .spyOn(Date.prototype, "toLocaleDateString")
      .mockReturnValue("1/2/2026");

    try {
      render(
        <PublicQuizClient
          {...baseProps}
          isOpen={false}
          status={status}
          openAtIso={openAtIso}
          closeAtIso={closeAtIso}
        />,
      );

      expect(
        screen.getByText(
          `${messagePrefix} ${formatTimestamp(displayedAtIso)}.`,
        ),
      ).toBeInTheDocument();
      expect(localDateSpy).not.toHaveBeenCalled();
    } finally {
      localDateSpy.mockRestore();
      jest.useRealTimers();
    }
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

  it("renders the configured full contact form from templateAlias without Coach Email", () => {
    render(<PublicQuizClient {...baseProps} templateAlias="scaling-up-quick" />);
    fireEvent.click(screen.getByTestId("quiz-start"));

    const expectedFields = [
      ["First name", "100"],
      ["Last name", "100"],
      ["Email", "320"],
      ["Phone", "50"],
      ["Title", "100"],
      ["Company", "200"],
      ["Number of employees", "100"],
      ["City", "100"],
      ["State", "100"],
    ] as const;

    for (const [label, maxLength] of expectedFields) {
      expect(screen.getByLabelText(label)).toHaveAttribute("maxlength", maxLength);
    }
    expect(screen.getByLabelText("State")).not.toBeRequired();
    expect(screen.getByLabelText("Country")).toBeRequired();
    expect(screen.getByLabelText("Country").tagName).toBe("SELECT");
    expect(screen.getByRole("option", { name: "Select..." })).toHaveValue("");
    expect(screen.getByLabelText("Number of employees")).toHaveAttribute("type", "text");
    expect(screen.queryByLabelText(/coach email/i)).not.toBeInTheDocument();
  });

  it("describes all collected contact information and links the retention policy", () => {
    render(<PublicQuizClient {...baseProps} templateAlias="scaling-up-quick" />);
    fireEvent.click(screen.getByTestId("quiz-start"));

    expect(screen.getByText(/contact information you provide/i)).toBeInTheDocument();
    expect(screen.queryByText(/use your name and email/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /privacy policy/i })).toHaveAttribute(
      "href",
      "https://scalingup.com/privacy-policy/",
    );
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
          reportStyle: "CLASSIC",
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

  it("submits every configured full-assessment contact value and omits blank optional State", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          submissionId: "sub_full_contact",
          reportStyle: "CLASSIC",
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
    render(
      <PublicQuizClient
        {...baseProps}
        templateAlias="scaling-up-quick"
        sections={[sections[0]]}
        questions={[questions[0]]}
      />,
    );
    fireEvent.click(screen.getByTestId("quiz-start"));

    const values: Record<string, string> = {
      "First name": "Ada",
      "Last name": "Lovelace",
      Email: "ada@example.com",
      Phone: "+44 20 7946 0958",
      Title: "Founder",
      Company: "Analytical Engines Ltd",
      "Number of employees": "42",
      City: "London",
    };
    for (const [label, value] of Object.entries(values)) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    fireEvent.change(screen.getByLabelText("Country"), { target: { value: "GB" } });
    fireEvent.click(screen.getByTestId("quiz-info-next"));
    fireEvent.change(screen.getByRole("slider"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse((init as RequestInit).body as string).publicTaker).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      phone: "+44 20 7946 0958",
      jobTitle: "Founder",
      company: "Analytical Engines Ltd",
      numberOfEmployees: "42",
      city: "London",
      country: "GB",
    });
  });

  it("prunes a stale draft answer key (no longer a rendered question) from the submit POST body (R3-M2)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          submissionId: "sub_prune_1",
          reportStyle: "CLASSIC",
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

  it("LVA follow-on: shows S5_why fields only for checked S4 factors and prunes hidden typed answers", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          submissionId: "sub_lva_public_1",
          reportStyle: "CLASSIC",
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
    render(
      <PublicQuizClient
        {...baseProps}
        templateName="Leadership Vision Alignment"
        templateAlias={LVA_ALIAS}
        sections={[{ stableKey: "S5", sortOrder: 1, name: "Obstacles" }]}
        questions={[
          {
            stableKey: "S4_biggest_obstacles",
            sortOrder: 1,
            sectionStableKey: "S5",
            type: "MULTI_CHOICE",
            label: "Which factors are hindering you?",
            isRequired: false,
            options: [
              { key: "sales", label: "Sales" },
              { key: "cash", label: "Cash" },
            ],
          },
          {
            stableKey: "S5_why_sales",
            sortOrder: 2,
            sectionStableKey: "S5",
            type: "TEXT",
            label: "Why is Sales a hindrance?",
            isRequired: false,
          },
          {
            stableKey: "S5_why_cash",
            sortOrder: 3,
            sectionStableKey: "S5",
            type: "TEXT",
            label: "Why is Cash a hindrance?",
            isRequired: false,
          },
          {
            stableKey: "S5_other_factor",
            sortOrder: 4,
            sectionStableKey: "S5",
            type: "TEXT",
            label: "Other factor",
            isRequired: false,
          },
          {
            stableKey: "S5_change_one_thing",
            sortOrder: 5,
            sectionStableKey: "S5",
            type: "TEXT",
            label: "What would you change?",
            isRequired: false,
          },
        ]}
      />,
    );
    reachFormStep();

    expect(screen.getByText("Which factors are hindering you?")).toBeInTheDocument();
    expect(screen.getByText("Other factor")).toBeInTheDocument();
    expect(screen.getByText("What would you change?")).toBeInTheDocument();
    expect(screen.queryByText("Why is Sales a hindrance?")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Sales"));
    expect(await screen.findByText("Why is Sales a hindrance?")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Why is Sales a hindrance/i), {
      target: { value: "Need cleaner pipeline ownership" },
    });

    fireEvent.click(screen.getByLabelText("Cash"));
    expect(await screen.findByText("Why is Cash a hindrance?")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Why is Cash a hindrance/i), {
      target: { value: "Receivables are lagging" },
    });

    fireEvent.click(screen.getByLabelText("Sales"));
    await waitFor(() =>
      expect(screen.queryByText("Why is Sales a hindrance?")).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    const answerKeys = body.answers.map((a: { stableKey: string }) => a.stableKey);
    expect(answerKeys).toContain("S4_biggest_obstacles");
    expect(answerKeys).toContain("S5_why_cash");
    expect(answerKeys).not.toContain("S5_why_sales");
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

  it("groups the QSP core-values stories and submits their three stable keys unchanged", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          submissionId: "sub_qsp_public",
          reportStyle: "CLASSIC",
          scoreResult: {
            perQuestion: [], perSection: [], overallTotal: 0, overallAverage: 0,
            countAchieved: 0, tier: null, tierMetricValue: 0, unansweredKeys: [],
          },
        },
      }),
    });
    const qspStoryQuestions = [1, 2, 3].map((index) => ({
      stableKey: `P1_core_values_story_${index}`,
      sortOrder: index,
      sectionStableKey: "P1_retrospective",
      type: "TEXT",
      label: `Core-values story ${index}`,
      isRequired: false,
    }));

    render(
      <PublicQuizClient
        {...baseProps}
        templateAlias="qsp-v2"
        sections={[{ stableKey: "P1_retrospective", sortOrder: 1, name: "Core values" }]}
        questions={qspStoryQuestions}
        qspStoryGroupEnabled
      />,
    );
    reachFormStep();
    expect(screen.getByTestId("qsp-story-group")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Person and story 1 of 3" }), {
      target: { value: "Ada led the launch" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add another person/i }));
    fireEvent.change(screen.getByRole("textbox", { name: "Person and story 2 of 3" }), {
      target: { value: "Grace coached the team" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add another person/i }));
    fireEvent.change(screen.getByRole("textbox", { name: "Person and story 3 of 3" }), {
      target: { value: "Lin removed a blocker" },
    });
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.answers).toEqual([
      { stableKey: "P1_core_values_story_1", value: "Ada led the launch" },
      { stableKey: "P1_core_values_story_2", value: "Grace coached the team" },
      { stableKey: "P1_core_values_story_3", value: "Lin removed a blocker" },
    ]);
  });

  it("info step uses the current delivery disclosure without legacy promises", () => {
    render(<PublicQuizClient {...baseProps} />);
    fireEvent.click(screen.getByTestId("quiz-start"));
    // Old false promises must be absent
    expect(screen.queryByText(/send your results to the email/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/email your scoring summary/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/check your spam/i)).not.toBeInTheDocument();
    // Invited-flow wording must be absent on the public lead-magnet (PR #47).
    expect(screen.queryByText(/facilitator will follow up/i)).not.toBeInTheDocument();
    // Accurate public copy must be present.
    expect(screen.getByText(/contact information you provide/i)).toBeInTheDocument();
  });

  it("Screen 1 (welcome) renders the value-prop 'what to expect' list and stat chips from ACTUAL data", () => {
    const { container } = render(<PublicQuizClient {...baseProps} />);
    // The de-bared welcome renders the value-prop expectation list...
    const expectations = screen.getByTestId("welcome-expectations");
    expect(expectations).toBeInTheDocument();
    expect(
      within(expectations).getByText("How your results are shared"),
    ).toBeInTheDocument();
    expect(
      within(expectations).getByText(
        "You receive your results immediately. Authorized Scaling Up staff can review your full report; your referring coach can too, if you used their link.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/\b(?:confidential|anonymous|private)\b/i),
    ).not.toBeInTheDocument();
    expect(container.querySelector(".su-welcome-fine")).toHaveTextContent(
      "Free to take — you'll get your results on screen and a copy by email.",
    );
    expect(container.querySelector(".su-welcome-fine")).not.toHaveTextContent(
      /responses are also shared/i,
    );
    // ...and the stat chips reflect the real counts (2 questions, 2 sections)
    // and the uniform 0–3 scale — NOT hardcoded 38/5/1–5.
    const stats = screen.getByTestId("welcome-stats");
    // 2 questions + 2 sections → both chips read "2"; the scale chip reads "0–3".
    expect(within(stats).getAllByText("2")).toHaveLength(2);
    expect(within(stats).getByText("0–3")).toBeInTheDocument(); // derived from the slider scale
    expect(stats.querySelectorAll(".su-welcome-chip")).toHaveLength(3);
    expect(within(stats).queryByText("38")).not.toBeInTheDocument();
    // The expectation row also states the real count + scale.
    expect(within(expectations).getByText(/2 short statements, rated 0–3\./i)).toBeInTheDocument();
  });

  it("preserves the existing public presentation when no saved Welcome config is supplied", () => {
    render(
      <PublicQuizClient
        {...baseProps}
        campaignDescription="Campaign-specific public description."
      />,
    );

    expect(screen.getByText("Free assessment")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Team Alpha Assessment" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Campaign-specific public description."),
    ).toBeInTheDocument();
    expect(screen.queryByText("You're invited")).not.toBeInTheDocument();
    expect(screen.queryByText(/coach or facilitator/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/the team stands/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "You receive your results immediately. Authorized Scaling Up staff can review your full report; your referring coach can too, if you used their link.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Free to take — you'll get your results on screen and a copy by email.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start the assessment →" }),
    ).toBeInTheDocument();
  });

  it("renders saved template Welcome copy while keeping question-bank facts derived", () => {
    const { container } = render(
      <PublicQuizClient
        {...baseProps}
        welcomeConfig={{
          schemaVersion: 2,
          eyebrow: "You're invited to take this survey",
          headingTemplate: "Take {{campaignName}} today",
          ledeParagraphs: [
            "This survey is better than chocolate",
            "A second saved paragraph.",
          ],
          sharingHeading: "Your information",
          sharingDescription: "Your coach has access to your data.",
          scoresHeading: "Your category scores",
          scoresDescription: "You will get customized scoring based on your answers.",
          ctaLabel: "Start the assessment Now",
          finePrint: "Return later if you need to.",
        }}
      />,
    );

    expect(screen.getByText("You're invited to take this survey")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Take Team Alpha Assessment today" }),
    ).toBeInTheDocument();
    expect(screen.getByText("This survey is better than chocolate")).toBeInTheDocument();
    expect(screen.getByText("A second saved paragraph.")).toBeInTheDocument();
    const expectations = screen.getByTestId("welcome-expectations");
    expect(within(expectations).getByText("Your information")).toBeInTheDocument();
    expect(
      within(expectations).getByText("Your coach has access to your data."),
    ).toBeInTheDocument();
    expect(within(expectations).getByText("Your category scores")).toBeInTheDocument();
    expect(
      within(expectations).getByText(
        "You will get customized scoring based on your answers.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start the assessment Now →" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Return later if you need to.")).toBeInTheDocument();
    expect(container.querySelector(".su-welcome-fine")).toHaveTextContent(
      "Return later if you need to.",
    );

    expect(within(expectations).getByText(/2 short statements, rated 0–3\./i)).toBeInTheDocument();
    const stats = screen.getByTestId("welcome-stats");
    expect(within(stats).getAllByText("2")).toHaveLength(2);
    expect(within(stats).getByText("0–3")).toBeInTheDocument();
  });
});
