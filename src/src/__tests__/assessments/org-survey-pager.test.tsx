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
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

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

const surveyData = {
  campaign: { name: "Invited Assessment", alias: ALIAS },
  version: { language: "en" },
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
  // intro phase: "Start Assessment"
  const start = await screen.findByRole("button", { name: /start assessment/i });
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

    // Answer the required slider, then advance.
    fireEvent.change(screen.getByLabelText(/Q1/i), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // The "Other" page now renders the orphan question (previously invisible).
    expect(await screen.findByText(/section 2 of 2/i)).toBeInTheDocument();
    expect(screen.getByText("Orphan Q")).toBeInTheDocument();
    // And it is answerable.
    const orphanField = screen.getByLabelText(/Orphan Q/i) as HTMLTextAreaElement;
    expect(orphanField).toBeInTheDocument();
  });

  it("submits BOTH answers and reaches thank-you (no dead-end)", async () => {
    await reachPager();

    await screen.findByText(/section 1 of 2/i);
    fireEvent.change(screen.getByLabelText(/Q1/i), { target: { value: "2" } });
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

  it("hydrates answers from invitedDraftKey(alias) localStorage on mount", async () => {
    // Seed a draft BEFORE mount.
    const key = invitedDraftKey(ALIAS);
    localStorage.setItem(key, JSON.stringify({ q1: 3, orphanReq: "restored" }));

    await reachPager();
    await screen.findByText(/section 1 of 2/i);

    // The slider reflects the restored value 3.
    const slider = screen.getByLabelText(/Q1/i) as HTMLInputElement;
    expect(slider.value).toBe("3");

    // Advance to the Other page and confirm the orphan textarea restored.
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText(/section 2 of 2/i);
    const orphanField = screen.getByLabelText(/Orphan Q/i) as HTMLTextAreaElement;
    expect(orphanField.value).toBe("restored");
  });
});
