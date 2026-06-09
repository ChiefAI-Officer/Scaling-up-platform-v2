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

    // BrandedReport renders the assessment name.
    expect(screen.getByText("Scaling Up Full")).toBeInTheDocument();

    // ScaleUp score headline "60 / 100" must appear.
    expect(screen.getByText(/60\s*\/\s*100/)).toBeInTheDocument();

    // router.push must NOT have been called.
    expect(mockPush).not.toHaveBeenCalled();
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
});
