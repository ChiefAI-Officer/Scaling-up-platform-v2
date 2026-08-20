/**
 * Assessment v7.6 — POST /org-survey/[campaignAlias]/submit.
 *
 * Strict v6.6 answer validation + double-submit 409.
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

// `var` hoists with jest.mock — `const` does not, which causes a
// `ReferenceError: Cannot access 'sessionState' before initialization`
// at test-suite load time.
// eslint-disable-next-line no-var
var sessionState = {
  invitationId: "inv-1",
  campaignAlias: "demo",
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
};

jest.mock("@/lib/assessments/invitation-cookie", () => ({
  // Lazy resolve so the mocked function reads the latest `sessionState`
  // every call (allowing `beforeEach` to reset between tests).
  getInvitationSession: jest.fn(() => Promise.resolve(sessionState)),
}));

// The lock itself is covered by its unit and PostgreSQL suites. This route
// double keeps it controllable so the test can prove the transaction awaits it
// before beginning any later under-lock operation.
// eslint-disable-next-line no-var
var reportStyleLockMock: jest.Mock;
jest.mock("@/lib/assessments/report-style-lock", () => {
  reportStyleLockMock = jest.fn().mockResolvedValue("MODERN_DASHBOARD");
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
  assessmentCampaignParticipant: {
    findUnique: jest.fn(),
  },
  assessmentEmailOutbox: {
    create: jest.fn().mockResolvedValue({}),
  },
  assessmentEmailDeliveryIntent: {
    create: jest.fn().mockResolvedValue({}),
  },
};

// The route does a Phase-1 read (full include) on the top-level `db` client,
// then a Phase-2 re-read on the tx client UNDER the FOR UPDATE lock. Both
// findUnique mocks are driven by mockHappyInvitation so the two phases agree.
//
// The `db` mock is built INSIDE the jest.mock factory (so it is self-contained
// at hoist time) and the handles are surfaced through `dbMock` for assertions.
// `var` hoists so the factory's assignment is visible to the rest of the file.
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

// ID-only post-commit signal for the delivery-intent fast path.
// eslint-disable-next-line no-var
var inngestMock: { send: jest.Mock };
jest.mock("@/inngest/client", () => {
  inngestMock = {
    send: jest.fn().mockResolvedValue(undefined),
  };
  return { inngest: inngestMock };
});

// Wave D feature flags — default ON in tests; individual tests flip them off.
// eslint-disable-next-line no-var
var flagState = {
  results: true,
  coach: true,
  paused: false,
  intents: false,
};
jest.mock("@/lib/assessments/wave-d-feature-flags", () => ({
  waveDResultsEmailEnabled: jest.fn(() => flagState.results),
  waveDCoachNotifyEnabled: jest.fn(() => flagState.coach),
  assessmentSendsPaused: jest.fn(() => flagState.paused),
  assessmentEmailDeliveryIntentsEnabled: jest.fn(() => flagState.intents),
}));

// Approval gate — default approved; individual tests flip it.
// eslint-disable-next-line no-var
var approvedState = { approved: true };
jest.mock("@/lib/assessments/results-email-approval", () => ({
  isResultsEmailApproved: jest.fn(() => approvedState.approved),
}));

// Keep the report/results builders real so consumer tests observe the frozen
// HTML that is actually enqueued. Wrap them as spies so the render-failure test
// can still replace one call without replacing production behavior globally.
jest.mock("@/lib/assessments/report-email", () => {
  const actual = jest.requireActual("@/lib/assessments/report-email");
  return {
    ...actual,
    buildRespondentReportFromSubmission: jest.fn(
      actual.buildRespondentReportFromSubmission,
    ),
    buildReportEmailHtml: jest.fn(actual.buildReportEmailHtml),
  };
});
jest.mock("@/lib/assessments/results-email", () => {
  const actual = jest.requireActual("@/lib/assessments/results-email");
  return {
    ...actual,
    buildResultsEmailHtml: jest.fn(actual.buildResultsEmailHtml),
    buildCoachNotifyEmail: jest.fn(actual.buildCoachNotifyEmail),
  };
});

import { POST } from "@/app/(public)/org-survey/[campaignAlias]/submit/route";
import { parseAuthorizationSnapshot } from "@/lib/assessments/assessment-email-delivery-intents";
import { lockReportStyleForFirstCompletion } from "@/lib/assessments/report-style-lock";
import { assessmentEmailDeliveryIntentsEnabled } from "@/lib/assessments/wave-d-feature-flags";
import { inngest } from "@/inngest/client";
import {
  SU_FULL_PHASE_FEEDBACK,
  buildPhaseRecommendations,
} from "@/lib/assessments/su-full-phase-feedback-catalogue";

reportStyleLockMock = lockReportStyleForFirstCompletion as jest.Mock;

// Template version with a single required SLIDER_LIKERT q1 scale 0..3.
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

function mockHappyInvitation(
  overrides?: Partial<{
    status: string;
    accessMode: string;
    sendResultsToRespondent: boolean;
    notifyCoachOnCompletion: boolean;
    createdByCoachId: string | null;
    creatorCoachEmail: string | null;
    closeAt: Date | null;
    creatorCoachFirstName: string;
    creatorCoachLastName: string;
    creatorCoachProfileImage: string | null;
    organization: { id: string; name: string } | null;
  }>
) {
  const invitation = {
    id: "inv-1",
    status: overrides?.status ?? "VIEWED",
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
      templateId: "template-1",
      organizationId: "org-1",
      versionId: "v1",
      alias: "demo",
      deletedAt: null,
      status: "ACTIVE",
      accessMode: overrides?.accessMode ?? "INVITED",
      openAt: new Date(Date.now() - 1000),
      closeAt: overrides?.closeAt ?? null,
      sendResultsToRespondent: overrides?.sendResultsToRespondent ?? true,
      notifyCoachOnCompletion: overrides?.notifyCoachOnCompletion ?? true,
      showResultsOnScreen: false,
      createdByCoachId:
        overrides?.createdByCoachId === undefined
          ? "coach-1"
          : overrides.createdByCoachId,
      creatorCoach:
        overrides?.creatorCoachEmail === null
          ? null
          : {
              id: "coach-1",
              email: overrides?.creatorCoachEmail ?? "coach@example.com",
              firstName: overrides?.creatorCoachFirstName ?? "Casey",
              lastName: overrides?.creatorCoachLastName ?? "Coach",
              profileImage: overrides?.creatorCoachProfileImage ?? null,
            },
      organization:
        overrides?.organization === undefined
          ? { id: "org-1", name: "Example Organization" }
          : overrides.organization,
      version: {
        id: "v1",
        templateId: "template-1",
        questions: goodVersion.questions,
        sections: goodVersion.sections,
        scoringConfig: goodVersion.scoringConfig,
      },
      template: {
        id: "template-1",
        name: "Rockefeller Habits Checklist",
        alias: "rockefeller",
        resultsEmailSubject: "Your results",
        resultsEmailBodyMarkdown: "Here are your results.",
        resultsEmailContentApproved: true,
        resultsEmailContentApprovedHash: "a".repeat(64),
      },
    },
  };
  // Phase 1 (lock-free read, full include) + Phase 2 (locked re-read) agree.
  dbMock.assessmentInvitation.findUnique.mockResolvedValue(invitation);
  txMock.assessmentInvitation.findUnique.mockResolvedValue(invitation);
  return invitation;
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

const transactionCommitMarker = jest.fn();
const transactionRollbackMarker = jest.fn();
let transactionActive = false;
const originalWave228Env = {
  enabled: process.env.WAVE_228_REPORT_EMAIL_CHROME_ENABLED,
  kill: process.env.WAVE_228_REPORT_EMAIL_CHROME_KILL,
  canary: process.env.WAVE_228_REPORT_EMAIL_CHROME_CANARY,
};

beforeEach(() => {
  jest.clearAllMocks();
  const reportEmail = jest.requireMock(
    "@/lib/assessments/report-email",
  ) as { buildReportEmailHtml: jest.Mock };
  const actualReportEmail = jest.requireActual(
    "@/lib/assessments/report-email",
  ) as { buildReportEmailHtml: (...args: unknown[]) => unknown };
  reportEmail.buildReportEmailHtml.mockImplementation(
    actualReportEmail.buildReportEmailHtml,
  );
  const resultsEmail = jest.requireMock(
    "@/lib/assessments/results-email",
  ) as { buildResultsEmailHtml: jest.Mock };
  const actualResultsEmail = jest.requireActual(
    "@/lib/assessments/results-email",
  ) as { buildResultsEmailHtml: (...args: unknown[]) => unknown };
  resultsEmail.buildResultsEmailHtml.mockImplementation(
    actualResultsEmail.buildResultsEmailHtml,
  );
  reportStyleLockMock.mockReset().mockResolvedValue("MODERN_DASHBOARD");
  transactionActive = false;
  sessionState.invitationId = "inv-1";
  sessionState.campaignAlias = "demo";
  flagState.results = true;
  flagState.coach = true;
  flagState.paused = false;
  flagState.intents = false;
  approvedState.approved = true;
  process.env.APP_URL = "https://app.example.com";
  dbMock.$transaction.mockImplementation(
    async (fn: (tx: typeof txMock) => unknown) => {
      transactionActive = true;
      try {
        const result = await fn(txMock);
        transactionCommitMarker();
        return result;
      } catch (error) {
        transactionRollbackMarker();
        throw error;
      } finally {
        transactionActive = false;
      }
    },
  );
  delete process.env.WAVE_228_REPORT_EMAIL_CHROME_ENABLED;
  delete process.env.WAVE_228_REPORT_EMAIL_CHROME_KILL;
  delete process.env.WAVE_228_REPORT_EMAIL_CHROME_CANARY;
  txMock.assessmentSubmission.create.mockResolvedValue({ id: "sub-1" });
  txMock.assessmentEmailOutbox.create.mockResolvedValue({});
  txMock.assessmentEmailDeliveryIntent.create.mockResolvedValue({});
  (inngest.send as jest.Mock).mockResolvedValue(undefined);
});

afterEach(() => {
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  restore(
    "WAVE_228_REPORT_EMAIL_CHROME_ENABLED",
    originalWave228Env.enabled,
  );
  restore("WAVE_228_REPORT_EMAIL_CHROME_KILL", originalWave228Env.kill);
  restore("WAVE_228_REPORT_EMAIL_CHROME_CANARY", originalWave228Env.canary);
});

describe("POST submit — strict v6.6 validation", () => {
  it("404 when an invited campaign has no organization", async () => {
    mockHappyInvitation({ organization: null });

    const res = await POST(
      jsonReq({ answers: [{ stableKey: "q1", value: 2 }] }) as never,
      aliasParams("demo"),
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      success: false,
      error: "Invitation not found",
    });
    expect(dbMock.$transaction).not.toHaveBeenCalled();
  });

  it("400 EMPTY_ANSWERS when answers array is empty", async () => {
    mockHappyInvitation();
    const res = await POST(jsonReq({ answers: [] }) as never, aliasParams("demo"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("EMPTY_ANSWERS");
  });

  it("400 MISSING_REQUIRED_KEY when required q1 is absent", async () => {
    mockHappyInvitation();
    const res = await POST(
      jsonReq({ answers: [{ stableKey: "q-unknown", value: 0 }] }) as never,
      aliasParams("demo")
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    // scoreSubmission throws UNKNOWN_STABLE_KEY first (q-unknown is not in version).
    expect(body.error).toBe("UNKNOWN_STABLE_KEY");
  });

  it("400 NON_INTEGER for fractional value", async () => {
    mockHappyInvitation();
    const res = await POST(
      jsonReq({ answers: [{ stableKey: "q1", value: 1.5 }] }) as never,
      aliasParams("demo")
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("NON_INTEGER");
  });

  it("400 OUT_OF_RANGE for value above scale.max", async () => {
    mockHappyInvitation();
    const res = await POST(
      jsonReq({ answers: [{ stableKey: "q1", value: 99 }] }) as never,
      aliasParams("demo")
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("OUT_OF_RANGE");
  });

  it("400 INVALID_TYPE for string value", async () => {
    mockHappyInvitation();
    const res = await POST(
      jsonReq({ answers: [{ stableKey: "q1", value: "2" }] }) as never,
      aliasParams("demo")
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("INVALID_TYPE");
  });

  it("400 INVALID_TYPE for NaN", async () => {
    mockHappyInvitation();
    const res = await POST(
      jsonReq({ answers: [{ stableKey: "q1", value: Number.NaN }] }) as never,
      aliasParams("demo")
    );
    // NaN JSON-serializes to null which fails as INVALID_TYPE.
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("INVALID_TYPE");
  });

  it("400 DUPLICATE_STABLE_KEY when same stableKey repeats", async () => {
    mockHappyInvitation();
    const res = await POST(
      jsonReq({
        answers: [
          { stableKey: "q1", value: 1 },
          { stableKey: "q1", value: 2 },
        ],
      }) as never,
      aliasParams("demo")
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("DUPLICATE_STABLE_KEY");
  });

  it("happy path: 200 with submissionId", async () => {
    mockHappyInvitation();
    const res = await POST(
      jsonReq({ answers: [{ stableKey: "q1", value: 2 }] }) as never,
      aliasParams("demo")
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { submissionId: string } };
    expect(body.data.submissionId).toBe("sub-1");
    expect(txMock.assessmentSubmission.create).toHaveBeenCalledTimes(1);
    expect(txMock.assessmentInvitation.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { status: "SUBMITTED", submittedAt: expect.any(Date) },
    });
  });

  it("409 on double-submit (status already SUBMITTED at lock time)", async () => {
    mockHappyInvitation({ status: "SUBMITTED" });
    const res = await POST(
      jsonReq({ answers: [{ stableKey: "q1", value: 2 }] }) as never,
      aliasParams("demo")
    );
    expect(res.status).toBe(409);
    expect(txMock.assessmentSubmission.create).not.toHaveBeenCalled();
  });

  // I1: the GENUINE under-lock race — Phase 1 (lock-free read) sees VIEWED and
  // PASSES the fast-fail gate, so the request proceeds past the early 409 and
  // into the tx; only the Phase-2 SELECT … FOR UPDATE re-read sees SUBMITTED
  // (a concurrent submit landed between the two reads). The 409 here therefore
  // comes from the under-lock conflict branch, NOT the Phase-1 early return.
  it("409 from the UNDER-LOCK re-read (Phase 1 VIEWED, Phase 2 SUBMITTED) — no submission, no outbox", async () => {
    // Phase 1 (lock-free, full include) sees VIEWED → passes gating, opens tx.
    const phase1Invitation = {
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
        templateId: "template-su-full",
        organizationId: "org-1",
        alias: "demo",
        deletedAt: null,
        status: "ACTIVE",
        accessMode: "INVITED",
        openAt: new Date(Date.now() - 1000),
        closeAt: null,
        sendResultsToRespondent: true,
        notifyCoachOnCompletion: true,
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
          resultsEmailSubject: "Your results",
          resultsEmailBodyMarkdown: "Here are your results.",
          resultsEmailContentApproved: true,
          resultsEmailContentApprovedHash: "a".repeat(64),
        },
      },
    };
    dbMock.assessmentInvitation.findUnique.mockResolvedValue(phase1Invitation);

    // Phase 2 (the SELECT … FOR UPDATE re-read) sees the SAME invitation, but a
    // concurrent submit already flipped it to SUBMITTED under the lock.
    txMock.assessmentInvitation.findUnique.mockResolvedValue({
      ...phase1Invitation,
      status: "SUBMITTED",
    });

    const res = await POST(
      jsonReq({ answers: [{ stableKey: "q1", value: 2 }] }) as never,
      aliasParams("demo")
    );

    expect(res.status).toBe(409);
    // The conflict was caught under the lock — no submission row was created…
    expect(txMock.assessmentSubmission.create).not.toHaveBeenCalled();
    // …and no outbox rows were inserted (the INSERT loop runs only after create).
    expect(txMock.assessmentEmailOutbox.create).not.toHaveBeenCalled();
    // Prove this exercised the locked path, NOT the Phase-1 early return: the tx
    // opened and the under-lock re-read actually ran.
    expect(txMock.assessmentInvitation.findUnique).toHaveBeenCalledTimes(1);
    expect(transactionCommitMarker).not.toHaveBeenCalled();
    expect(transactionRollbackMarker).toHaveBeenCalledTimes(1);
  });

  it("404 when the under-lock invited campaign has no organization", async () => {
    const phase1Invitation = mockHappyInvitation();
    txMock.assessmentInvitation.findUnique.mockResolvedValue({
      ...phase1Invitation,
      campaign: {
        ...phase1Invitation.campaign,
        organizationId: null,
      },
    });

    const res = await POST(
      jsonReq({ answers: [{ stableKey: "q1", value: 2 }] }) as never,
      aliasParams("demo"),
    );

    expect(res.status).toBe(404);
    expect(txMock.assessmentSubmission.create).not.toHaveBeenCalled();
    expect(transactionCommitMarker).not.toHaveBeenCalled();
    expect(transactionRollbackMarker).toHaveBeenCalledTimes(1);
  });

  it("rolls back the freeze when the invitation is revoked under the lock", async () => {
    const phase1Invitation = mockHappyInvitation();
    txMock.assessmentInvitation.findUnique.mockResolvedValue({
      ...phase1Invitation,
      revokedAt: new Date(),
    });
    const lockTransactionStates: boolean[] = [];
    reportStyleLockMock.mockImplementation(() => {
      lockTransactionStates.push(transactionActive);
      return Promise.resolve("MODERN_DASHBOARD");
    });

    const res = await POST(
      jsonReq({ answers: [{ stableKey: "q1", value: 2 }] }) as never,
      aliasParams("demo"),
    );

    expect(res.status).toBe(410);
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: "This survey is no longer available.",
    });
    expect(lockTransactionStates).toEqual([true]);
    expect(transactionCommitMarker).not.toHaveBeenCalled();
    expect(transactionRollbackMarker).toHaveBeenCalledTimes(1);
    expect(txMock.assessmentSubmission.create).not.toHaveBeenCalled();
    expect(txMock.assessmentEmailOutbox.create).not.toHaveBeenCalled();
  });

  it("401 when no session", async () => {
    sessionState.invitationId = undefined as unknown as string;
    sessionState.campaignAlias = undefined as unknown as string;
    const res = await POST(
      jsonReq({ answers: [{ stableKey: "q1", value: 2 }] }) as never,
      aliasParams("demo")
    );
    expect(res.status).toBe(401);
  });
});

describe("report style first-completion freeze", () => {
  it("awaits the campaign freeze before any later transaction operation and reuses its completion instant", async () => {
    mockHappyInvitation();
    let releaseLock: (() => void) | undefined;
    const lockStarted = new Promise<void>((resolve) => {
      reportStyleLockMock.mockImplementationOnce(() => {
        resolve();
        return new Promise<string>((release) => {
          releaseLock = () => release("CLASSIC");
        });
      });
    });

    const request = POST(
      jsonReq({ answers: [{ stableKey: "q1", value: 2 }] }) as never,
      aliasParams("demo"),
    );
    const firstEvent = await Promise.race([
      lockStarted.then(() => "lock-started"),
      request.then(() => "request-completed"),
    ]);

    expect(firstEvent).toBe("lock-started");
    expect(txMock.$executeRaw).not.toHaveBeenCalled();
    expect(txMock.assessmentInvitation.findUnique).not.toHaveBeenCalled();
    expect(txMock.assessmentSubmission.create).not.toHaveBeenCalled();

    releaseLock?.();
    const response = await request;
    expect(response.status).toBe(200);
    const [lockedTx, lockedCampaignId, lockedSubmittedAt] =
      reportStyleLockMock.mock.calls[0];
    const submissionData =
      txMock.assessmentSubmission.create.mock.calls[0][0].data;
    expect(lockedTx).toBe(txMock);
    expect(lockedCampaignId).toBe("c1");
    expect(submissionData.submittedAt).toBe(lockedSubmittedAt);
  });

  it("does not leave a report-style freeze outside a transaction when a later write fails", async () => {
    mockHappyInvitation();
    const lockTransactionStates: boolean[] = [];
    reportStyleLockMock.mockImplementation(() => {
      lockTransactionStates.push(transactionActive);
      return Promise.resolve("MODERN_DASHBOARD");
    });
    txMock.assessmentSubmission.create.mockRejectedValueOnce(
      new Error("later transaction write failed"),
    );

    const response = await POST(
      jsonReq({ answers: [{ stableKey: "q1", value: 2 }] }) as never,
      aliasParams("demo"),
    );

    expect(response.status).toBe(500);
    expect(lockTransactionStates).toEqual([true]);
    expect(reportStyleLockMock).toHaveBeenCalledTimes(1);
    expect(transactionCommitMarker).not.toHaveBeenCalled();
    expect(transactionRollbackMarker).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------------------- */
/*  Wave D Task 6a — outbox enqueue (#15 results + #16 coach-notify)          */
/* -------------------------------------------------------------------------- */
describe("Wave D — outbox enqueue", () => {
  function submit() {
    return POST(
      jsonReq({ answers: [{ stableKey: "q1", value: 2 }] }) as never,
      aliasParams("demo")
    );
  }
  function enqueuedRoles(): string[] {
    return txMock.assessmentEmailOutbox.create.mock.calls.map(
      (c: Array<{ data: { recipientRole: string } }>) => c[0].data.recipientRole
    );
  }
  function resultRow(): { bodyHtml: string } {
    const row = txMock.assessmentEmailOutbox.create.mock.calls
      .map(
        (call: Array<{ data: { emailType: string; bodyHtml: string } }>) =>
          call[0].data,
      )
      .find((candidate) => candidate.emailType === "ASSESSMENT_RESULTS");
    if (!row) throw new Error("ASSESSMENT_RESULTS row was not enqueued");
    return row;
  }

  function enqueuedTypes(): string[] {
    return txMock.assessmentEmailOutbox.create.mock.calls.map(
      (call: Array<{ data: { emailType: string } }>) => call[0].data.emailType,
    );
  }

  it("keeps invited report HTML legacy when GH #228 is off", async () => {
    mockHappyInvitation();
    const res = await submit();
    expect(res.status).toBe(200);
    const row = resultRow();
    expect(row.bodyHtml).toContain(">SCALING UP<");
    expect(row.bodyHtml).not.toContain("cid:su-report-logo-v1");
  });

  it("brands invited results with creator coach only", async () => {
    process.env.WAVE_228_REPORT_EMAIL_CHROME_ENABLED = "1";
    mockHappyInvitation({
      creatorCoachEmail: "creator@example.com",
      creatorCoachFirstName: "Casey",
      creatorCoachLastName: "Coach",
      creatorCoachProfileImage: "https://images.example/casey.png",
    });

    const res = await submit();
    expect(res.status).toBe(200);
    const row = resultRow();
    expect(row.bodyHtml).toContain("cid:su-report-logo-v1");
    expect(row.bodyHtml).toContain("Coached by Casey Coach");
    expect(row.bodyHtml).toContain("https://images.example/casey.png");
  });

  it("drops only a branded stale results row when creator presentation changes under lock", async () => {
    process.env.WAVE_228_REPORT_EMAIL_CHROME_ENABLED = "1";
    const phase1 = mockHappyInvitation({
      creatorCoachFirstName: "Casey",
      creatorCoachLastName: "Coach",
      creatorCoachProfileImage: "https://images.example/old.png",
    });
    const phase2 = {
      ...phase1,
      campaign: {
        ...phase1.campaign,
        creatorCoach: {
          ...phase1.campaign.creatorCoach!,
          lastName: "Updated",
          profileImage: "https://images.example/new.png",
        },
      },
    };
    txMock.assessmentInvitation.findUnique.mockResolvedValue(phase2);

    const res = await submit();
    expect(res.status).toBe(200);
    expect(enqueuedTypes()).not.toContain("ASSESSMENT_RESULTS");
    expect(txMock.assessmentSubmission.create).toHaveBeenCalledTimes(1);
  });

  it("ignores creator presentation drift in legacy mode", async () => {
    const phase1 = mockHappyInvitation({
      creatorCoachFirstName: "Casey",
      creatorCoachLastName: "Coach",
      creatorCoachProfileImage: "https://images.example/old.png",
    });
    const phase2 = {
      ...phase1,
      campaign: {
        ...phase1.campaign,
        creatorCoach: {
          ...phase1.campaign.creatorCoach!,
          lastName: "Updated",
          profileImage: "https://images.example/new.png",
        },
      },
    };
    txMock.assessmentInvitation.findUnique.mockResolvedValue(phase2);

    const res = await submit();
    expect(res.status).toBe(200);
    expect(enqueuedTypes()).toContain("ASSESSMENT_RESULTS");
  });

  it("drops only the stale results row when the chrome variant changes under lock", async () => {
    process.env.WAVE_228_REPORT_EMAIL_CHROME_ENABLED = "1";
    const invitation = mockHappyInvitation();
    txMock.assessmentInvitation.findUnique.mockImplementation(async () => {
      process.env.WAVE_228_REPORT_EMAIL_CHROME_KILL = "1";
      return invitation;
    });

    const res = await submit();
    expect(res.status).toBe(200);
    expect(enqueuedTypes()).not.toContain("ASSESSMENT_RESULTS");
    expect(txMock.assessmentSubmission.create).toHaveBeenCalledTimes(1);
  });

  it("enqueues exactly ONE RESPONDENT row (#15) + ONE OWNING_COACH row (#16) on the happy path", async () => {
    mockHappyInvitation();
    const res = await submit();
    expect(res.status).toBe(200);
    const roles = enqueuedRoles();
    expect(roles).toContain("RESPONDENT");
    expect(roles).toContain("OWNING_COACH");
    expect(roles).toHaveLength(2);
  });

  it("builds three style-specific report models but renders style-independent email HTML once", async () => {
    mockHappyInvitation();
    const reportEmail = jest.requireMock(
      "@/lib/assessments/report-email",
    ) as {
      buildRespondentReportFromSubmission: jest.Mock;
      buildReportEmailHtml: jest.Mock;
    };
    const resultsEmail = jest.requireMock(
      "@/lib/assessments/results-email",
    ) as {
      buildResultsEmailHtml: jest.Mock;
      buildCoachNotifyEmail: jest.Mock;
    };

    const res = await submit();

    expect(res.status).toBe(200);
    expect(
      reportEmail.buildRespondentReportFromSubmission,
    ).toHaveBeenCalledTimes(3);
    expect(reportEmail.buildReportEmailHtml).toHaveBeenCalledTimes(1);
    expect(resultsEmail.buildResultsEmailHtml).toHaveBeenCalledTimes(1);
    expect(resultsEmail.buildCoachNotifyEmail).toHaveBeenCalledTimes(1);
  });

  it("#15 RESPONDENT row carries the respondent email + ASSESSMENT_RESULTS type + submission id", async () => {
    const invitation = mockHappyInvitation();
    invitation.campaign.template.resultsEmailSubject =
      "{{respondentFirstName}} — your results";
    invitation.campaign.template.resultsEmailBodyMarkdown =
      "Hi {{respondentFirstName}}, your results are ready.";
    await submit();
    const row = txMock.assessmentEmailOutbox.create.mock.calls
      .map((c: Array<{ data: Record<string, unknown> }>) => c[0].data)
      .find((d: { recipientRole: string }) => d.recipientRole === "RESPONDENT");
    expect(row).toBeDefined();
    expect(row!.recipientEmail).toBe("respondent@example.com");
    expect(row!.emailType).toBe("ASSESSMENT_RESULTS");
    expect(row!.submissionId).toBe("sub-1");
    expect(row!.subject).toBe("Resp — your results");
    expect(row!.bodyHtml).toContain("Hi Resp, your results are ready.");
  });

  it("#16 OWNING_COACH row carries the coach email + COACH_COMPLETION type", async () => {
    mockHappyInvitation();
    await submit();
    const row = txMock.assessmentEmailOutbox.create.mock.calls
      .map((c: Array<{ data: Record<string, unknown> }>) => c[0].data)
      .find((d: { recipientRole: string }) => d.recipientRole === "OWNING_COACH");
    expect(row).toBeDefined();
    expect(row!.recipientEmail).toBe("coach@example.com");
    expect(row!.emailType).toBe("COACH_COMPLETION");
    expect(row!.submissionId).toBe("sub-1");
  });

  it("does NOT enqueue #15 when the results email is UNAPPROVED", async () => {
    mockHappyInvitation();
    approvedState.approved = false;
    await submit();
    expect(enqueuedRoles()).not.toContain("RESPONDENT");
    // #16 still fires (independent gate).
    expect(enqueuedRoles()).toContain("OWNING_COACH");
  });

  it("does NOT enqueue #15 when the results-email flag is OFF", async () => {
    mockHappyInvitation();
    flagState.results = false;
    await submit();
    expect(enqueuedRoles()).not.toContain("RESPONDENT");
  });

  it("does NOT enqueue #15 when sendResultsToRespondent is false", async () => {
    mockHappyInvitation({ sendResultsToRespondent: false });
    await submit();
    expect(enqueuedRoles()).not.toContain("RESPONDENT");
  });

  it("enqueues NOTHING when sends are paused", async () => {
    mockHappyInvitation();
    flagState.paused = true;
    await submit();
    expect(txMock.assessmentEmailOutbox.create).not.toHaveBeenCalled();
  });

  it("does NOT enqueue #16 when the coach-notify flag is OFF", async () => {
    mockHappyInvitation();
    flagState.coach = false;
    await submit();
    expect(enqueuedRoles()).not.toContain("OWNING_COACH");
    expect(enqueuedRoles()).toContain("RESPONDENT");
  });

  it("does NOT enqueue #16 when notifyCoachOnCompletion is false", async () => {
    mockHappyInvitation({ notifyCoachOnCompletion: false });
    await submit();
    expect(enqueuedRoles()).not.toContain("OWNING_COACH");
  });

  it("does NOT enqueue #16 when the campaign has no creator coach", async () => {
    mockHappyInvitation({ createdByCoachId: null, creatorCoachEmail: null });
    await submit();
    expect(enqueuedRoles()).not.toContain("OWNING_COACH");
  });

  it("enqueues NOTHING on a double-submit (409)", async () => {
    mockHappyInvitation({ status: "SUBMITTED" });
    const res = await submit();
    expect(res.status).toBe(409);
    expect(txMock.assessmentEmailOutbox.create).not.toHaveBeenCalled();
  });

  it("a render failure for one email does NOT roll back the submission (still 200)", async () => {
    mockHappyInvitation();
    const { buildResultsEmailHtml } = jest.requireMock(
      "@/lib/assessments/results-email"
    );
    (buildResultsEmailHtml as jest.Mock).mockImplementation(() => {
      throw new Error("render boom");
    });
    const res = await submit();
    expect(res.status).toBe(200);
    // The submission was still created.
    expect(txMock.assessmentSubmission.create).toHaveBeenCalledTimes(1);
    // #15 skipped (render threw); #16 still enqueued.
    expect(enqueuedRoles()).not.toContain("RESPONDENT");
    expect(enqueuedRoles()).toContain("OWNING_COACH");
  });

  it("aborts completion when a prepared legacy outbox row fails Prisma validation", async () => {
    mockHappyInvitation();
    const validationError = new Error("prepared outbox row rejected");
    validationError.name = "PrismaClientValidationError";
    txMock.assessmentEmailOutbox.create.mockRejectedValueOnce(validationError);

    const res = await submit();

    expect(res.status).toBe(500);
    expect(txMock.assessmentSubmission.create).toHaveBeenCalledTimes(1);
    expect(txMock.assessmentInvitation.update).not.toHaveBeenCalled();
    expect(transactionCommitMarker).not.toHaveBeenCalled();
    expect(transactionRollbackMarker).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------------------- */
/*  co-validate C-M2 — re-validate email render inputs UNDER the submit lock  */
/*                                                                            */
/*  Phase 1 (lock-free) renders + decides the #15/#16 outbox rows from the    */
/*  campaign/template state read there. If that state changes during the      */
/*  Phase-1 → Phase-2 window (approval revoked, content edited, toggle        */
/*  flipped), the locked tx must DROP the now-stale prepared row rather than  */
/*  insert it. The submission itself still commits.                          */
/* -------------------------------------------------------------------------- */
describe("Wave D C-M2 — stale email render-input re-check under the lock", () => {
  function submit() {
    return POST(
      jsonReq({ answers: [{ stableKey: "q1", value: 2 }] }) as never,
      aliasParams("demo")
    );
  }
  function enqueuedRoles(): string[] {
    return txMock.assessmentEmailOutbox.create.mock.calls.map(
      (c: Array<{ data: { recipientRole: string } }>) => c[0].data.recipientRole
    );
  }

  it("SKIPS the #15 ASSESSMENT_RESULTS row when the approval hash changed between Phase 1 and Phase 2 (submission still 200)", async () => {
    // Phase 1 sees the template approved with hash "hash-A" → #15 prepared.
    mockHappyInvitation();
    // Phase 2 (under lock) sees a DIFFERENT approval hash — content was edited /
    // re-approved (or the approval was cleared) during the window.
    const locked = {
      id: "inv-1",
      status: "VIEWED",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      respondentId: "r1",
      campaignId: "c1",
      respondent: {
        email: "respondent@example.com",
        firstName: "Resp",
      },
      campaign: {
        id: "c1",
        alias: "demo",
        deletedAt: null,
        status: "ACTIVE",
        accessMode: "INVITED",
        openAt: new Date(Date.now() - 1000),
        closeAt: null,
        sendResultsToRespondent: true,
        notifyCoachOnCompletion: true,
        createdByCoachId: "coach-1",
        creatorCoach: { email: "coach@example.com" },
        version: { id: "v1" },
        template: {
          name: "Rockefeller Habits Checklist",
          alias: "rockefeller",
          resultsEmailSubject: "Your results",
          resultsEmailBodyMarkdown: "Here are your results.",
          resultsEmailContentApproved: true,
          resultsEmailContentApprovedHash: "hash-B-changed",
        },
      },
    };
    txMock.assessmentInvitation.findUnique.mockResolvedValue(locked);

    const res = await submit();
    expect(res.status).toBe(200);
    // Submission committed.
    expect(txMock.assessmentSubmission.create).toHaveBeenCalledTimes(1);
    // #15 dropped — its render inputs went stale under the lock…
    expect(enqueuedRoles()).not.toContain("RESPONDENT");
    // …but #16 is unaffected (its inputs did not change).
    expect(enqueuedRoles()).toContain("OWNING_COACH");
  });

  it("SKIPS the #15 row when the respondent first name changed between Phase 1 and Phase 2", async () => {
    const phase1 = mockHappyInvitation();
    const locked = {
      ...phase1,
      respondent: {
        ...phase1.respondent,
        firstName: "Renamed",
      },
    };
    txMock.assessmentInvitation.findUnique.mockResolvedValue(locked);

    const res = await submit();
    expect(res.status).toBe(200);
    expect(enqueuedRoles()).not.toContain("RESPONDENT");
    expect(enqueuedRoles()).toContain("OWNING_COACH");
  });

  it("SKIPS the #15 row when sendResultsToRespondent was turned OFF between Phase 1 and Phase 2", async () => {
    mockHappyInvitation();
    const locked = {
      id: "inv-1",
      status: "VIEWED",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      respondentId: "r1",
      campaignId: "c1",
      campaign: {
        id: "c1",
        alias: "demo",
        deletedAt: null,
        status: "ACTIVE",
        accessMode: "INVITED",
        openAt: new Date(Date.now() - 1000),
        closeAt: null,
        sendResultsToRespondent: false, // toggled OFF during the window
        notifyCoachOnCompletion: true,
        createdByCoachId: "coach-1",
        creatorCoach: { email: "coach@example.com" },
        version: { id: "v1" },
        template: {
          name: "Rockefeller Habits Checklist",
          alias: "rockefeller",
          resultsEmailSubject: "Your results",
          resultsEmailBodyMarkdown: "Here are your results.",
          resultsEmailContentApproved: true,
          resultsEmailContentApprovedHash: "a".repeat(64),
        },
      },
    };
    txMock.assessmentInvitation.findUnique.mockResolvedValue(locked);

    const res = await submit();
    expect(res.status).toBe(200);
    expect(enqueuedRoles()).not.toContain("RESPONDENT");
    expect(enqueuedRoles()).toContain("OWNING_COACH");
  });

  it("SKIPS the #16 COACH_COMPLETION row when notifyCoachOnCompletion was turned OFF between Phase 1 and Phase 2", async () => {
    mockHappyInvitation();
    const locked = {
      id: "inv-1",
      status: "VIEWED",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      respondentId: "r1",
      campaignId: "c1",
      respondent: {
        email: "respondent@example.com",
        firstName: "Resp",
      },
      campaign: {
        id: "c1",
        alias: "demo",
        deletedAt: null,
        status: "ACTIVE",
        accessMode: "INVITED",
        openAt: new Date(Date.now() - 1000),
        closeAt: null,
        sendResultsToRespondent: true,
        notifyCoachOnCompletion: false, // toggled OFF during the window
        createdByCoachId: "coach-1",
        creatorCoach: { email: "coach@example.com" },
        version: { id: "v1" },
        template: {
          name: "Rockefeller Habits Checklist",
          alias: "rockefeller",
          resultsEmailSubject: "Your results",
          resultsEmailBodyMarkdown: "Here are your results.",
          resultsEmailContentApproved: true,
          resultsEmailContentApprovedHash: "a".repeat(64),
        },
      },
    };
    txMock.assessmentInvitation.findUnique.mockResolvedValue(locked);

    const res = await submit();
    expect(res.status).toBe(200);
    expect(enqueuedRoles()).not.toContain("OWNING_COACH");
    // #15 unaffected.
    expect(enqueuedRoles()).toContain("RESPONDENT");
  });

  it("INSERTS both rows when the Phase-1 and Phase-2 render-input fingerprints MATCH (unchanged)", async () => {
    // mockHappyInvitation sets BOTH the Phase-1 (db) and Phase-2 (tx) reads to
    // the SAME invitation object → fingerprints match → both rows inserted.
    // (The Phase-2 object must therefore carry the same render-input fields the
    // fingerprint compares: alias + approval hash + toggles + version id.)
    const invitation = {
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
        alias: "demo",
        deletedAt: null,
        status: "ACTIVE",
        accessMode: "INVITED",
        openAt: new Date(Date.now() - 1000),
        closeAt: null,
        sendResultsToRespondent: true,
        notifyCoachOnCompletion: true,
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
          resultsEmailContentApprovedHash: "a".repeat(64),
        },
      },
    };
    dbMock.assessmentInvitation.findUnique.mockResolvedValue(invitation);
    txMock.assessmentInvitation.findUnique.mockResolvedValue(invitation);

    const res = await submit();
    expect(res.status).toBe(200);
    expect(enqueuedRoles()).toContain("RESPONDENT");
    expect(enqueuedRoles()).toContain("OWNING_COACH");
    expect(enqueuedRoles()).toHaveLength(2);
  });
});

/* -------------------------------------------------------------------------- */
/*  GH #257 — invited submission atomically freezes delivery intents          */
/* -------------------------------------------------------------------------- */
describe("GH #257 — assessment email delivery intents", () => {
  function submit() {
    return POST(
      jsonReq({ answers: [{ stableKey: "q1", value: 2 }] }) as never,
      aliasParams("demo"),
    );
  }

  function intentRows(): Array<Record<string, unknown>> {
    return txMock.assessmentEmailDeliveryIntent.create.mock.calls.map(
      (call: Array<{ data: Record<string, unknown> }>) => call[0].data,
    );
  }

  function intentRoles(): string[] {
    return intentRows().map((row) => row.recipientRole as string);
  }

  it("flag on atomically creates two valid intents and no direct outbox rows", async () => {
    const lockedCloseAt = new Date(Date.now() + 43_200_000);
    const invitation = mockHappyInvitation({ closeAt: lockedCloseAt });
    flagState.intents = true;
    txMock.assessmentSubmission.create.mockResolvedValue({ id: "submission-1" });

    const res = await submit();

    expect(res.status).toBe(200);
    expect(txMock.assessmentEmailDeliveryIntent.create).toHaveBeenCalledTimes(2);
    expect(txMock.assessmentEmailOutbox.create).not.toHaveBeenCalled();
    expect(intentRoles().sort()).toEqual(["OWNING_COACH", "RESPONDENT"]);

    for (const row of intentRows()) {
      const parsed = parseAuthorizationSnapshot(row.authorizationSnapshot);
      expect(parsed.supported).toBe(true);
      if (!parsed.supported) throw new Error("Expected a v1 authorization snapshot");
      expect(parsed.value.common).toEqual(
        expect.objectContaining({
          campaignId: "c1",
          invitationId: "inv-1",
          respondentId: "r1",
          templateId: "template-1",
          templateAlias: "rockefeller",
          versionId: "v1",
          accessMode: "INVITED",
          campaignStatus: "ACTIVE",
          campaignDeleted: false,
          invitationStatus: "SUBMITTED",
          invitationRevoked: false,
          closeAt: lockedCloseAt.toISOString(),
          invitationExpiresAt: invitation.expiresAt.toISOString(),
          phase2Fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      );
      expect(row.contentProvenance).toEqual(
        expect.objectContaining({
          schemaVersion: 1,
          templateId: "template-1",
          versionId: "v1",
          templateAlias: "rockefeller",
          rendererContractVersion: 1,
          renderInputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      );
      const intentCreatedAt = row.createdAt as Date;
      expect(intentCreatedAt).toBeInstanceOf(Date);
      expect(row.nextAttemptAt).toEqual(intentCreatedAt);
      expect((row.expiresAt as Date).getTime() - intentCreatedAt.getTime()).toBe(
        30 * 24 * 60 * 60 * 1_000,
      );
    }

    const frozenJson = JSON.stringify(intentRows());
    expect(frozenJson).not.toContain('"rawAnswers"');
    expect(frozenJson).not.toContain('"answers"');
    expect(frozenJson).not.toContain('"result"');

    const lastIntentCreateOrder =
      txMock.assessmentEmailDeliveryIntent.create.mock.invocationCallOrder.at(-1)!;
    expect(lastIntentCreateOrder).toBeLessThan(
      txMock.assessmentInvitation.update.mock.invocationCallOrder[0],
    );
  });

  it("evaluates the required intent-mode flag exactly once per request", async () => {
    mockHappyInvitation();
    flagState.intents = true;

    const res = await submit();

    expect(res.status).toBe(200);
    expect(assessmentEmailDeliveryIntentsEnabled).toHaveBeenCalledTimes(1);
  });

  it("flag on still creates valid intents while sends are globally paused", async () => {
    mockHappyInvitation();
    flagState.intents = true;
    flagState.paused = true;

    const res = await submit();

    expect(res.status).toBe(200);
    expect(txMock.assessmentEmailDeliveryIntent.create).toHaveBeenCalledTimes(2);
    expect(txMock.assessmentEmailOutbox.create).not.toHaveBeenCalled();
    expect(inngestMock.send).toHaveBeenCalledTimes(1);
  });

  it("flag off preserves the existing direct-outbox path and paused early return", async () => {
    mockHappyInvitation();
    flagState.intents = false;

    const unpaused = await submit();

    expect(unpaused.status).toBe(200);
    expect(txMock.assessmentEmailOutbox.create).toHaveBeenCalledTimes(2);
    expect(txMock.assessmentEmailDeliveryIntent.create).not.toHaveBeenCalled();
    expect(inngestMock.send).not.toHaveBeenCalled();

    txMock.assessmentEmailOutbox.create.mockClear();
    txMock.assessmentEmailDeliveryIntent.create.mockClear();
    inngestMock.send.mockClear();
    flagState.paused = true;

    const paused = await submit();

    expect(paused.status).toBe(200);
    expect(txMock.assessmentEmailOutbox.create).not.toHaveBeenCalled();
    expect(txMock.assessmentEmailDeliveryIntent.create).not.toHaveBeenCalled();
    expect(inngestMock.send).not.toHaveBeenCalled();
  });

  it("creates no respondent intent when its feature gate is off", async () => {
    mockHappyInvitation();
    flagState.intents = true;
    flagState.results = false;

    const res = await submit();

    expect(res.status).toBe(200);
    expect(intentRoles()).toEqual(["OWNING_COACH"]);
  });

  it("creates no respondent intent when the report renderer signals renderError", async () => {
    mockHappyInvitation();
    flagState.intents = true;
    const { buildReportEmailHtml } = jest.requireMock(
      "@/lib/assessments/report-email",
    );
    (buildReportEmailHtml as jest.Mock).mockReturnValue({
      subject: "unused-report-subject",
      bodyHtml: "<p>degraded fallback</p>",
      renderError:
        "private respondent@example.com subject and HTML must not be logged",
    });
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const res = await submit();

    expect(res.status).toBe(200);
    expect(intentRoles()).toEqual(["OWNING_COACH"]);
    const logJson = JSON.stringify(errorSpy.mock.calls);
    expect(logJson).toContain("ReportRenderError");
    expect(logJson).not.toContain("respondent@example.com");
    expect(logJson).not.toContain("subject and HTML");
    errorSpy.mockRestore();
  });

  it("keeps the legacy fallback row when the intent flag is off and the renderer signals renderError", async () => {
    mockHappyInvitation();
    flagState.intents = false;
    const { buildReportEmailHtml } = jest.requireMock(
      "@/lib/assessments/report-email",
    );
    (buildReportEmailHtml as jest.Mock).mockReturnValue({
      subject: "unused-report-subject",
      bodyHtml: "<p>degraded fallback</p>",
      renderError: "qualitative render failed",
    });
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const res = await submit();

    expect(res.status).toBe(200);
    expect(
      txMock.assessmentEmailOutbox.create.mock.calls.map(
        (call: Array<{ data: { recipientRole: string } }>) =>
          call[0].data.recipientRole,
      ),
    ).toEqual(["RESPONDENT", "OWNING_COACH"]);
    errorSpy.mockRestore();
  });

  it("creates no respondent intent and sanitizes the log when rendering throws", async () => {
    mockHappyInvitation();
    flagState.intents = true;
    const { buildResultsEmailHtml } = jest.requireMock(
      "@/lib/assessments/results-email",
    );
    const renderFailure = Object.assign(
      new Error(
        "private respondent@example.com subject and HTML must not be logged",
      ),
      {
        recipientEmail: "respondent@example.com",
        subject: "private subject",
        bodyHtml: "<p>private HTML</p>",
        answers: [{ stableKey: "q1", value: 2 }],
      },
    );
    renderFailure.name = "ResultsRenderError";
    (buildResultsEmailHtml as jest.Mock).mockImplementation(() => {
      throw renderFailure;
    });
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const res = await submit();

    expect(res.status).toBe(200);
    expect(intentRoles()).toEqual(["OWNING_COACH"]);
    const logJson = JSON.stringify(errorSpy.mock.calls);
    expect(logJson).toContain("ResultsRenderError");
    expect(logJson).not.toContain("respondent@example.com");
    expect(logJson).not.toContain("private subject");
    expect(logJson).not.toContain("private HTML");
    expect(logJson).not.toContain("stableKey");
    expect(errorSpy.mock.calls.flat()).not.toContain(renderFailure);
    errorSpy.mockRestore();
  });

  it("creates no respondent intent when its Phase-2 fingerprint is stale", async () => {
    const invitation = mockHappyInvitation();
    flagState.intents = true;
    txMock.assessmentInvitation.findUnique.mockResolvedValue({
      ...invitation,
      campaign: {
        ...invitation.campaign,
        template: {
          ...invitation.campaign.template,
          resultsEmailContentApprovedHash: "b".repeat(64),
        },
      },
    });

    const res = await submit();

    expect(res.status).toBe(200);
    expect(intentRoles()).toEqual(["OWNING_COACH"]);
  });

  it("lets an intent create failure fail the whole request and leaves it retryable", async () => {
    mockHappyInvitation();
    flagState.intents = true;
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const persistenceFailure = Object.assign(
      new Error(
        "private respondent@example.com subject and HTML must not be logged",
      ),
      {
        recipientEmail: "respondent@example.com",
        subject: "private subject",
        bodyHtml: "<p>private HTML</p>",
        answers: [{ stableKey: "q1", value: 2 }],
      },
    );
    persistenceFailure.name = "PrismaClientKnownRequestError";
    txMock.assessmentEmailDeliveryIntent.create
      .mockRejectedValueOnce(persistenceFailure)
      .mockResolvedValue({});

    const first = await submit();

    expect(first.status).toBe(500);
    expect(txMock.assessmentInvitation.update).not.toHaveBeenCalled();
    expect(inngestMock.send).not.toHaveBeenCalled();
    const failureLogJson = JSON.stringify(errorSpy.mock.calls);
    expect(failureLogJson).toContain("PrismaClientKnownRequestError");
    expect(failureLogJson).not.toContain("respondent@example.com");
    expect(failureLogJson).not.toContain("private subject");
    expect(failureLogJson).not.toContain("private HTML");
    expect(failureLogJson).not.toContain("stableKey");
    expect(errorSpy.mock.calls.flat()).not.toContain(persistenceFailure);

    const retry = await submit();

    expect(retry.status).toBe(200);
    expect(txMock.assessmentInvitation.update).toHaveBeenCalledTimes(1);
    expect(inngestMock.send).toHaveBeenCalledTimes(1);

    errorSpy.mockRestore();
  });

  it("dispatches one ID-only event after commit", async () => {
    mockHappyInvitation();
    flagState.intents = true;
    txMock.assessmentSubmission.create.mockResolvedValue({ id: "submission-1" });

    const res = await submit();

    expect(res.status).toBe(200);
    expect(inngestMock.send).toHaveBeenCalledTimes(1);
    expect(inngestMock.send).toHaveBeenCalledWith({
      name: "assessment/email-delivery-intent.created",
      data: { submissionId: "submission-1" },
    });
    expect(JSON.stringify(inngestMock.send.mock.calls)).not.toContain(
      "@example.com",
    );
    expect(transactionCommitMarker.mock.invocationCallOrder[0]).toBeLessThan(
      inngestMock.send.mock.invocationCallOrder[0],
    );
  });

  it("dispatches no event when no intent was created", async () => {
    mockHappyInvitation({
      sendResultsToRespondent: false,
      notifyCoachOnCompletion: false,
    });
    flagState.intents = true;

    const res = await submit();

    expect(res.status).toBe(200);
    expect(txMock.assessmentEmailDeliveryIntent.create).not.toHaveBeenCalled();
    expect(inngestMock.send).not.toHaveBeenCalled();
  });

  it("keeps the 200 response when post-commit event dispatch fails and logs IDs plus error.name only", async () => {
    mockHappyInvitation();
    flagState.intents = true;
    txMock.assessmentSubmission.create.mockResolvedValue({ id: "submission-1" });
    const dispatchError = new Error(
      "private recipient@example.com subject and html must not be logged",
    );
    dispatchError.name = "DispatchError";
    inngestMock.send.mockRejectedValueOnce(dispatchError);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const res = await submit();

    expect(res.status).toBe(200);
    expect(inngestMock.send).toHaveBeenCalledTimes(1);
    const logJson = JSON.stringify(errorSpy.mock.calls);
    expect(logJson).toContain("submission-1");
    expect(logJson).toContain("c1");
    expect(logJson).toContain("inv-1");
    expect(logJson).toContain("DispatchError");
    expect(logJson).not.toContain("recipient@example.com");
    expect(logJson).not.toContain("subject and html");
    errorSpy.mockRestore();
  });
});

// ── #79 / Wave J-1 — SU-Full CEO-only S_BACKGROUND section on the submit path ─
// SU-Full hides the CEO-only S_BACKGROUND section (which holds a REQUIRED
// NUMBER, Q_FTE_CONTRACT) from non-CEO respondents, so their payload never
// carries those keys. The submit/scoring path must apply the same audience drop
// BEFORE the required-key check — otherwise every non-CEO respondent trips
// MISSING_REQUIRED_KEY and can never submit (#79).
describe("#79 — SU-Full CEO-only S_BACKGROUND on submit", () => {
  const suFullVersion = {
    questions: [
      {
        stableKey: "q1",
        sortOrder: 1,
        type: "SLIDER_LIKERT" as const,
        label: "Q1",
        isRequired: true,
        sectionStableKey: "s1",
        scale: { min: 0, max: 10, step: 1, anchorMin: "Lo", anchorMax: "Hi" },
        recommendations: [{ minScore: 0, maxScore: 10, text: "legacy fallback" }],
        phaseRecommendations: buildPhaseRecommendations("Q01"),
      },
      {
        stableKey: "Q_FTE_CONTRACT",
        sortOrder: 2,
        type: "NUMBER" as const,
        label: "Full-time employees",
        isRequired: true,
        sectionStableKey: "S_BACKGROUND",
      },
    ],
    sections: [
      { stableKey: "s1", sortOrder: 1, name: "S1" },
      { stableKey: "S_BACKGROUND", sortOrder: 2, name: "About your company" },
    ],
    scoringConfig: goodVersion.scoringConfig,
  };

  function mockSuFullInvitation(
    isCEO: boolean,
    options: { sendResultsToRespondent?: boolean } = {},
  ) {
    const invitation = {
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
        sendResultsToRespondent: options.sendResultsToRespondent ?? false,
        notifyCoachOnCompletion: false,
        createdByCoachId: "coach-1",
        creatorCoach: {
          email: "coach@example.com",
          firstName: "Casey",
          lastName: "Coach",
          profileImage: null,
        },
        organization: { id: "org-1", name: "Example Organization" },
        version: {
          id: "v1",
          templateId: "template-su-full",
          questions: suFullVersion.questions,
          sections: suFullVersion.sections,
          scoringConfig: suFullVersion.scoringConfig,
        },
        template: {
          id: "template-su-full",
          name: "Scaling Up Full",
          alias: "scaling-up-full",
          resultsEmailSubject: "Your results",
          resultsEmailBodyMarkdown: "Here are your results.",
          resultsEmailContentApproved: true,
          resultsEmailContentApprovedHash: "hash",
        },
      },
    };
    dbMock.assessmentInvitation.findUnique.mockResolvedValue(invitation);
    txMock.assessmentInvitation.findUnique.mockResolvedValue(invitation);
    dbMock.assessmentCampaignParticipant.findUnique.mockResolvedValue({ isCEO });
    txMock.assessmentCampaignParticipant.findUnique.mockResolvedValue({ isCEO });
    return invitation;
  }

  it("non-CEO submits WITHOUT the CEO-only S_BACKGROUND answer → 200 (#79)", async () => {
    mockSuFullInvitation(false);
    const res = await POST(
      jsonReq({ answers: [{ stableKey: "q1", value: 2 }] }) as never,
      aliasParams("demo"),
    );
    expect(res.status).toBe(200);
    const frozen = txMock.assessmentSubmission.create.mock.calls[0][0].data.result;
    expect(frozen.recommendationPhase).toBeUndefined();
    expect(frozen.perQuestion[0].recommendation).toBeUndefined();
  });

  it("CEO still MUST answer the required S_BACKGROUND question → 400 MISSING_REQUIRED_KEY", async () => {
    mockSuFullInvitation(true);
    const res = await POST(
      jsonReq({ answers: [{ stableKey: "q1", value: 2 }] }) as never,
      aliasParams("demo"),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("MISSING_REQUIRED_KEY");
  });

  it("phase-aware CEO submission rejects an invalid required FTE instead of selecting a fallback", async () => {
    mockSuFullInvitation(true);
    const res = await POST(
      jsonReq({
        answers: [
          { stableKey: "q1", value: 4 },
          { stableKey: "Q_FTE_CONTRACT", value: "8" },
        ],
      }) as never,
      aliasParams("demo"),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "INVALID_TYPE" });
    expect(txMock.assessmentSubmission.create).not.toHaveBeenCalled();
  });

  it("phase-aware CEO submission rejects a non-phase FTE instead of selecting a fallback", async () => {
    mockSuFullInvitation(true);
    const res = await POST(
      jsonReq({
        answers: [
          { stableKey: "q1", value: 4 },
          { stableKey: "Q_FTE_CONTRACT", value: 0 },
        ],
      }) as never,
      aliasParams("demo"),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: "OUT_OF_RANGE",
      details: { stableKey: "Q_FTE_CONTRACT" },
    });
    expect(txMock.assessmentSubmission.create).not.toHaveBeenCalled();
  });

  it("does not freeze guessed phase feedback when the locked CEO authorization is revoked", async () => {
    mockSuFullInvitation(true);
    txMock.assessmentCampaignParticipant.findUnique.mockResolvedValue({ isCEO: false });

    const res = await POST(
      jsonReq({
        answers: [
          { stableKey: "q1", value: 4 },
          { stableKey: "Q_FTE_CONTRACT", value: 8 },
        ],
      }) as never,
      aliasParams("demo"),
    );

    expect(res.status).toBe(200);
    const frozen = txMock.assessmentSubmission.create.mock.calls[0][0].data.result;
    expect(frozen.recommendationPhase).toBeUndefined();
    expect(frozen.perQuestion[0].recommendation).toBeUndefined();
    expect(
      txMock.assessmentCampaignParticipant.findUnique.mock.invocationCallOrder[0],
    ).toBeLessThan(
      txMock.assessmentSubmission.create.mock.invocationCallOrder[0],
    );
  });

  it("renders only the snapshot-selected style lock-free and shares its frozen result with persistence and email", async () => {
    mockSuFullInvitation(true, { sendResultsToRespondent: true });
    const reportEmail = jest.requireMock(
      "@/lib/assessments/report-email",
    ) as {
      buildRespondentReportFromSubmission: jest.Mock;
      buildReportEmailHtml: jest.Mock;
    };
    const actualReportEmail = jest.requireActual(
      "@/lib/assessments/report-email",
    ) as {
      buildRespondentReportFromSubmission: (input: unknown) => unknown;
      buildReportEmailHtml: (input: unknown) => unknown;
    };
    const resultsEmail = jest.requireMock(
      "@/lib/assessments/results-email",
    ) as { buildResultsEmailHtml: jest.Mock };
    const actualResultsEmail = jest.requireActual(
      "@/lib/assessments/results-email",
    ) as { buildResultsEmailHtml: (input: unknown) => unknown };
    const renderTransactionStates: boolean[] = [];
    reportEmail.buildRespondentReportFromSubmission.mockImplementation(
      (input: unknown) => {
        renderTransactionStates.push(transactionActive);
        return actualReportEmail.buildRespondentReportFromSubmission(input);
      },
    );
    reportEmail.buildReportEmailHtml.mockImplementation((input: unknown) => {
      renderTransactionStates.push(transactionActive);
      return actualReportEmail.buildReportEmailHtml(input);
    });
    resultsEmail.buildResultsEmailHtml.mockImplementation((input: unknown) => {
      renderTransactionStates.push(transactionActive);
      return actualResultsEmail.buildResultsEmailHtml(input);
    });

    const res = await POST(
      jsonReq({
        answers: [
          { stableKey: "q1", value: 4 },
          { stableKey: "Q_FTE_CONTRACT", value: 8 },
        ],
      }) as never,
      aliasParams("demo"),
    );

    expect(res.status).toBe(200);
    expect(renderTransactionStates).toEqual([false, false, false]);
    expect(reportEmail.buildRespondentReportFromSubmission).toHaveBeenCalledTimes(1);
    expect(txMock.assessmentInvitation.findUnique).toHaveBeenCalledTimes(2);
    expect(
      txMock.assessmentInvitation.findUnique.mock.invocationCallOrder[0],
    ).toBeLessThan(
      reportEmail.buildRespondentReportFromSubmission.mock.invocationCallOrder[0],
    );
    expect(
      reportEmail.buildRespondentReportFromSubmission.mock.invocationCallOrder[0],
    ).toBeLessThan(
      txMock.assessmentInvitation.findUnique.mock.invocationCallOrder[1],
    );
    const renderInput = reportEmail.buildRespondentReportFromSubmission.mock.calls[0][0];
    const persistedResult = txMock.assessmentSubmission.create.mock.calls[0][0].data.result;
    expect(renderInput.reportStyle).toBe("MODERN_DASHBOARD");
    expect(renderInput.result).toBe(persistedResult);
    expect(renderInput.result).toMatchObject({
      recommendationPhase: 1,
      perQuestion: [{
        stableKey: "q1",
        recommendation: SU_FULL_PHASE_FEEDBACK[1].Q01[0].text,
      }],
    });
    const respondentRows = txMock.assessmentEmailOutbox.create.mock.calls.filter(
      (call: Array<{ data: { recipientRole: string } }>) =>
        call[0].data.recipientRole === "RESPONDENT",
    );
    expect(respondentRows).toHaveLength(1);
  });

  it("rejects a pinned-version change between the snapshot and final lock", async () => {
    const snapshot = mockSuFullInvitation(true, {
      sendResultsToRespondent: true,
    });
    const repinned = {
      ...snapshot,
      campaign: {
        ...snapshot.campaign,
        version: { ...snapshot.campaign.version, id: "v2" },
      },
    };
    txMock.assessmentInvitation.findUnique
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce(repinned);

    const res = await POST(
      jsonReq({
        answers: [
          { stableKey: "q1", value: 4 },
          { stableKey: "Q_FTE_CONTRACT", value: 8 },
        ],
      }) as never,
      aliasParams("demo"),
    );

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      error: "Submission state changed. Please submit again.",
    });
    expect(txMock.assessmentSubmission.create).not.toHaveBeenCalled();
    expect(txMock.assessmentEmailOutbox.create).not.toHaveBeenCalled();
  });

  it("rejects a CEO designation change between the snapshot and final lock", async () => {
    mockSuFullInvitation(true, { sendResultsToRespondent: true });
    txMock.assessmentCampaignParticipant.findUnique
      .mockResolvedValueOnce({ isCEO: true })
      .mockResolvedValueOnce({ isCEO: false });

    const res = await POST(
      jsonReq({
        answers: [
          { stableKey: "q1", value: 4 },
          { stableKey: "Q_FTE_CONTRACT", value: 8 },
        ],
      }) as never,
      aliasParams("demo"),
    );

    expect(res.status).toBe(503);
    expect(txMock.assessmentSubmission.create).not.toHaveBeenCalled();
    expect(txMock.assessmentEmailOutbox.create).not.toHaveBeenCalled();
  });

  it("degrades a lock-free phase-aware report throw without failing submission", async () => {
    mockSuFullInvitation(true, { sendResultsToRespondent: true });
    const reportEmail = jest.requireMock(
      "@/lib/assessments/report-email",
    ) as { buildRespondentReportFromSubmission: jest.Mock };
    const renderTransactionStates: boolean[] = [];
    reportEmail.buildRespondentReportFromSubmission.mockImplementationOnce(() => {
      renderTransactionStates.push(transactionActive);
      throw new Error("phase-aware report failed");
    });

    const res = await POST(
      jsonReq({
        answers: [
          { stableKey: "q1", value: 4 },
          { stableKey: "Q_FTE_CONTRACT", value: 8 },
        ],
      }) as never,
      aliasParams("demo"),
    );

    expect(res.status).toBe(200);
    expect(renderTransactionStates).toEqual([false]);
    expect(txMock.assessmentSubmission.create).toHaveBeenCalledTimes(1);
    const frozen = txMock.assessmentSubmission.create.mock.calls[0][0].data.result;
    expect(frozen.recommendationPhase).toBe(1);
    const respondentRows = txMock.assessmentEmailOutbox.create.mock.calls.filter(
      (call: Array<{ data: { recipientRole: string } }>) =>
        call[0].data.recipientRole === "RESPONDENT",
    );
    expect(respondentRows).toHaveLength(0);
  });

  it.each(
    ([
      [8, 1],
      [9, 2],
      [26, 3],
      [51, 4],
      [151, 5],
    ] as const).flatMap(([fte, phase]) =>
      ([4, 5, 6, 7, 8, 9, 10] as const).map((score) => [fte, phase, score] as const),
    ),
  )("freezes pinned catalogue feedback for CEO FTE %i (P%i) at score %i", async (fte, phase, score) => {
    mockSuFullInvitation(true);

    const res = await POST(
      jsonReq({
        answers: [
          { stableKey: "q1", value: score },
          { stableKey: "Q_FTE_CONTRACT", value: fte },
        ],
      }) as never,
      aliasParams("demo"),
    );

    expect(res.status).toBe(200);
    const frozen = txMock.assessmentSubmission.create.mock.calls[0][0].data.result;
    const expected = SU_FULL_PHASE_FEEDBACK[phase].Q01.find(
      (band) => score >= band.minScore && score <= band.maxScore,
    )?.text;
    expect(expected).toEqual(expect.any(String));
    expect(frozen.recommendationPhase).toBe(phase);
    expect(frozen.perQuestion[0].recommendation).toBe(expected);
    expect(frozen.perQuestion[0].recommendation).not.toBe("legacy fallback");
  });
});
