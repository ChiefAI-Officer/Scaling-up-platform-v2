/**
 * Wave OSR (Jeff #71) — POST /org-survey/[campaignAlias]/submit returns the
 * respondent's own report for in-place rendering.
 *
 * Spec: docs/specs/v7.6/19an. The behaviours under test are the ones the gate
 * and the co-validate review identified as load-bearing:
 *
 *  - the disclosure decision is made SERVER-side, under the Phase-2 lock, and
 *    a toggle flipped OFF in the Phase-1 -> Phase-2 window suppresses it;
 *  - the flag never mutates the stored column;
 *  - a report-model build failure must NOT fail the submission (a throw after
 *    commit would 500, and the client's retry would then hit the hard 409
 *    double-submit guard — an unrecoverable dead-end with the answers saved);
 *  - the model is built ONCE and reused by the results email;
 *  - `templateAlias` is populated by the SERVER build, never hand-set, which is
 *    what makes the qualitative dispatch in BrandedReport correct.
 */

jest.mock("next/server", () => ({
  NextResponse: class extends Response {
    static json(body: unknown, init?: ResponseInit) {
      return new Response(JSON.stringify(body), {
        status: init?.status || 200,
        headers: init?.headers,
      });
    }
  },
}));

// eslint-disable-next-line no-var
var sessionState = {
  invitationId: "inv-1",
  campaignAlias: "demo",
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
};

jest.mock("@/lib/assessments/invitation-cookie", () => ({
  getInvitationSession: jest.fn(() => Promise.resolve(sessionState)),
}));

// Keep the transaction-scoped primitive observable at the route boundary; its
// SQL contract is covered independently by report-style-lock.test.ts.
// eslint-disable-next-line no-var
var reportStyleLockMock: jest.Mock;
jest.mock("@/lib/assessments/report-style-lock", () => {
  reportStyleLockMock = jest.fn().mockResolvedValue(undefined);
  return { lockReportStyleForFirstCompletion: reportStyleLockMock };
});

const txMock = {
  $executeRaw: jest.fn().mockResolvedValue(1),
  assessmentInvitation: {
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
  },
  assessmentSubmission: {
    create: jest.fn().mockResolvedValue({ id: "sub-1" }),
  },
  assessmentEmailOutbox: {
    create: jest.fn().mockResolvedValue({}),
  },
};

// eslint-disable-next-line no-var
var dbMock: {
  $transaction: jest.Mock;
  assessmentInvitation: { findUnique: jest.Mock };
  assessmentCampaignParticipant: { findUnique: jest.Mock };
  auditLog: { create: jest.Mock };
};

jest.mock("@/lib/db", () => {
  dbMock = {
    $transaction: jest.fn((fn: (tx: typeof txMock) => unknown) => fn(txMock)),
    assessmentInvitation: { findUnique: jest.fn() },
    assessmentCampaignParticipant: { findUnique: jest.fn() },
    auditLog: { create: jest.fn().mockResolvedValue(undefined) },
  };
  return { db: dbMock };
});

// eslint-disable-next-line no-var
var flagState = { results: true, coach: true, paused: false, intents: false };
jest.mock("@/lib/assessments/wave-d-feature-flags", () => ({
  waveDResultsEmailEnabled: jest.fn(() => flagState.results),
  waveDCoachNotifyEnabled: jest.fn(() => flagState.coach),
  assessmentSendsPaused: jest.fn(() => flagState.paused),
  assessmentEmailDeliveryIntentsEnabled: jest.fn(() => flagState.intents),
}));

// Wave OSR flag — the server-side lever. Default ON here; tests flip it.
// eslint-disable-next-line no-var
var osrState = { enabled: true };
jest.mock("@/lib/assessments/wave-osr-flags", () => ({
  isOnScreenResultsEnabled: jest.fn(() => osrState.enabled),
}));

// eslint-disable-next-line no-var
var approvedState = { approved: true };
jest.mock("@/lib/assessments/results-email-approval", () => ({
  isResultsEmailApproved: jest.fn(() => approvedState.approved),
}));

// The report-model builder. `buildState.throws` drives the build-failure case.
// eslint-disable-next-line no-var
var buildState: { throws: boolean; calls: Array<Record<string, unknown>> } = {
  throws: false,
  calls: [],
};
const BUILT_REPORT = {
  respondentName: "Resp Ondent",
  templateAlias: "rockefeller",
  assessmentName: "Rockefeller Habits Checklist",
  result: { scaleUpScore: null, countAchieved: 1 },
  degraded: false,
};
jest.mock("@/lib/assessments/report-email", () => ({
  buildRespondentReportFromSubmission: jest.fn(
    (args: Record<string, unknown>) => {
      buildState.calls.push(args);
      if (buildState.throws) throw new Error("report model build failed");
      return BUILT_REPORT;
    },
  ),
  buildReportEmailHtml: jest.fn(() => ({
    subject: "report-subject",
    bodyHtml: "<table>REPORT</table>",
  })),
}));
jest.mock("@/lib/assessments/results-email", () => ({
  buildResultsEmailHtml: jest.fn(() => "<p>BODY</p><table>REPORT</table>"),
  buildCoachNotifyEmail: jest.fn(() => ({
    subject: "coach-notify-subject",
    bodyHtml: "<a>report link</a>",
  })),
}));

import { POST } from "@/app/(public)/org-survey/[campaignAlias]/submit/route";
import { lockReportStyleForFirstCompletion } from "@/lib/assessments/report-style-lock";

reportStyleLockMock = lockReportStyleForFirstCompletion as jest.Mock;

const goodVersion = {
  questions: [
    {
      stableKey: "q1",
      sortOrder: 1,
      type: "SLIDER_LIKERT" as const,
      label: "Q1",
      isRequired: true,
      scale: { min: 0, max: 3, step: 1, anchorMin: "Lo", anchorMax: "Hi" },
    },
  ],
  sections: [{ stableKey: "s1", sortOrder: 1, name: "S1" }],
  scoringConfig: {
    tierMetric: "countAchieved",
    passThreshold: 2,
    tiers: [
      { minMetric: 0, maxMetric: 0, label: "low", message: "low" },
      { minMetric: 1, label: "high", message: "high" },
    ],
  },
};

function invitationFixture(overrides?: {
  showResultsOnScreen?: boolean;
  sendResultsToRespondent?: boolean;
  notifyCoachOnCompletion?: boolean;
}) {
  return {
    id: "inv-1",
    status: "VIEWED",
    revokedAt: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    respondentId: "r1",
    campaignId: "c1",
    respondent: {
      email: "respondent@example.com",
      firstName: "Resp",
      lastName: "Ondent",
    },
    campaign: {
      id: "c1",
      reportStyle: "MODERN_DASHBOARD",
      alias: "demo",
      deletedAt: null,
      status: "ACTIVE",
      accessMode: "INVITED",
      openAt: new Date(Date.now() - 1000),
      closeAt: null,
      sendResultsToRespondent: overrides?.sendResultsToRespondent ?? false,
      notifyCoachOnCompletion: overrides?.notifyCoachOnCompletion ?? false,
      showResultsOnScreen: overrides?.showResultsOnScreen ?? true,
      createdByCoachId: "coach-1",
      creatorCoach: { email: "coach@example.com" },
      version: {
        id: "v1",
        questions: goodVersion.questions,
        sections: goodVersion.sections,
        scoringConfig: goodVersion.scoringConfig,
      },
      template: {
        name: "Rockefeller Habits Checklist",
        alias: "rockefeller",
        resultsEmailSubject: "Your results",
        resultsEmailBodyMarkdown: "Here are your results.",
        resultsEmailContentApproved: true,
        resultsEmailContentApprovedHash: "hash",
      },
    },
  };
}

/** Phase 1 and Phase 2 agree (the normal case). */
function mockInvitation(overrides?: Parameters<typeof invitationFixture>[0]) {
  const invitation = invitationFixture(overrides);
  dbMock.assessmentInvitation.findUnique.mockResolvedValue(invitation);
  txMock.assessmentInvitation.findUnique.mockResolvedValue(invitation);
}

/** Phase 1 and Phase 2 DISAGREE — the toggle flipped inside the lock window. */
function mockInvitationRacing(phase1: boolean, phase2: boolean) {
  dbMock.assessmentInvitation.findUnique.mockResolvedValue(
    invitationFixture({ showResultsOnScreen: phase1 }),
  );
  txMock.assessmentInvitation.findUnique.mockResolvedValue(
    invitationFixture({ showResultsOnScreen: phase2 }),
  );
}

function jsonReq(body: unknown): Request {
  return new Request("http://localhost/org-survey/demo/submit", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}
const aliasParams = (alias: string) => ({
  params: Promise.resolve({ campaignAlias: alias }),
});
const goodAnswers = { answers: [{ stableKey: "q1", value: 3 }] };

type SubmitBody = {
  success: boolean;
  data?: { submissionId?: string; report?: unknown };
};

beforeEach(() => {
  jest.clearAllMocks();
  sessionState.invitationId = "inv-1";
  sessionState.campaignAlias = "demo";
  flagState.results = true;
  flagState.coach = true;
  flagState.paused = false;
  flagState.intents = false;
  osrState.enabled = true;
  approvedState.approved = true;
  buildState.throws = false;
  buildState.calls = [];
  process.env.APP_URL = "https://app.example.com";
  txMock.assessmentSubmission.create.mockResolvedValue({ id: "sub-1" });
  txMock.assessmentEmailOutbox.create.mockResolvedValue({});
});

describe("report style first-completion freeze with on-screen results", () => {
  it("uses the same completion instant for the transaction freeze and stored submission", async () => {
    mockInvitation({ showResultsOnScreen: true });

    const response = await POST(
      jsonReq(goodAnswers) as never,
      aliasParams("demo"),
    );

    expect(response.status).toBe(200);
    const [tx, campaignId, submittedAt] = reportStyleLockMock.mock.calls[0];
    const submissionData =
      txMock.assessmentSubmission.create.mock.calls[0][0].data;
    expect(tx).toBe(txMock);
    expect(campaignId).toBe("c1");
    expect(submissionData.submittedAt).toBe(submittedAt);
  });
});

// ─── the disclosure decision ───────────────────────────────────────────────

describe("Wave OSR — disclosure decision", () => {
  it("returns the report when the campaign toggle is ON and the flag is ON", async () => {
    mockInvitation({ showResultsOnScreen: true });
    const res = await POST(jsonReq(goodAnswers) as never, aliasParams("demo"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as SubmitBody;
    expect(body.data?.submissionId).toBe("sub-1");
    expect(body.data?.report).toEqual(BUILT_REPORT);
  });

  // NOTE on the negative cases below: an "the report is absent" assertion
  // passes vacuously before the feature exists, which makes it a false green.
  // Each one therefore carries a POSITIVE CONTROL in the same test — it first
  // proves a report IS returned for the identical setup, then flips the single
  // variable under test. That way the test can only pass if the feature exists
  // AND its gate works.

  it("omits the report when the campaign toggle is OFF", async () => {
    mockInvitation({ showResultsOnScreen: true });
    const control = (await (
      await POST(jsonReq(goodAnswers) as never, aliasParams("demo"))
    ).json()) as SubmitBody;
    expect(control.data?.report).toBeDefined(); // positive control

    mockInvitation({ showResultsOnScreen: false });
    const res = await POST(jsonReq(goodAnswers) as never, aliasParams("demo"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as SubmitBody;
    expect(body.data?.submissionId).toBe("sub-1");
    expect(body.data?.report).toBeUndefined();
  });

  it("omits the report when the flag is OFF even though the column is stored true", async () => {
    mockInvitation({ showResultsOnScreen: true });
    const control = (await (
      await POST(jsonReq(goodAnswers) as never, aliasParams("demo"))
    ).json()) as SubmitBody;
    expect(control.data?.report).toBeDefined(); // positive control

    osrState.enabled = false;
    const res = await POST(jsonReq(goodAnswers) as never, aliasParams("demo"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as SubmitBody;
    expect(body.data?.report).toBeUndefined();
  });

  it("never mutates the stored toggle — the flag suppresses capability, not data", async () => {
    mockInvitation({ showResultsOnScreen: true });
    const control = (await (
      await POST(jsonReq(goodAnswers) as never, aliasParams("demo"))
    ).json()) as SubmitBody;
    expect(control.data?.report).toBeDefined(); // positive control

    osrState.enabled = false;
    await POST(jsonReq(goodAnswers) as never, aliasParams("demo"));
    // No write path may touch the campaign row on submit.
    const wroteCampaign = [
      ...txMock.assessmentInvitation.update.mock.calls,
      ...txMock.assessmentSubmission.create.mock.calls,
    ].some((call) => JSON.stringify(call).includes("showResultsOnScreen"));
    expect(wroteCampaign).toBe(false);
  });
});

// ─── the locked re-read (co-validate C1) ───────────────────────────────────

describe("Wave OSR — the decision is made under the Phase-2 lock", () => {
  it("suppresses the report when the toggle is flipped OFF inside the lock window", async () => {
    // Positive control: both phases agree ON -> a report IS returned. Without
    // this, the assertion below would pass vacuously before the feature exists.
    mockInvitationRacing(true, true);
    const control = (await (
      await POST(jsonReq(goodAnswers) as never, aliasParams("demo"))
    ).json()) as SubmitBody;
    expect(control.data?.report).toBeDefined();

    mockInvitationRacing(true, false);
    const res = await POST(jsonReq(goodAnswers) as never, aliasParams("demo"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as SubmitBody;
    // Phase 1 said yes; the LOCKED value said no. The locked value wins.
    expect(body.data?.report).toBeUndefined();
  });

  it("re-reads showResultsOnScreen inside the locked transaction", async () => {
    mockInvitation({ showResultsOnScreen: true });
    await POST(jsonReq(goodAnswers) as never, aliasParams("demo"));
    const lockedSelect = JSON.stringify(
      txMock.assessmentInvitation.findUnique.mock.calls[0],
    );
    expect(lockedSelect).toContain("showResultsOnScreen");
  });
});

// ─── failure modes (co-validate C2) ────────────────────────────────────────

describe("Wave OSR — a report-model failure never fails the submission", () => {
  it("still persists the submission and returns 200 without a report", async () => {
    buildState.throws = true;
    mockInvitation({ showResultsOnScreen: true });
    const res = await POST(jsonReq(goodAnswers) as never, aliasParams("demo"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as SubmitBody;
    expect(body.success).toBe(true);
    expect(body.data?.submissionId).toBe("sub-1");
    expect(body.data?.report).toBeUndefined();
    expect(txMock.assessmentSubmission.create).toHaveBeenCalled();
  });
});

// ─── build-once (co-validate "safely prepared report DTO") ─────────────────

describe("Wave OSR — the report model is built once and reused", () => {
  it("builds exactly one model when both on-screen and the results email are on", async () => {
    mockInvitation({
      showResultsOnScreen: true,
      sendResultsToRespondent: true,
    });
    await POST(jsonReq(goodAnswers) as never, aliasParams("demo"));
    expect(buildState.calls).toHaveLength(1);
  });

  it("populates templateAlias from the server build, so the qualitative dispatch is correct", async () => {
    mockInvitation({ showResultsOnScreen: true });
    const res = await POST(jsonReq(goodAnswers) as never, aliasParams("demo"));
    const body = (await res.json()) as SubmitBody;
    expect(buildState.calls[0]?.templateAlias).toBe("rockefeller");
    expect((body.data?.report as { templateAlias?: string })?.templateAlias).toBe(
      "rockefeller",
    );
  });

  it("passes the campaign's frozen reportStyle into the shared report model", async () => {
    mockInvitation({ showResultsOnScreen: true });

    await POST(jsonReq(goodAnswers) as never, aliasParams("demo"));

    expect(buildState.calls[0]?.reportStyle).toBe("MODERN_DASHBOARD");
  });
});

// ─── anonymity (gate Q4) ───────────────────────────────────────────────────

describe("Wave OSR — the respondent only ever receives their own result", () => {
  it("carries no cohort or aggregate data in the payload", async () => {
    mockInvitation({ showResultsOnScreen: true });
    const res = await POST(jsonReq(goodAnswers) as never, aliasParams("demo"));
    const body = (await res.json()) as SubmitBody;
    // Guard against a vacuous pass: assert there IS a report to inspect before
    // asserting what it does not contain.
    expect(body.data?.report).toBeDefined();
    const serialized = JSON.stringify(body.data?.report);
    for (const forbidden of [
      "cohort",
      "aggregate",
      "peer",
      "teamAverage",
      "participants",
      "respondents",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("passes only this respondent's answers to the model builder", async () => {
    mockInvitation({ showResultsOnScreen: true });
    await POST(jsonReq(goodAnswers) as never, aliasParams("demo"));
    const args = buildState.calls[0];
    expect(args?.publicTaker).toEqual(
      expect.objectContaining({ email: "respondent@example.com" }),
    );
  });
});

// ─── no-store (PII in the response body) ───────────────────────────────────

describe("Wave OSR — the report response is never cached", () => {
  it("sets Cache-Control: no-store when a report is returned", async () => {
    mockInvitation({ showResultsOnScreen: true });
    const res = await POST(jsonReq(goodAnswers) as never, aliasParams("demo"));
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

// ─── PR #236 round-2 finding #6 — the build guard has a green->red signal ────
//
// `mayNeedReport` skips the model build when neither consumer wants it. That was
// shipped with no test at all, so the guard could regress in either direction
// unnoticed. These pin BOTH directions, and the second is the one that matters:
// if the guard is ever tightened past the disclosure condition it becomes a
// SILENT missing-report bug (respondent submits with the toggle on, gets the
// thank-you page, nothing logged).
describe("Wave OSR — the report model is built only when a consumer wants it", () => {
  it("does NOT build when neither on-screen nor the results email is on", async () => {
    mockInvitation({
      showResultsOnScreen: false,
      sendResultsToRespondent: false,
    });
    await POST(jsonReq(goodAnswers) as never, aliasParams("demo"));
    expect(buildState.calls).toHaveLength(0);
  });

  it("DOES build when the on-screen toggle is on", async () => {
    mockInvitation({ showResultsOnScreen: true });
    await POST(jsonReq(goodAnswers) as never, aliasParams("demo"));
    expect(buildState.calls).toHaveLength(1);
  });

  it("DOES build when only the #15 results email wants it", async () => {
    mockInvitation({
      showResultsOnScreen: false,
      sendResultsToRespondent: true,
    });
    await POST(jsonReq(goodAnswers) as never, aliasParams("demo"));
    expect(buildState.calls).toHaveLength(1);
  });
});
