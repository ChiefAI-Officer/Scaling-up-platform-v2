import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
  }),
}));

import { OrgSurveyClient } from "@/components/assessments/org-survey-client";
import { invitedDraftKey } from "@/lib/assessments/use-answer-draft";

const ALIAS = "retryable-invited";
const RESPONDENT_KEY = "invitation-retry-1";
const DRAFT_KEY = invitedDraftKey(RESPONDENT_KEY);

const surveyData = {
  respondentKey: RESPONDENT_KEY,
  campaign: {
    name: "Retryable Assessment",
    alias: ALIAS,
    templateAlias: "rockefeller",
  },
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
  ],
};

describe("OrgSurveyClient — retryable submit preserves the autosaved draft", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    window.history.replaceState(null, "", "/");
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ q1: 2 }));

    let submitAttempts = 0;
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: surveyData }),
        } as Response);
      }
      if (url.includes("/submit")) {
        submitAttempts += 1;
        if (submitAttempts === 1) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: async () => ({ error: "Failed to submit answers" }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: { submissionId: "submission-1" },
          }),
        } as Response);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    cleanup();
  });

  it("preserves the autosaved answer draft after a retryable 500, then clears it after 200", async () => {
    render(<OrgSurveyClient campaignAlias={ALIAS} />);
    fireEvent.click(
      await screen.findByRole("button", { name: /start the assessment/i }),
    );

    await waitFor(() => {
      expect((screen.getByRole("slider") as HTMLInputElement).value).toBe("2");
    });

    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Failed to submit answers");
    expect(screen.getByRole("button", { name: /submit/i })).toBeEnabled();
    expect(localStorage.getItem(DRAFT_KEY)).toBe(JSON.stringify({ q1: 2 }));
    expect(mockPush).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => expect(localStorage.getItem(DRAFT_KEY)).toBeNull());
    expect(mockPush).toHaveBeenCalledWith(
      `/org-survey/${ALIAS}/thank-you`,
    );
  });
});
