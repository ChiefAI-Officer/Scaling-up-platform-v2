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
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

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

  it("submits the unchanged payload shape and clears the draft on success", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { redirectUrl: "/quiz/team-alpha/thank-you" } }),
    });

    render(<PublicQuizClient {...baseProps} />);

    // The draft key is computed inside the component on first render; recompute
    // it the same way and seed a value so we can assert clearDraft removed it.
    const key = publicDraftKey(ALIAS);
    localStorage.setItem(key, JSON.stringify({ q1: 1 }));

    reachFormStep();

    // Section 1 — answer q1 via the shared range input, then Next.
    const q1Input = screen.getByLabelText(/Question One/i) as HTMLInputElement;
    fireEvent.change(q1Input, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Section 2 — answer q2, then Submit.
    expect(screen.getByText(/section 2 of 2/i)).toBeInTheDocument();
    const q2Input = screen.getByLabelText(/Question Two/i) as HTMLInputElement;
    fireEvent.change(q2Input, { target: { value: "3" } });
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

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/quiz/team-alpha/thank-you"));

    // Draft cleared on success.
    expect(localStorage.getItem(key)).toBeNull();
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
});
