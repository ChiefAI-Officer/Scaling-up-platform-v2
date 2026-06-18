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

// R3-M3: the route now does a Phase-1 read (full include) on the top-level `db`
// client BEFORE opening the tx (rendering runs lock-free), then a Phase-2
// re-read on the tx client UNDER the FOR UPDATE lock. Both findUnique mocks are
// driven by mockHappyInvitation so the two phases agree.
//
// The `db` mock is built INSIDE the jest.mock factory (so it is self-contained
// at hoist time) and the handles are surfaced through `dbMock` for assertions.
// `var` hoists so the factory's assignment is visible to the rest of the file.
// eslint-disable-next-line no-var
var dbMock: {
  $transaction: jest.Mock;
  assessmentInvitation: { findUnique: jest.Mock };
  auditLog: { create: jest.Mock };
};

jest.mock("@/lib/db", () => {
  dbMock = {
    $transaction: jest.fn((fn: (tx: typeof txMock) => unknown) => fn(txMock)),
    assessmentInvitation: { findUnique: jest.fn() },
    auditLog: { create: jest.fn().mockResolvedValue(undefined) },
  };
  return { db: dbMock };
});

// Wave D feature flags — default ON in tests; individual tests flip them off.
// eslint-disable-next-line no-var
var flagState = {
  results: true,
  coach: true,
  paused: false,
};
jest.mock("@/lib/assessments/wave-d-feature-flags", () => ({
  waveDResultsEmailEnabled: jest.fn(() => flagState.results),
  waveDCoachNotifyEnabled: jest.fn(() => flagState.coach),
  assessmentSendsPaused: jest.fn(() => flagState.paused),
}));

// Approval gate — default approved; individual tests flip it.
// eslint-disable-next-line no-var
var approvedState = { approved: true };
jest.mock("@/lib/assessments/results-email-approval", () => ({
  isResultsEmailApproved: jest.fn(() => approvedState.approved),
}));

// Report-email + results-email builders — deterministic strings.
jest.mock("@/lib/assessments/report-email", () => ({
  buildRespondentReportFromSubmission: jest.fn(() => ({ result: {} })),
  buildReportEmailHtml: jest.fn(() => ({
    subject: "report-subject",
    bodyHtml: "<table>REPORT</table>",
  })),
}));
jest.mock("@/lib/assessments/results-email", () => ({
  buildResultsEmailHtml: jest.fn(
    () => "<p>BODY</p><table>REPORT</table>",
  ),
  buildCoachNotifyEmail: jest.fn(() => ({
    subject: "coach-notify-subject",
    bodyHtml: "<a>report link</a>",
  })),
}));

import { POST } from "@/app/(public)/org-survey/[campaignAlias]/submit/route";

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
      alias: "demo",
      deletedAt: null,
      status: "ACTIVE",
      accessMode: overrides?.accessMode ?? "INVITED",
      openAt: new Date(Date.now() - 1000),
      closeAt: null,
      sendResultsToRespondent: overrides?.sendResultsToRespondent ?? true,
      notifyCoachOnCompletion: overrides?.notifyCoachOnCompletion ?? true,
      createdByCoachId:
        overrides?.createdByCoachId === undefined
          ? "coach-1"
          : overrides.createdByCoachId,
      creatorCoach:
        overrides?.creatorCoachEmail === null
          ? null
          : { email: overrides?.creatorCoachEmail ?? "coach@example.com" },
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
  // Phase 1 (lock-free read, full include) + Phase 2 (locked re-read) agree.
  dbMock.assessmentInvitation.findUnique.mockResolvedValue(invitation);
  txMock.assessmentInvitation.findUnique.mockResolvedValue(invitation);
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

beforeEach(() => {
  jest.clearAllMocks();
  sessionState.invitationId = "inv-1";
  sessionState.campaignAlias = "demo";
  flagState.results = true;
  flagState.coach = true;
  flagState.paused = false;
  approvedState.approved = true;
  process.env.APP_URL = "https://app.example.com";
  txMock.assessmentSubmission.create.mockResolvedValue({ id: "sub-1" });
  txMock.assessmentEmailOutbox.create.mockResolvedValue({});
});

describe("POST submit — strict v6.6 validation", () => {
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
          resultsEmailContentApprovedHash: "hash",
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

  it("enqueues exactly ONE RESPONDENT row (#15) + ONE OWNING_COACH row (#16) on the happy path", async () => {
    mockHappyInvitation();
    const res = await submit();
    expect(res.status).toBe(200);
    const roles = enqueuedRoles();
    expect(roles).toContain("RESPONDENT");
    expect(roles).toContain("OWNING_COACH");
    expect(roles).toHaveLength(2);
  });

  it("#15 RESPONDENT row carries the respondent email + ASSESSMENT_RESULTS type + submission id", async () => {
    mockHappyInvitation();
    await submit();
    const row = txMock.assessmentEmailOutbox.create.mock.calls
      .map((c: Array<{ data: Record<string, unknown> }>) => c[0].data)
      .find((d: { recipientRole: string }) => d.recipientRole === "RESPONDENT");
    expect(row).toBeDefined();
    expect(row!.recipientEmail).toBe("respondent@example.com");
    expect(row!.emailType).toBe("ASSESSMENT_RESULTS");
    expect(row!.submissionId).toBe("sub-1");
    expect(row!.subject).toBe("Your results");
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
    (buildResultsEmailHtml as jest.Mock).mockImplementationOnce(() => {
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
          resultsEmailContentApprovedHash: "hash",
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
          resultsEmailContentApprovedHash: "hash",
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
          resultsEmailContentApprovedHash: "hash",
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
