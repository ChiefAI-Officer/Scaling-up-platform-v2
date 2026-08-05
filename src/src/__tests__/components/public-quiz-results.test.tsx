/**
 * Task 7 — Public quiz in-place results via BrandedReport.
 *
 * Asserts:
 *  1. Consent line (quiz-consent) is visible during the "form" step.
 *  2. After a successful submit the quiz-results region renders (BrandedReport
 *     content — assessment name / ScaleUp "/ 100" headline) and router.push
 *     is NOT called.
 *  3. The POST body includes idempotencyKey: "idem-test-123".
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ScoreResult } from "@/lib/assessments/scoring";

// ── crypto.randomUUID stub (jsdom ships without it) ──────────────────────
Object.defineProperty(globalThis, "crypto", {
  value: { randomUUID: () => "idem-test-123" },
  configurable: true,
});

const mockPush = jest.fn();
// Mutable search-param store so individual tests can simulate `?coach=<ref>`.
let mockSearchParams: Record<string, string> = {};
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
  }),
  useSearchParams: () => ({
    get: (key: string) => mockSearchParams[key] ?? null,
  }),
  usePathname: () => "/",
}));

import { PublicQuizClient } from "@/components/assessments/public-quiz-client";

// ── Test fixtures ─────────────────────────────────────────────────────────

const ALIAS = "quick-test";

const sections = [
  { stableKey: "S1", sortOrder: 1, name: "People" },
];
const questions = [
  {
    stableKey: "q1",
    sortOrder: 1,
    sectionStableKey: "S1",
    type: "SLIDER_LIKERT",
    label: "How aligned is your team?",
    isRequired: true,
    scale: { min: 0, max: 10, step: 1, anchorMin: "Not at all", anchorMax: "Fully" },
  },
];

const baseProps = {
  campaignAlias: ALIAS,
  campaignName: "Q1 Team Alignment",
  campaignDescription: null,
  templateName: "Scaling Up Full",
  isOpen: true,
  status: "ACTIVE" as const,
  openAtIso: new Date(Date.now() - 86_400_000).toISOString(),
  closeAtIso: null,
  sections,
  questions,
};

/** ScoreResult fixture with scaleUpScore so BrandedReport renders "60 / 100". */
const scoreResultFixture: ScoreResult = {
  perQuestion: [],
  perSection: [],
  perDomain: [
    {
      key: "people",
      label: "People",
      averagePoints: 6,
      answeredSectionCount: 1,
      totalSectionCount: 1,
      tier: null,
    },
    {
      key: "strategy",
      label: "Strategy",
      averagePoints: 5,
      answeredSectionCount: 1,
      totalSectionCount: 1,
      tier: null,
    },
    {
      key: "execution",
      label: "Execution",
      averagePoints: 7,
      answeredSectionCount: 1,
      totalSectionCount: 1,
      tier: null,
    },
    {
      key: "cash",
      label: "Cash",
      averagePoints: 6,
      answeredSectionCount: 1,
      totalSectionCount: 1,
      tier: null,
    },
  ],
  overallTotal: 60,
  overallAverage: 6,
  countAchieved: 0,
  tier: { label: "Developing", message: "Keep building your habits." },
  tierMetricValue: 6,
  scaleUpScore: 60,
  unansweredKeys: [],
};

/** Helper: drive intro → info → form step. */
function reachFormStep() {
  fireEvent.click(screen.getByTestId("quiz-start"));
  fireEvent.change(screen.getByTestId("quiz-first-name"), { target: { value: "Jane" } });
  fireEvent.change(screen.getByTestId("quiz-last-name"), { target: { value: "Doe" } });
  fireEvent.change(screen.getByTestId("quiz-email"), { target: { value: "jane@example.com" } });
  fireEvent.click(screen.getByTestId("quiz-info-next"));
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("PublicQuizClient — in-place results + consent + idempotency (Task 7)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    mockSearchParams = {};
  });

  // ── T7-1: Consent line visible during the form step ─────────────────────
  it("shows the consent line during the form step", () => {
    render(<PublicQuizClient {...baseProps} />);
    reachFormStep();

    const consent = screen.getByTestId("quiz-consent");
    expect(consent).toBeInTheDocument();
    expect(consent).toHaveTextContent(/submitting.*you agree/i);
    expect(consent).toHaveTextContent(/coach who referred you/i);
  });

  // ── T7-2: On success: render results in-place; router.push NOT called ───
  it("renders quiz-results region with BrandedReport content after successful submit", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          submissionId: "sub_1",
          reportStyle: "CLASSIC",
          scoreResult: scoreResultFixture,
          redirectUrl: `/quiz/${ALIAS}/thank-you`,
        },
      }),
    });

    render(<PublicQuizClient {...baseProps} />);
    reachFormStep();

    // Answer q1 via the slider and submit.
    fireEvent.change(screen.getByRole("slider"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    // Results region rendered.
    await waitFor(() =>
      expect(screen.getByTestId("quiz-results")).toBeInTheDocument(),
    );

    // The report MUST be wrapped in `.su-public-brand .su-report` so the scoped
    // su-report.css applies on-screen (else it renders bare — the in-place CSS bug).
    const reportWrapper = screen
      .getByTestId("quiz-results")
      .querySelector(".su-public-brand.su-report");
    expect(reportWrapper).not.toBeNull();

    const printButton = screen.getByRole("button", { name: "Print" });
    const downloadButton = screen.getByRole("button", { name: "Download PDF" });
    expect(reportWrapper).toContainElement(printButton);
    expect(reportWrapper).toContainElement(downloadButton);
    expect(screen.getAllByRole("button", { name: "Print" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Download PDF" })).toHaveLength(1);

    const originalTitle = document.title;
    Object.defineProperty(window, "print", {
      value: jest.fn(),
      configurable: true,
    });
    fireEvent.click(downloadButton);
    expect(document.title).toBe("Scaling Up Full — Jane Doe");
    window.dispatchEvent(new Event("afterprint"));
    expect(document.title).toBe(originalTitle);

    // BrandedReport renders the assessment name.
    expect(screen.getByText("Scaling Up Full")).toBeInTheDocument();

    // ScaleUp score headline "60 / 100" must appear.
    expect(screen.getByText(/60\s*\/\s*100/)).toBeInTheDocument();

    // router.push must NOT have been called.
    expect(mockPush).not.toHaveBeenCalled();
  });

  // ── F4 (Wave OSR / Jeff #71 review): templateAlias must reach BrandedReport ─
  //
  // The hand-built RespondentReport here OMITTED templateAlias, so every public
  // report silently resolved to DEFAULT_REPORT_CONFIG no matter the instrument.
  // These tests make the wiring observable: RockHabits sets showScoreTable:false
  // while DEFAULT sets true, so the score table's presence IS the signal that
  // the alias flowed through. Positive/negative control — neither can pass
  // vacuously. The third test covers the qualitative dispatch, which is the
  // starkest consequence (a wholly different renderer) and was otherwise
  // exercised by nothing.
  async function submitAndRender(props: { templateAlias?: string } = {}) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          submissionId: "sub_1",
          reportStyle: "CLASSIC",
          scoreResult: scoreResultFixture,
          redirectUrl: `/quiz/${ALIAS}/thank-you`,
        },
      }),
    });
    render(<PublicQuizClient {...baseProps} {...props} />);
    reachFormStep();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    await waitFor(() =>
      expect(screen.getByTestId("quiz-results")).toBeInTheDocument(),
    );
  }

  it("honours a mapped templateAlias — RockHabits hides the score table", async () => {
    await submitAndRender({ templateAlias: "RockHabits" });
    expect(screen.queryByTestId("report-scores-table")).toBeNull();
  });

  it("positive control — with no alias the DEFAULT config still shows it", async () => {
    await submitAndRender();
    expect(screen.getByTestId("report-scores-table")).toBeInTheDocument();
  });

  it("a qualitative alias swaps the renderer without crashing on the public payload", async () => {
    // The public payload is thinner than the authorized one — scoringConfig is
    // undefined and provenance.versionId is "" — so the qualitative path had to
    // be proven to render rather than throw. qsp-v2 is reportType "qualitative".
    await submitAndRender({ templateAlias: "qsp-v2" });
    const results = screen.getByTestId("quiz-results");
    expect(results).toBeInTheDocument();
    // Scored chrome must be gone: no score table, no "/ 100" ScaleUp headline.
    expect(screen.queryByTestId("report-scores-table")).toBeNull();
    expect(screen.queryByText(/60\s*\/\s*100/)).toBeNull();
  });

  // ── T7-3: POST body includes idempotencyKey ──────────────────────────────
  it("sends idempotencyKey in the POST body", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          submissionId: "sub_1",
          reportStyle: "CLASSIC",
          scoreResult: scoreResultFixture,
          redirectUrl: `/quiz/${ALIAS}/thank-you`,
        },
      }),
    });

    render(<PublicQuizClient {...baseProps} />);
    reachFormStep();

    fireEvent.change(screen.getByRole("slider"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(`/api/quiz/${ALIAS}/submit`);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.idempotencyKey).toBe("idem-test-123");
  });

  // ── T7-4: Consent line is NOT visible on intro/info steps ───────────────
  it("does not show the consent line on the intro or info steps", () => {
    render(<PublicQuizClient {...baseProps} />);

    // Intro step: no consent.
    expect(screen.queryByTestId("quiz-consent")).not.toBeInTheDocument();

    // Info step: no consent.
    fireEvent.click(screen.getByTestId("quiz-start"));
    expect(screen.queryByTestId("quiz-consent")).not.toBeInTheDocument();
  });

  // ── Public-flow intro copy is accurate (not invited-flow wording) ────────
  it("uses public lead-magnet intro copy, not invited 'coach who sent this' wording", () => {
    render(<PublicQuizClient {...baseProps} />);

    // Public, honest eyebrow — not the invited "You're invited".
    expect(screen.getByText(/free assessment/i)).toBeInTheDocument();
    expect(screen.queryByText(/you're invited/i)).not.toBeInTheDocument();

    // The misleading invited claims must be gone from the public intro.
    expect(
      screen.queryByText(/coach who sent this/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/facilitator will follow up/i)).not.toBeInTheDocument();
  });

  // ── §4: ?coach=<ref> is forwarded as referringCoachEmail in the POST body ──
  it("sends the ?coach= param as referringCoachEmail in the submit body", async () => {
    mockSearchParams = { coach: "coach@example.com" };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          submissionId: "sub_1",
          reportStyle: "CLASSIC",
          scoreResult: scoreResultFixture,
          redirectUrl: `/quiz/${ALIAS}/thank-you`,
        },
      }),
    });

    render(<PublicQuizClient {...baseProps} />);
    reachFormStep();

    fireEvent.change(screen.getByRole("slider"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.referringCoachEmail).toBe("coach@example.com");
  });

  it("uses only the server-verified coach email in the results CTA", async () => {
    mockSearchParams = { coach: "forged@example.com" };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          submissionId: "sub_1",
          reportStyle: "CLASSIC",
          scoreResult: scoreResultFixture,
          referringCoachEmail: "verified@example.com",
          redirectUrl: `/quiz/${ALIAS}/thank-you`,
        },
      }),
    });

    render(<PublicQuizClient {...baseProps} />);
    reachFormStep();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() =>
      expect(screen.getByTestId("quiz-results")).toBeInTheDocument(),
    );

    expect(screen.getByText(/jane@example\.com/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /talk to a coach/i }),
    ).toHaveAttribute("href", "mailto:verified%40example.com");
    expect(document.querySelector('a[href="mailto:forged%40example.com"]')).toBeNull();
  });

  it("does not trust the query email when the server does not verify a coach", async () => {
    mockSearchParams = { coach: "forged@example.com" };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          submissionId: "sub_1",
          reportStyle: "CLASSIC",
          scoreResult: scoreResultFixture,
          referringCoachEmail: null,
          redirectUrl: `/quiz/${ALIAS}/thank-you`,
        },
      }),
    });

    render(<PublicQuizClient {...baseProps} />);
    reachFormStep();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() =>
      expect(screen.getByTestId("quiz-results")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("link", { name: /talk to a coach/i }),
    ).toHaveAttribute("href", "https://scalingup.com/coaches");
  });

  it("omits referringCoachEmail entirely when no ?coach= param is present", async () => {
    // mockSearchParams reset to {} in beforeEach → no coach.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          submissionId: "sub_1",
          reportStyle: "CLASSIC",
          scoreResult: scoreResultFixture,
          redirectUrl: `/quiz/${ALIAS}/thank-you`,
        },
      }),
    });

    render(<PublicQuizClient {...baseProps} />);
    reachFormStep();

    fireEvent.change(screen.getByRole("slider"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).not.toHaveProperty("referringCoachEmail");
  });

  // ── §5: consent + info copy disclose the emailed copy honestly ──────────
  it("consent line discloses the emailed copy + full report to the referring coach", () => {
    render(<PublicQuizClient {...baseProps} />);
    reachFormStep();

    const consent = screen.getByTestId("quiz-consent");
    expect(consent).toHaveTextContent(/emailed to you/i);
    expect(consent).toHaveTextContent(/full report/i);
    expect(
      screen.queryByRole("link", { name: "Privacy Policy" }),
    ).not.toBeInTheDocument();
  });

  it("shows the feature-matched verified-Coach disclosure and privacy link", () => {
    render(
      <PublicQuizClient
        {...baseProps}
        referredResultsEnabled
      />,
    );
    reachFormStep();

    const consent = screen.getByTestId("quiz-consent");
    expect(consent).toHaveTextContent(
      "available to that verified coach while their account remains active",
    );
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
      "href",
      "https://scalingup.com/privacy-policy/",
    );
  });
});
