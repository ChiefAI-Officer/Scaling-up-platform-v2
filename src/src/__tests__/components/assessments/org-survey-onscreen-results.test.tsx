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
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OrgSurveyClient } from "@/components/assessments/org-survey-client";
import {
  writeOnScreenResult,
  readOnScreenResult,
} from "@/lib/assessments/onscreen-result-store";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const ALIAS = "demo-campaign";

/** The invitation the stored report belongs to, and that /me's 410 echoes. */
const KEY = "inv-1";

const REPORT = {
  respondentName: "Resp Ondent",
  jobTitle: null,
  companyName: "Spectrum Health",
  assessmentName: "Rockefeller Habits Checklist",
  templateAlias: "RockHabits",
  reportStyle: "MODERN_DASHBOARD",
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

const EMPTY_CANONICAL_RESULT = {
  perQuestion: [],
  perSection: [],
  overallTotal: 0,
  overallAverage: 0,
  countAchieved: 0,
  tier: null,
  tierMetricValue: 0,
  unansweredKeys: [],
};

/** Install a fetch that answers /me with the given status and server decisions. */
function installFetch(
  meStatus: number,
  decisions: {
    reportStylesAvailable?: boolean;
    reportFindingsAvailable?: boolean;
  } = {},
) {
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
        json: async () => ({
          success: false,
          error: "gate",
          // The real route echoes the owning invitation on its 410 so the client
          // can prove the stored slot belongs to the cookie holder.
          ...(meStatus === 410 ? { respondentKey: KEY, ...decisions } : {}),
        }),
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
    writeOnScreenResult(ALIAS, REPORT, KEY);
    installFetch(410);

    render(<OrgSurveyClient campaignAlias={ALIAS} />);

    await waitFor(() => {
      expect(screen.getByTestId("org-survey-results")).toBeInTheDocument();
    });
    expect(screen.getByTestId("branded-report")).toBeInTheDocument();
  });

  it("does NOT render the stored report when /me answers 401 — no live session", async () => {
    writeOnScreenResult(ALIAS, REPORT, KEY);
    installFetch(401);

    render(<OrgSurveyClient campaignAlias={ALIAS} />);

    await waitFor(() => {
      expect(screen.getByText(/can't open this survey/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("org-survey-results")).not.toBeInTheDocument();
    expect(screen.queryByTestId("branded-report")).not.toBeInTheDocument();
  });

  it("PURGES the stored report when identity cannot be proven", async () => {
    writeOnScreenResult(ALIAS, REPORT, KEY);
    expect(readOnScreenResult(ALIAS, KEY)).not.toBeNull(); // precondition
    installFetch(401);

    render(<OrgSurveyClient campaignAlias={ALIAS} />);

    await waitFor(() => {
      expect(screen.getByText(/can't open this survey/i)).toBeInTheDocument();
    });
    expect(readOnScreenResult(ALIAS, KEY)).toBeNull();
  });

  it("KEEPS the stored report after a 410 rehydrate, so a second refresh still works", async () => {
    writeOnScreenResult(ALIAS, REPORT, KEY);
    installFetch(410);

    render(<OrgSurveyClient campaignAlias={ALIAS} />);
    await waitFor(() => {
      expect(screen.getByTestId("org-survey-results")).toBeInTheDocument();
    });
    expect(readOnScreenResult(ALIAS, KEY)).not.toBeNull();
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
    writeOnScreenResult(ALIAS, REPORT, KEY);
    installFetch(200);

    render(<OrgSurveyClient campaignAlias={ALIAS} />);

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId("org-survey-results")).not.toBeInTheDocument();
  });
});

describe("the rendered report", () => {
  it.each([
    [
      "scored",
      {
        ...(REPORT as unknown as Record<string, unknown>),
        templateAlias: "RockHabits",
        reportStyle: "MODERN_DASHBOARD",
        result: EMPTY_CANONICAL_RESULT,
      },
      null,
    ],
    [
      "qualitative",
      {
        ...(REPORT as unknown as Record<string, unknown>),
        assessmentName: "Quarterly Session Prep",
        templateAlias: "qsp-v2",
        reportStyle: "MODERN_DASHBOARD",
        result: EMPTY_CANONICAL_RESULT,
        sections: [{ stableKey: "reflection", name: "Reflection" }],
        questionByKey: { reflection: "What changed?" },
        questionsByKey: {
          reflection: {
            type: "TEXT",
            label: "What changed?",
            sectionStableKey: "reflection",
          },
        },
        rawAnswers: [{ stableKey: "reflection", value: "We protected focus time." }],
      },
      "narrative-response",
    ],
    [
      "sparse custom",
      {
        ...(REPORT as unknown as Record<string, unknown>),
        assessmentName: "Founder prompts",
        templateAlias: "founder-reflection-2026",
        reportStyle: "MODERN_DASHBOARD",
        result: EMPTY_CANONICAL_RESULT,
        sections: [{ stableKey: "custom", name: "Founder reflections" }],
        questionByKey: { custom_prompt: "What deserves attention?" },
        questionsByKey: {
          custom_prompt: {
            type: "TEXT",
            label: "What deserves attention?",
            sectionStableKey: "custom",
          },
        },
        rawAnswers: [{ stableKey: "custom_prompt", value: "Our onboarding handoff." }],
      },
      "narrative-response",
    ],
  ] as const)(
    "invited on-screen restores the frozen %s campaign appearance",
    async (_anatomy, report, expectedBlock) => {
      writeOnScreenResult(ALIAS, report as never, KEY);
      installFetch(410, {
        reportStylesAvailable: true,
        reportFindingsAvailable: true,
      });

      render(<OrgSurveyClient campaignAlias={ALIAS} />);

      const renderer = await screen.findByTestId("modern-dashboard-report");
      if (expectedBlock) {
        expect(
          renderer.querySelector(`[data-report-block="${expectedBlock}"]`),
        ).not.toBeNull();
      }
    },
  );

  it.each([
    ["EXECUTIVE_BOARDROOM", "executive-boardroom-report"],
    ["MODERN_DASHBOARD", "modern-dashboard-report"],
  ] as const)(
    "refresh restores the %s renderer from the current /me availability decision",
    async (reportStyle, rendererTestId) => {
      writeOnScreenResult(
        ALIAS,
        {
          ...(REPORT as unknown as Record<string, unknown>),
          templateAlias: "scaling-up-full",
          reportStyle,
        } as never,
        KEY,
      );
      installFetch(410, {
        reportStylesAvailable: true,
        reportFindingsAvailable: true,
      });

      render(<OrgSurveyClient campaignAlias={ALIAS} />);

      await waitFor(() =>
        expect(screen.getByTestId(rendererTestId)).toBeInTheDocument(),
      );
      expect(screen.getByTestId("org-survey-results")).toHaveAttribute(
        "data-enabled-report-style",
        reportStyle,
      );
    },
  );

  it.each([
    ["unavailable", {}],
    ["killed", { reportStylesAvailable: false }],
  ] as const)(
    "refresh fails closed to Classic when report styles are %s",
    async (_availability, decisions) => {
      writeOnScreenResult(
        ALIAS,
        {
          ...(REPORT as unknown as Record<string, unknown>),
          templateAlias: "scaling-up-full",
          reportStyle: "MODERN_DASHBOARD",
        } as never,
        KEY,
      );
      installFetch(410, decisions);

      render(<OrgSurveyClient campaignAlias={ALIAS} />);

      await waitFor(() =>
        expect(screen.getByTestId("report-cover")).toBeInTheDocument(),
      );
      expect(screen.getByTestId("org-survey-results")).not.toHaveAttribute(
        "data-enabled-report-style",
      );
      expect(screen.queryByTestId("modern-dashboard-report")).toBeNull();
    },
  );

  it("fails closed to Classic for a revived report with no server availability decision", async () => {
    writeOnScreenResult(
      ALIAS,
      { ...(REPORT as object), templateAlias: "scaling-up-full" } as never,
      KEY,
    );
    installFetch(410);

    render(<OrgSurveyClient campaignAlias={ALIAS} />);
    await waitFor(() => expect(screen.getByTestId("report-cover")).toBeInTheDocument());
    expect(screen.queryByTestId("modern-dashboard-report")).toBeNull();
  });

  it("formats submittedAt rather than printing raw ISO text", async () => {
    writeOnScreenResult(ALIAS, REPORT, KEY);
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
    writeOnScreenResult(ALIAS, REPORT, KEY);
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
    writeOnScreenResult(ALIAS, REPORT, KEY);
    installFetch(410);

    render(<OrgSurveyClient campaignAlias={ALIAS} />);
    await waitFor(() => {
      expect(screen.getByTestId("org-survey-results")).toBeInTheDocument();
    });
    expect(
      screen.getByText(/your coach will review these results with you/i),
    ).toBeInTheDocument();
  });

  it("renders the server-issued CEO comparison link beside Print without persisting it", async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.includes("/me")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              respondentKey: KEY,
              campaign: { name: "Demo", alias: ALIAS, templateAlias: "RockHabits" },
              version: { language: "en" },
              sections: [{ stableKey: "s1", sortOrder: 1, name: "S1" }],
              questions: [{
                stableKey: "q1",
                sortOrder: 1,
                type: "SLIDER_LIKERT",
                label: "Question",
                sectionStableKey: "s1",
                isRequired: true,
                scale: { min: 0, max: 3, step: 1, anchorMin: "Low", anchorMax: "High" },
              }],
            },
          }),
        } as unknown as Response;
      }
      if (url.includes("/submit")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              report: {
                ...(REPORT as object),
                submittedAt: "2026-07-29T10:30:00.000Z",
              },
              ceoSelfAccessUrl:
                "https://app.example.com/assessments/self-report#t=signed-token",
            },
          }),
        } as unknown as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    }) as unknown as typeof fetch;

    render(<OrgSurveyClient campaignAlias={ALIAS} />);
    await screen.findByRole("button", { name: /start the assessment/i });
    fireEvent.click(screen.getByRole("button", { name: /start the assessment/i }));
    fireEvent.change(screen.getByRole("slider"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /^submit$/i }));

    const link = await screen.findByRole("link", {
      name: "Compare with a previous assessment",
    });
    expect(link).toHaveAttribute(
      "href",
      "https://app.example.com/assessments/self-report#t=signed-token",
    );
    expect(screen.getByTestId("org-survey-results")).toContainElement(link);
    expect(
      window.sessionStorage.getItem(`su-onscreen-result:${ALIAS}`),
    ).not.toContain("signed-token");
  });
});

// ─── PR #236 round-2 findings, at the client level ──────────────────────────

describe("a transient /me failure must not destroy the report (finding #2)", () => {
  it("KEEPS the stored report when /me answers 500 — a DB blip is not a disproof of identity", async () => {
    writeOnScreenResult(ALIAS, REPORT, KEY);
    installFetch(500);

    render(<OrgSurveyClient campaignAlias={ALIAS} />);
    await waitFor(() =>
      expect(screen.getByText(/can't open this survey/i)).toBeInTheDocument(),
    );

    // The earlier blanket `else` purged here. Under show-once with no results
    // email that made the report permanently unrecoverable: the next reload
    // 410s onto an empty slot and the respondent is told the survey closed.
    expect(readOnScreenResult(ALIAS, KEY)).not.toBeNull();
  });

  it("still purges on 401, which genuinely disproves a live session", async () => {
    writeOnScreenResult(ALIAS, REPORT, KEY);
    expect(readOnScreenResult(ALIAS, KEY)).not.toBeNull(); // precondition
    installFetch(401);

    render(<OrgSurveyClient campaignAlias={ALIAS} />);
    await waitFor(() =>
      expect(screen.getByText(/can't open this survey/i)).toBeInTheDocument(),
    );

    expect(readOnScreenResult(ALIAS, KEY)).toBeNull();
  });
});

describe("one respondent's report never renders to another (finding #1)", () => {
  it("does NOT render a slot owned by a different invitation, even on a valid 410", async () => {
    // Respondent A's report is in this tab. The 410 arrives on B's cookie —
    // which is a real, live session, so the authorization check alone passes.
    writeOnScreenResult(ALIAS, REPORT, "inv-respondent-a");
    installFetch(410); // echoes KEY ("inv-1"), i.e. NOT the slot's owner

    render(<OrgSurveyClient campaignAlias={ALIAS} />);
    await waitFor(() =>
      expect(screen.getByText(/can't open this survey/i)).toBeInTheDocument(),
    );

    // B sees the closed-survey message, never A's report.
    expect(screen.queryByTestId("org-survey-results")).not.toBeInTheDocument();
    expect(screen.queryByTestId("branded-report")).not.toBeInTheDocument();
    expect(screen.queryByText(/Resp Ondent/)).not.toBeInTheDocument();
  });

  it("positive control — the SAME invitation still rehydrates", async () => {
    writeOnScreenResult(ALIAS, REPORT, KEY);
    installFetch(410);

    render(<OrgSurveyClient campaignAlias={ALIAS} />);
    await waitFor(() =>
      expect(screen.getByTestId("org-survey-results")).toBeInTheDocument(),
    );
  });
});

// ─── PR #236 round-3 finding: re-tapping the invite link stranded the report ──
//
// The fragment was stripped only on exchange SUCCESS. Since /exchange 410s a
// SUBMITTED invitation, a respondent who re-tapped their email link after
// finishing (the default gesture on mobile) got "no longer available" — and
// every subsequent reload re-attempted the same doomed exchange, because `#t=`
// was still in the URL. Their report sat intact in sessionStorage, unreachable.
describe("re-tapping the invitation link after submitting (finding #3)", () => {
  function installFetchWithExchange(exchangeStatus: number, meStatus: number) {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.includes("/exchange")) {
        return {
          ok: exchangeStatus >= 200 && exchangeStatus < 300,
          status: exchangeStatus,
          json: async () => ({ success: false, error: "gone" }),
        } as unknown as Response;
      }
      if (url.includes("/me")) {
        return {
          ok: false,
          status: meStatus,
          json: async () => ({
            success: false,
            error: "gate",
            ...(meStatus === 410 ? { respondentKey: KEY } : {}),
          }),
        } as unknown as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    }) as unknown as typeof fetch;
  }

  it("re-renders the stored report instead of a dead end", async () => {
    writeOnScreenResult(ALIAS, REPORT, KEY);
    window.history.replaceState(null, "", `/org-survey/${ALIAS}#t=already-used`);
    installFetchWithExchange(410, 410);

    render(<OrgSurveyClient campaignAlias={ALIAS} />);

    await waitFor(() =>
      expect(screen.getByTestId("org-survey-results")).toBeInTheDocument(),
    );
  });

  it("strips the fragment even when the exchange fails, so a reload is not doomed", async () => {
    window.history.replaceState(null, "", `/org-survey/${ALIAS}#t=already-used`);
    installFetchWithExchange(410, 410);

    render(<OrgSurveyClient campaignAlias={ALIAS} />);
    await waitFor(() => expect(window.location.hash).toBe(""));
  });
});

/**
 * GH #229, stated on the surface that actually made it a problem.
 *
 * `coach-logo.test.tsx` proves the component filters its `src`. This proves the
 * filter is reached on THIS path — the report rendered to an UNAUTHENTICATED
 * respondent, which is the audience Wave OSR introduced and the reason #229's
 * own "impact is narrow" reasoning (it rests on the Report access gate) no
 * longer holds. Testing the component alone would leave the wave's actual claim
 * unguarded, which is the gap the #230 review caught the hard way.
 *
 * SCOPE — the gate is scheme-only, with NO host constraint. The last test below
 * pins that on purpose: an arbitrary HTTPS host still renders and still causes an
 * outbound request. Constraining the host is the open part of #229, and a test
 * asserting otherwise would be the kind of reassuring-but-false guard this repo
 * has been bitten by.
 */
describe("an operator-set coach logo is scheme-gated on the respondent path (GH #229)", () => {
  const REPORT_WITH_HTTP_LOGO = {
    ...(REPORT as unknown as Record<string, unknown>),
    coachLogoUrl: "http://tracker.example.net/pixel.png",
    coachName: "Dana Coach",
  } as never;

  const REPORT_WITH_HTTPS_LOGO = {
    ...(REPORT as unknown as Record<string, unknown>),
    coachLogoUrl: "https://cdn.example.com/coach.png",
    coachName: "Dana Coach",
  } as never;

  it("drops an http logo on the respondent-facing report, keeping the byline", async () => {
    writeOnScreenResult(ALIAS, REPORT_WITH_HTTP_LOGO, KEY);
    installFetch(410);

    render(<OrgSurveyClient campaignAlias={ALIAS} />);

    await waitFor(() =>
      expect(screen.getByTestId("org-survey-results")).toBeInTheDocument(),
    );
    // negative: the http image is not rendered, so no mixed-content request is
    // made. queryAll, not query — the report renders coach chrome TWICE (cover +
    // footer), so a single-element query throws on "multiple found" and would
    // mask the real assertion.
    expect(screen.queryAllByTestId("coach-logo")).toHaveLength(0);
    // positive control: the report DID render and the coach is still named, so
    // this is not passing because the page failed to load.
    expect(screen.getAllByTestId("coach-name")[0]).toHaveTextContent("Dana Coach");
  });

  it("positive control — an https logo still renders on the same path", async () => {
    writeOnScreenResult(ALIAS, REPORT_WITH_HTTPS_LOGO, KEY);
    installFetch(410);

    render(<OrgSurveyClient campaignAlias={ALIAS} />);

    await waitFor(() =>
      expect(screen.getByTestId("org-survey-results")).toBeInTheDocument(),
    );
    expect(screen.getAllByTestId("coach-logo")[0]).toHaveAttribute(
      "src",
      "https://cdn.example.com/coach.png",
    );
  });

  it("documents the LIMIT — an arbitrary https host is NOT blocked", async () => {
    // This is the residual on #229, recorded as a test so the scope of the gate
    // cannot be overstated later: scheme-gating does not stop a third-party
    // request, it only stops mixed content (`http:`) and non-http schemes.
    writeOnScreenResult(
      ALIAS,
      {
        ...(REPORT as unknown as Record<string, unknown>),
        coachLogoUrl: "https://tracker.example.net/pixel.png",
        coachName: "Dana Coach",
      } as never,
      KEY,
    );
    installFetch(410);

    render(<OrgSurveyClient campaignAlias={ALIAS} />);

    await waitFor(() =>
      expect(screen.getByTestId("org-survey-results")).toBeInTheDocument(),
    );
    expect(screen.getAllByTestId("coach-logo")[0]).toHaveAttribute(
      "src",
      "https://tracker.example.net/pixel.png",
    );
  });
});
