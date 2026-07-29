/**
 * Wave OSR (Jeff #71) — the invited survey client's in-place report.
 *
 * The load-bearing test here is the REHYDRATE AUTHORIZATION ordering. The first
 * cut of this feature read the sessionStorage slot before calling `/me`, which
 * served a full report — name, answers, scores — to whoever next reloaded an
 * abandoned tab, with no token at all (the exchange strips the fragment, so a
 * tokenless reload is the common path). Caught in review of PR #236.
 *
 * The rule these tests pin: the slot is NOT a credential. Rehydrate only after
 * `/me` answers 410, which requires a live sealed invitation cookie. Anything
 * else purges the slot.
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { OrgSurveyClient } from "@/components/assessments/org-survey-client";
import {
  writeOnScreenResult,
  readOnScreenResult,
} from "@/lib/assessments/onscreen-result-store";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const ALIAS = "demo-campaign";

const REPORT = {
  respondentName: "Resp Ondent",
  jobTitle: null,
  companyName: "Spectrum Health",
  assessmentName: "Rockefeller Habits Checklist",
  templateAlias: "RockHabits",
  campaignLabel: "Q3 2026",
  submittedAt: new Date("2026-07-29T10:30:00.000Z"),
  result: {
    totalScore: 24,
    maxScore: 40,
    countAchieved: 12,
    sectionScores: [],
    tier: { label: "Developing", message: "Keep going." },
  },
  sections: [],
  questionByKey: {},
  questionsByKey: {},
  rawAnswers: [],
  scoringConfig: undefined,
  provenance: {
    submissionId: "sub-1",
    versionId: "",
    contentHash: "",
    templateName: "Rockefeller Habits Checklist",
  },
  degraded: false,
} as never;

/** Install a fetch that answers /me with the given status. */
function installFetch(meStatus: number) {
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : String(input);
    if (url.includes("/me")) {
      if (meStatus === 200) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              respondentKey: "inv-1",
              campaign: { name: "Demo", alias: ALIAS, templateAlias: "RockHabits" },
              version: { language: "en" },
              sections: [{ stableKey: "s1", sortOrder: 1, name: "S1" }],
              questions: [],
            },
          }),
        } as unknown as Response;
      }
      return {
        ok: false,
        status: meStatus,
        json: async () => ({ success: false, error: "gate" }),
      } as unknown as Response;
    }
    return {
      ok: false,
      status: 404,
      json: async () => ({ success: false }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  window.sessionStorage.clear();
  // No #t= fragment — this is the plain-reload case, which is exactly the path
  // the exchange purge does NOT cover.
  window.history.replaceState(null, "", `/org-survey/${ALIAS}`);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("rehydrate authorization (the /me 410 gate)", () => {
  it("RENDERS the stored report when /me answers 410 — a live cookie past its gate", async () => {
    writeOnScreenResult(ALIAS, REPORT);
    installFetch(410);

    render(<OrgSurveyClient campaignAlias={ALIAS} />);

    await waitFor(() => {
      expect(screen.getByTestId("org-survey-results")).toBeInTheDocument();
    });
    expect(screen.getByTestId("branded-report")).toBeInTheDocument();
  });

  it("does NOT render the stored report when /me answers 401 — no live session", async () => {
    writeOnScreenResult(ALIAS, REPORT);
    installFetch(401);

    render(<OrgSurveyClient campaignAlias={ALIAS} />);

    await waitFor(() => {
      expect(screen.getByText(/can't open this survey/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("org-survey-results")).not.toBeInTheDocument();
    expect(screen.queryByTestId("branded-report")).not.toBeInTheDocument();
  });

  it("PURGES the stored report when identity cannot be proven", async () => {
    writeOnScreenResult(ALIAS, REPORT);
    expect(readOnScreenResult(ALIAS)).not.toBeNull(); // precondition
    installFetch(401);

    render(<OrgSurveyClient campaignAlias={ALIAS} />);

    await waitFor(() => {
      expect(screen.getByText(/can't open this survey/i)).toBeInTheDocument();
    });
    expect(readOnScreenResult(ALIAS)).toBeNull();
  });

  it("KEEPS the stored report after a 410 rehydrate, so a second refresh still works", async () => {
    writeOnScreenResult(ALIAS, REPORT);
    installFetch(410);

    render(<OrgSurveyClient campaignAlias={ALIAS} />);
    await waitFor(() => {
      expect(screen.getByTestId("org-survey-results")).toBeInTheDocument();
    });
    expect(readOnScreenResult(ALIAS)).not.toBeNull();
  });

  it("shows the closed-survey error on a 410 with NO stored report", async () => {
    installFetch(410);

    render(<OrgSurveyClient campaignAlias={ALIAS} />);

    await waitFor(() => {
      expect(screen.getByText(/can't open this survey/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("org-survey-results")).not.toBeInTheDocument();
  });

  it("does not rehydrate when /me succeeds — a live survey renders the survey", async () => {
    writeOnScreenResult(ALIAS, REPORT);
    installFetch(200);

    render(<OrgSurveyClient campaignAlias={ALIAS} />);

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId("org-survey-results")).not.toBeInTheDocument();
  });
});

describe("the rendered report", () => {
  it("formats submittedAt rather than printing raw ISO text", async () => {
    writeOnScreenResult(ALIAS, REPORT);
    installFetch(410);

    render(<OrgSurveyClient campaignAlias={ALIAS} />);
    await waitFor(() => {
      expect(screen.getByTestId("org-survey-results")).toBeInTheDocument();
    });

    // The raw ISO string must never reach the DOM — Intl.DateTimeFormat throws
    // on a string and the renderer falls back to printing it verbatim.
    expect(
      screen.getByTestId("org-survey-results").textContent,
    ).not.toContain("2026-07-29T10:30:00.000Z");
  });

  it("offers Print and Download PDF — the only way to keep a show-once report", async () => {
    writeOnScreenResult(ALIAS, REPORT);
    installFetch(410);

    render(<OrgSurveyClient campaignAlias={ALIAS} />);
    await waitFor(() => {
      expect(screen.getByTestId("org-survey-results")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /^print$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /download pdf/i }),
    ).toBeInTheDocument();
  });

  it("tells the respondent their coach will review the results with them", async () => {
    writeOnScreenResult(ALIAS, REPORT);
    installFetch(410);

    render(<OrgSurveyClient campaignAlias={ALIAS} />);
    await waitFor(() => {
      expect(screen.getByTestId("org-survey-results")).toBeInTheDocument();
    });
    expect(
      screen.getByText(/your coach will review these results with you/i),
    ).toBeInTheDocument();
  });
});
