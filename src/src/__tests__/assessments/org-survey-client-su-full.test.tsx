/**
 * Wave J-1 — OrgSurveyClient gates the SU-Full CEO background section.
 *
 * The S_BACKGROUND section (CEO FTE questions) must be shown ONLY to the CEO.
 * Team members never see (nor answer) it: the client drops that page from the
 * pager, and section/progress counts stay correct.
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { OrgSurveyClient } from "@/components/assessments/org-survey-client";

const ALIAS = "su-full-invited";
const SU_FULL = "scaling-up-full";

function suFullData(isCEO: boolean) {
  return {
    isCEO,
    respondentKey: "resp-su-full",
    campaign: { name: "Scaling Up Full", alias: ALIAS, templateAlias: SU_FULL },
    version: { language: "en" },
    sections: [
      { stableKey: "S_BACKGROUND", sortOrder: 0, name: "Background" },
      { stableKey: "S1", sortOrder: 1, name: "People" },
    ],
    questions: [
      {
        stableKey: "Q_FTE_CONTRACT",
        sortOrder: 1,
        sectionStableKey: "S_BACKGROUND",
        type: "NUMBER",
        label: "Number of employees (FTE)",
        isRequired: true,
      },
      {
        stableKey: "q1",
        sortOrder: 2,
        sectionStableKey: "S1",
        type: "SLIDER_LIKERT",
        label: "Q1",
        isRequired: true,
        scale: { min: 0, max: 3, step: 1, anchorMin: "lo", anchorMax: "hi" },
      },
    ],
  };
}

function mockMe(isCEO: boolean) {
  global.fetch = jest.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/me")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: suFullData(isCEO) }),
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { submissionId: "sub_1" } }),
    } as Response);
  }) as unknown as typeof fetch;
}

async function reachPager() {
  render(<OrgSurveyClient campaignAlias={ALIAS} />);
  const start = await screen.findByRole("button", {
    name: /start the assessment/i,
  });
  fireEvent.click(start);
}

describe("OrgSurveyClient — SU-Full CEO background gating", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("the CEO SEES the S_BACKGROUND section as the first page (2 sections)", async () => {
    mockMe(true);
    await reachPager();
    expect(
      await screen.findByRole("heading", { name: "Background" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/section 1 of 2/i)).toBeInTheDocument();
  });

  it("a team member (non-CEO) does NOT see S_BACKGROUND; the survey opens on the first real section (1 section)", async () => {
    mockMe(false);
    await reachPager();
    // Background is dropped → opens on People.
    expect(
      await screen.findByRole("heading", { name: "People" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Background" })).not.toBeInTheDocument();
    // Count reflects the dropped section.
    expect(screen.getByText(/section 1 of 1/i)).toBeInTheDocument();
  });
});
