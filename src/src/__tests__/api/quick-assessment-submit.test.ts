/**
 * Task 6 — POST /api/quiz/[campaignAlias]/submit (Quick Assessment public quiz)
 *
 * Tests:
 *  - Response includes data.scoreResult + Cache-Control: no-store (new submit)
 *  - Duplicate idempotencyKey (P2002) → returns existing submission, no second
 *    create, inngest.send NOT called, no new audit row
 *  - New submission → auditLog.create called with entityType="AssessmentSubmission",
 *    action="CREATE", performedBy=taker email
 *  - Outbox rows: blank SU addr + no coach → 0 rows; SU addr + no coach → 1 SU_TEAM
 *    row; SU addr + active coach → 2 rows (SU_TEAM + REFERRING_COACH)
 *  - inngest.send called once with correct event on new submission
 *  - Preserved: 403 NOT_PUBLIC; 410 NOT_OPEN; 400 bad body; 429 rate-limited
 */

/* -------------------------------------------------------------------------- */
/*  Mocks — declared before imports (Jest hoisting)                           */
/* -------------------------------------------------------------------------- */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: init?.headers,
      }),
  },
}));

// Transaction mock: tx callback gets txMock; resolve with callback's return value.
const txMock = {
  coach: {
    findFirst: jest.fn(),
  },
  assessmentSubmission: {
    create: jest.fn(),
  },
  assessmentEmailOutbox: {
    create: jest.fn(),
  },
};

// The primitive's SQL is covered separately. This controllable seam proves the
// route awaits the freeze before any later transaction work and couples it to
// the transaction commit/rollback outcome.
// eslint-disable-next-line no-var
var reportStyleLockMock: jest.Mock;
jest.mock("@/lib/assessments/report-style-lock", () => {
  reportStyleLockMock = jest.fn().mockResolvedValue(undefined);
  return { lockReportStyleForFirstCompletion: reportStyleLockMock };
});

jest.mock("@/lib/db", () => ({
  db: {
    $transaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) => cb(txMock)),
    assessmentCampaign: {
      findUnique: jest.fn(),
    },
    assessmentTemplateVersion: {
      findUnique: jest.fn(),
    },
    assessmentSubmission: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    coach: {
      findUnique: jest.fn(),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  },
}));

jest.mock("@/lib/rate-limit", () => ({
  RateLimits: { standard: {} },
  withRateLimit: jest.fn().mockResolvedValue({ allowed: true, headers: {} }),
}));

jest.mock("@/inngest/client", () => ({
  inngest: {
    send: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock scoring to return a deterministic ScoreResult with perDomain.
jest.mock("@/lib/assessments/scoring", () => {
  class MockScoringValidationError extends Error {
    public readonly code: string;
    public readonly details: unknown;
    constructor(code: string, details: unknown) {
      super(code);
      this.code = code;
      this.details = details;
    }
  }

  return {
    scoreSubmission: jest.fn().mockReturnValue({
      tier: { label: "Needs Improvement", minMetric: 0, maxMetric: 5, message: "Keep trying", action: null },
      overallScore: 4,
      perDomain: [
        { key: "people", label: "People", averagePoints: 6.5, tier: null, perQuestion: [] },
        { key: "strategy", label: "Strategy", averagePoints: 3.2, tier: null, perQuestion: [] },
        { key: "execution", label: "Execution", averagePoints: 5.1, tier: null, perQuestion: [] },
        { key: "cash", label: "Cash", averagePoints: 7.0, tier: null, perQuestion: [] },
      ],
    }),
    ScoringValidationError: MockScoringValidationError,
    TemplateVersionForScoringSchema: {
      safeParse: jest.fn().mockReturnValue({
        success: true,
        data: {
          questions: [],
          sections: [],
          scoringConfig: { tiers: [], domains: [] },
        },
      }),
    },
  };
});

/* -------------------------------------------------------------------------- */
/*  Imports (after mocks)                                                     */
/* -------------------------------------------------------------------------- */
import { POST } from "@/app/api/quiz/[campaignAlias]/submit/route";
import { db } from "@/lib/db";
import { inngest } from "@/inngest/client";
import { withRateLimit } from "@/lib/rate-limit";
import { Prisma } from "@prisma/client";
import { lockReportStyleForFirstCompletion } from "@/lib/assessments/report-style-lock";

reportStyleLockMock = lockReportStyleForFirstCompletion as jest.Mock;

/* -------------------------------------------------------------------------- */
/*  Fixtures                                                                  */
/* -------------------------------------------------------------------------- */
const CAMPAIGN = {
  id: "camp-1",
  status: "ACTIVE",
  accessMode: "PUBLIC",
  openAt: new Date("2026-01-01T00:00:00Z"),
  closeAt: null as Date | null,
  deletedAt: null as Date | null,
  templateId: "tmpl-1",
  versionId: "ver-1",
  reportStyle: "MODERN_DASHBOARD",
  template: { name: "Scaling Up Quick Assessment" },
};

const VERSION = {
  id: "ver-1",
  questions: [],
  sections: [],
  scoringConfig: {},
  publishedAt: new Date("2026-01-01T00:00:00Z"),
};

const VALID_BODY = {
  publicTaker: {
    firstName: "Jane",
    lastName: "Doe",
    email: "jane@example.com",
  },
  answers: [{ stableKey: "q1", value: 5 }],
  referringCoachEmail: null,
};

function makeRequest(body: unknown, alias = "quick-assessment"): Request {
  return new Request(
    `http://localhost/api/quiz/${alias}/submit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function makeParams(alias = "quick-assessment") {
  return { params: Promise.resolve({ campaignAlias: alias }) };
}

type CreatedOutboxRow = {
  recipientRole: string;
  bodyHtml: string;
};

function createdRows(): CreatedOutboxRow[] {
  return txMock.assessmentEmailOutbox.create.mock.calls.map(
    (call: Array<{ data: CreatedOutboxRow }>) => call[0].data,
  );
}

function rowFor(role: string): CreatedOutboxRow {
  const row = createdRows().find(
    (candidate) => candidate.recipientRole === role,
  );
  if (!row) throw new Error(`${role} row was not enqueued`);
  return row;
}

function mockActiveCoach(
  overrides: Partial<{
    profileImage: string | null;
    firstName: string;
    lastName: string;
  }> = {},
) {
  (db.coach.findUnique as jest.Mock).mockResolvedValue({
    id: "coach-1",
    email: "coach@example.com",
    firstName: overrides.firstName ?? "Bob",
    lastName: overrides.lastName ?? "Coach",
    profileImage:
      overrides.profileImage === undefined
        ? "https://images.example/bob.png"
        : overrides.profileImage,
    certificationStatus: "ACTIVE",
    certificationExpiry: null,
  });
}

async function submitWithCoach() {
  return POST(
    makeRequest({
      ...VALID_BODY,
      referringCoachEmail: "coach@example.com",
    }) as never,
    makeParams() as never,
  );
}

const transactionCommitMarker = jest.fn();
const transactionRollbackMarker = jest.fn();
let transactionActive = false;

beforeEach(() => {
  jest.clearAllMocks();
  reportStyleLockMock.mockReset().mockResolvedValue(undefined);
  transactionActive = false;
  // Model Prisma's all-or-nothing transaction contract so each test can prove
  // whether a held/failed lock was committed or rolled back.
  (db.$transaction as jest.Mock).mockImplementation(
    async (cb: (tx: unknown) => Promise<unknown>) => {
      transactionActive = true;
      try {
        const value = await cb(txMock);
        transactionCommitMarker();
        return value;
      } catch (error) {
        transactionRollbackMarker();
        throw error;
      } finally {
        transactionActive = false;
      }
    },
  );
  // Default: rate limit allowed
  (withRateLimit as jest.Mock).mockResolvedValue({ allowed: true, headers: {} });
  // Default: campaign + version found
  (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue(CAMPAIGN);
  (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue(VERSION);
  // Default tx: submission create returns id
  txMock.coach.findFirst.mockResolvedValue({
    id: "coach-1",
    email: "coach@example.com",
  });
  txMock.assessmentSubmission.create.mockResolvedValue({ id: "sub-1" });
  txMock.assessmentEmailOutbox.create.mockResolvedValue({});
  // Default: no existing submission (idempotency)
  (db.assessmentSubmission.findFirst as jest.Mock).mockResolvedValue(null);
  // Default: audit log succeeds
  (db.auditLog.create as jest.Mock).mockResolvedValue({});
  // Default: inngest.send succeeds
  (inngest.send as jest.Mock).mockResolvedValue(undefined);
  // Default: coach not found (no active coach)
  (db.coach.findUnique as jest.Mock).mockResolvedValue(null);
  // Clear QUICK_ASSESSMENT_TEAM_EMAIL env
  delete process.env.QUICK_ASSESSMENT_TEAM_EMAIL;
  delete process.env.ESCALATION_EMAIL;
  delete process.env.ADMIN_EMAIL;
  delete process.env.WAVE_228_REPORT_EMAIL_CHROME_ENABLED;
  delete process.env.WAVE_228_REPORT_EMAIL_CHROME_CANARY;
  delete process.env.WAVE_228_REPORT_EMAIL_CHROME_KILL;
});

/* -------------------------------------------------------------------------- */
/*  Preserved behavior: 429 / 403 / 410 / 400                                */
/* -------------------------------------------------------------------------- */
describe("preserved behavior", () => {
  it("429 when rate-limited", async () => {
    (withRateLimit as jest.Mock).mockResolvedValue({
      allowed: false,
      headers: { "Retry-After": "60" },
    });
    const res = await POST(makeRequest(VALID_BODY) as never, makeParams() as never);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/too many/i);
  });

  it("400 on missing publicTaker fields", async () => {
    const res = await POST(
      makeRequest({ publicTaker: { firstName: "Jane" }, answers: [] }) as never,
      makeParams() as never,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid body/i);
  });

  it("400 on empty answers array", async () => {
    const res = await POST(
      makeRequest({ ...VALID_BODY, answers: [] }) as never,
      makeParams() as never,
    );
    expect(res.status).toBe(400);
  });

  it("404 when campaign not found", async () => {
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await POST(makeRequest(VALID_BODY) as never, makeParams() as never);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("CAMPAIGN_NOT_FOUND");
  });

  it("403 NOT_PUBLIC when campaign accessMode is INVITED", async () => {
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      ...CAMPAIGN,
      accessMode: "INVITED",
    });
    const res = await POST(makeRequest(VALID_BODY) as never, makeParams() as never);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("NOT_PUBLIC");
  });

  it("410 NOT_OPEN when campaign status is DRAFT", async () => {
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      ...CAMPAIGN,
      status: "DRAFT",
    });
    const res = await POST(makeRequest(VALID_BODY) as never, makeParams() as never);
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toBe("NOT_OPEN");
  });

  it("410 NOT_OPEN when campaign is before openAt window", async () => {
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      ...CAMPAIGN,
      openAt: new Date("2099-01-01T00:00:00Z"),
    });
    const res = await POST(makeRequest(VALID_BODY) as never, makeParams() as never);
    expect(res.status).toBe(410);
  });

  it("410 NOT_OPEN when campaign is past closeAt window", async () => {
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      ...CAMPAIGN,
      closeAt: new Date("2020-01-01T00:00:00Z"),
    });
    const res = await POST(makeRequest(VALID_BODY) as never, makeParams() as never);
    expect(res.status).toBe(410);
  });

  it("404 when version has no publishedAt", async () => {
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue({
      ...VERSION,
      publishedAt: null,
    });
    const res = await POST(makeRequest(VALID_BODY) as never, makeParams() as never);
    expect(res.status).toBe(404);
  });
});

/* -------------------------------------------------------------------------- */
/*  Task 6 new behavior: response shape + Cache-Control                       */
/* -------------------------------------------------------------------------- */
describe("new submission — scoreResult + Cache-Control: no-store", () => {
  it("returns scoreResult in data and Cache-Control: no-store header", async () => {
    const res = await POST(makeRequest(VALID_BODY) as never, makeParams() as never);
    expect(res.status).toBe(200);

    // Cache-Control header
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.submissionId).toBe("sub-1");
    expect(body.data.redirectUrl).toBe("/quiz/quick-assessment/thank-you");
    // scoreResult should have perDomain
    expect(body.data.scoreResult).toBeDefined();
    expect(Array.isArray(body.data.scoreResult.perDomain)).toBe(true);
    expect(body.data.scoreResult.perDomain).toHaveLength(4);
    expect(body.data.reportStyle).toBe("MODERN_DASHBOARD");
  });

  it("passes idempotencyKey to the submission create inside the transaction", async () => {
    const bodyWithKey = { ...VALID_BODY, idempotencyKey: "client-key-abc" };
    await POST(makeRequest(bodyWithKey) as never, makeParams() as never);

    expect(txMock.assessmentSubmission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ idempotencyKey: "client-key-abc" }),
      }),
    );
  });
});

/* -------------------------------------------------------------------------- */
/*  Report style first-completion freeze                                       */
/* -------------------------------------------------------------------------- */
describe("report style first-completion freeze", () => {
  it("awaits the campaign freeze before creating the submission and commits the same completion instant", async () => {
    let releaseLock: (() => void) | undefined;
    const lockStarted = new Promise<void>((resolve) => {
      reportStyleLockMock.mockImplementationOnce(() => {
        resolve();
        return new Promise<void>((release) => {
          releaseLock = release;
        });
      });
    });

    const responsePromise = POST(
      makeRequest(VALID_BODY) as never,
      makeParams() as never,
    );
    const firstEvent = await Promise.race([
      lockStarted.then(() => "lock-started"),
      responsePromise.then(() => "response-completed"),
    ]);

    expect(firstEvent).toBe("lock-started");
    expect(txMock.coach.findFirst).not.toHaveBeenCalled();
    expect(txMock.assessmentSubmission.create).not.toHaveBeenCalled();
    expect(txMock.assessmentEmailOutbox.create).not.toHaveBeenCalled();
    expect(transactionCommitMarker).not.toHaveBeenCalled();

    releaseLock?.();
    const response = await responsePromise;

    expect(response.status).toBe(200);
    const [lockedTx, lockedCampaignId, lockedSubmittedAt] =
      reportStyleLockMock.mock.calls[0];
    const submissionData =
      txMock.assessmentSubmission.create.mock.calls[0][0].data;
    expect(lockedTx).toBe(txMock);
    expect(lockedCampaignId).toBe("camp-1");
    expect(submissionData.submittedAt).toBe(lockedSubmittedAt);
    expect(transactionCommitMarker).toHaveBeenCalledTimes(1);
    expect(transactionRollbackMarker).not.toHaveBeenCalled();
  });

  it("rolls back the freeze when referral validation fails inside the transaction", async () => {
    mockActiveCoach();
    const lockTransactionStates: boolean[] = [];
    reportStyleLockMock.mockImplementation(() => {
      lockTransactionStates.push(transactionActive);
      return Promise.resolve();
    });
    txMock.coach.findFirst.mockRejectedValueOnce(
      new Error("referral validation failed"),
    );

    const response = await submitWithCoach();

    expect(response.status).toBe(500);
    expect(lockTransactionStates).toEqual([true]);
    expect(txMock.assessmentSubmission.create).not.toHaveBeenCalled();
    expect(transactionCommitMarker).not.toHaveBeenCalled();
    expect(transactionRollbackMarker).toHaveBeenCalledTimes(1);
  });

  it("does not freeze or open a transaction for a pure idempotent replay", async () => {
    (db.assessmentSubmission.findFirst as jest.Mock).mockResolvedValue({
      id: "sub-existing",
      campaignId: "camp-1",
      publicTaker: VALID_BODY.publicTaker,
      answers: VALID_BODY.answers,
      referringCoach: null,
      result: { overallScore: 7, perDomain: [] },
    });

    const response = await POST(
      makeRequest({ ...VALID_BODY, idempotencyKey: "existing-key" }) as never,
      makeParams() as never,
    );

    expect(response.status).toBe(200);
    expect(reportStyleLockMock).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(txMock.assessmentSubmission.create).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/*  Task 6 new behavior: audit log                                            */
/* -------------------------------------------------------------------------- */
describe("new submission — audit log", () => {
  it("calls auditLog.create with correct entityType, action, performedBy", async () => {
    await POST(makeRequest(VALID_BODY) as never, makeParams() as never);

    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
    const call = (db.auditLog.create as jest.Mock).mock.calls[0][0];
    expect(call.data.entityType).toBe("AssessmentSubmission");
    expect(call.data.entityId).toBe("sub-1");
    expect(call.data.action).toBe("CREATE");
    expect(call.data.performedBy).toBe("jane@example.com");
  });
});

/* -------------------------------------------------------------------------- */
/*  Task 6 new behavior: inngest.send                                         */
/* -------------------------------------------------------------------------- */
describe("new submission — inngest.send", () => {
  it("calls inngest.send once with assessment/quick-lead.enqueued event", async () => {
    await POST(makeRequest(VALID_BODY) as never, makeParams() as never);

    expect(inngest.send).toHaveBeenCalledTimes(1);
    expect(inngest.send).toHaveBeenCalledWith({
      name: "assessment/quick-lead.enqueued",
      data: { submissionId: "sub-1" },
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  Task 6 new behavior: outbox rows                                          */
/* -------------------------------------------------------------------------- */
describe("outbox enqueue", () => {
  /** Helper: pull recipientRole values from the txMock create calls. */
  function enqueuedRoles(): string[] {
    return txMock.assessmentEmailOutbox.create.mock.calls.map(
      (c: Array<{ data: { recipientRole: string } }>) => c[0].data.recipientRole,
    );
  }

  it("brands taker and referring-coach reports with the verified Referring coach", async () => {
    process.env.WAVE_228_REPORT_EMAIL_CHROME_ENABLED = "1";
    mockActiveCoach();

    await submitWithCoach();

    const reports = createdRows().filter((row) =>
      ["TAKER_COPY", "REFERRING_COACH"].includes(row.recipientRole),
    );
    expect(reports).toHaveLength(2);
    for (const row of reports) {
      expect(row.bodyHtml).toContain("cid:su-report-logo-v1");
      expect(row.bodyHtml).toContain("Coached by Bob Coach");
      expect(row.bodyHtml).toContain("https://images.example/bob.png");
    }
  });

  it("uses name-only when the verified public coach image is invalid", async () => {
    process.env.WAVE_228_REPORT_EMAIL_CHROME_ENABLED = "1";
    mockActiveCoach({ profileImage: "http://images.example/bob.png" });

    await submitWithCoach();

    const taker = rowFor("TAKER_COPY");
    expect(taker.bodyHtml).toContain("Coached by Bob Coach");
    expect(taker.bodyHtml).not.toContain("http://images.example");
  });

  it("renders Scaling Up only when no verified coach exists", async () => {
    process.env.WAVE_228_REPORT_EMAIL_CHROME_ENABLED = "1";

    await POST(makeRequest(VALID_BODY) as never, makeParams() as never);

    const taker = rowFor("TAKER_COPY");
    expect(taker.bodyHtml).toContain("cid:su-report-logo-v1");
    expect(taker.bodyHtml).not.toContain("Coached by");
  });

  it("keeps short SU_TEAM lead HTML unchanged", async () => {
    process.env.WAVE_228_REPORT_EMAIL_CHROME_ENABLED = "1";
    process.env.QUICK_ASSESSMENT_TEAM_EMAIL = "team@scalingup.com";

    await POST(makeRequest(VALID_BODY) as never, makeParams() as never);

    expect(rowFor("SU_TEAM").bodyHtml).not.toContain(
      "cid:su-report-logo-v1",
    );
  });

  it("keeps public report chrome legacy while the gate is default-off", async () => {
    mockActiveCoach();

    await submitWithCoach();

    expect(rowFor("TAKER_COPY").bodyHtml).not.toContain(
      "cid:su-report-logo-v1",
    );
    expect(rowFor("TAKER_COPY").bodyHtml).not.toContain("Coached by");
  });

  it("lets the kill switch override the public report chrome global gate", async () => {
    process.env.WAVE_228_REPORT_EMAIL_CHROME_ENABLED = "1";
    process.env.WAVE_228_REPORT_EMAIL_CHROME_KILL = "1";
    mockActiveCoach();

    await submitWithCoach();

    expect(rowFor("TAKER_COPY").bodyHtml).not.toContain(
      "cid:su-report-logo-v1",
    );
    expect(rowFor("TAKER_COPY").bodyHtml).not.toContain("Coached by");
  });

  it("freezes verified coach presentation in outbox HTML before later coach changes", async () => {
    process.env.WAVE_228_REPORT_EMAIL_CHROME_ENABLED = "1";
    const verifiedCoach = {
      id: "coach-1",
      email: "coach@example.com",
      firstName: "Bob",
      lastName: "Coach",
      profileImage: "https://images.example/bob.png",
      certificationStatus: "ACTIVE",
      certificationExpiry: null,
    };
    (db.coach.findUnique as jest.Mock).mockResolvedValue(verifiedCoach);

    await submitWithCoach();
    const frozenHtml = rowFor("TAKER_COPY").bodyHtml;
    verifiedCoach.firstName = "Deleted";
    verifiedCoach.lastName = "Recovered";
    verifiedCoach.profileImage = "https://images.example/recovered.png";

    expect(rowFor("TAKER_COPY").bodyHtml).toBe(frozenHtml);
    expect(frozenHtml).toContain("Coached by Bob Coach");
    expect(frozenHtml).toContain("https://images.example/bob.png");
    expect(frozenHtml).not.toContain("Deleted Recovered");
    expect(frozenHtml).not.toContain("recovered.png");
  });

  it("ALWAYS enqueues a TAKER_COPY row even with blank SU address and no coach (Spec 16 §3)", async () => {
    // No env vars set → suTeamAddress = ""; no coach → only TAKER_COPY.
    await POST(makeRequest(VALID_BODY) as never, makeParams() as never);

    expect(txMock.assessmentEmailOutbox.create).toHaveBeenCalledTimes(1);
    const call = txMock.assessmentEmailOutbox.create.mock.calls[0][0];
    expect(call.data.recipientRole).toBe("TAKER_COPY");
    expect(call.data.recipientEmail).toBe("jane@example.com");
    expect(call.data.submissionId).toBe("sub-1");
    expect(call.data.bodyHtml).toContain("<table");
  });

  it("enqueues TAKER_COPY + SU_TEAM when SU address is set and no coach", async () => {
    process.env.QUICK_ASSESSMENT_TEAM_EMAIL = "team@scalingup.com";
    await POST(makeRequest(VALID_BODY) as never, makeParams() as never);

    expect(txMock.assessmentEmailOutbox.create).toHaveBeenCalledTimes(2);
    const roles = enqueuedRoles();
    expect(roles).toContain("TAKER_COPY");
    expect(roles).toContain("SU_TEAM");
    expect(roles).not.toContain("REFERRING_COACH");

    // SU_TEAM row carries the unchanged lead-alert email type + address.
    const su = txMock.assessmentEmailOutbox.create.mock.calls
      .map((c: Array<{ data: { recipientRole: string; recipientEmail: string; emailType: string } }>) => c[0].data)
      .find((d: { recipientRole: string }) => d.recipientRole === "SU_TEAM");
    expect(su).toBeDefined();
    expect(su!.recipientEmail).toBe("team@scalingup.com");
    expect(su!.emailType).toBe("QUICK_ASSESSMENT_LEAD");
  });

  it("enqueues 3 rows (TAKER_COPY + REFERRING_COACH + SU_TEAM) when SU address set and active coach found", async () => {
    process.env.QUICK_ASSESSMENT_TEAM_EMAIL = "team@scalingup.com";
    // Active coach returned by findUnique
    (db.coach.findUnique as jest.Mock).mockResolvedValue({
      id: "coach-1",
      email: "coach@example.com",
      firstName: "Bob",
      lastName: "Coach",
      profileImage: null,
      certificationStatus: "ACTIVE",
      certificationExpiry: null,
    });

    const bodyWithCoach = {
      ...VALID_BODY,
      referringCoachEmail: "coach@example.com",
    };
    await POST(makeRequest(bodyWithCoach) as never, makeParams() as never);

    expect(txMock.assessmentEmailOutbox.create).toHaveBeenCalledTimes(3);
    const roles = enqueuedRoles();
    expect(roles).toContain("TAKER_COPY");
    expect(roles).toContain("SU_TEAM");
    expect(roles).toContain("REFERRING_COACH");

    // The REFERRING_COACH row is the FULL report (not the lead alert).
    const coachRow = txMock.assessmentEmailOutbox.create.mock.calls
      .map((c: Array<{ data: { recipientRole: string; recipientEmail: string; bodyHtml: string } }>) => c[0].data)
      .find((d: { recipientRole: string }) => d.recipientRole === "REFERRING_COACH");
    expect(coachRow).toBeDefined();
    expect(coachRow!.recipientEmail).toBe("coach@example.com");
    expect(coachRow!.bodyHtml).toContain("<table");
  });

  it("REFERRING_COACH row is NOT enqueued when the coach is not active (guard returns null)", async () => {
    process.env.QUICK_ASSESSMENT_TEAM_EMAIL = "team@scalingup.com";
    // db.coach.findUnique default mock returns null → no active coach.
    const bodyWithCoach = {
      ...VALID_BODY,
      referringCoachEmail: "ghost@example.com",
    };
    await POST(makeRequest(bodyWithCoach) as never, makeParams() as never);

    const roles = enqueuedRoles();
    expect(roles).toContain("TAKER_COPY");
    expect(roles).toContain("SU_TEAM");
    expect(roles).not.toContain("REFERRING_COACH");
  });

  it("retains a cancelled coach row when taker and coach normalize to the same mailbox", async () => {
    process.env.WAVE_228_REPORT_EMAIL_CHROME_ENABLED = "1";
    process.env.QUICK_ASSESSMENT_TEAM_EMAIL = "team@scalingup.com";
    (db.coach.findUnique as jest.Mock).mockResolvedValue({
      id: "coach-1",
      email: " JANE@EXAMPLE.COM ",
      firstName: "Jane",
      lastName: "Coach",
      profileImage: "https://images.example/jane.png",
      certificationStatus: "ACTIVE",
      certificationExpiry: null,
    });
    const info = jest.spyOn(console, "info").mockImplementation(() => undefined);

    await POST(
      makeRequest({
        ...VALID_BODY,
        referringCoachEmail: "jane@example.com",
      }) as never,
      makeParams() as never,
    );

    expect(enqueuedRoles()).toEqual([
      "TAKER_COPY",
      "REFERRING_COACH",
      "SU_TEAM",
    ]);
    const coachRow = txMock.assessmentEmailOutbox.create.mock.calls
      .map(
        (call: Array<{ data: Record<string, unknown> }>) =>
          call[0].data,
      )
      .find((row) => row.recipientRole === "REFERRING_COACH");
    expect(coachRow).toEqual(
      expect.objectContaining({
        recipientEmail: "jane@example.com",
        recipientRole: "REFERRING_COACH",
        subject: "",
        bodyHtml: "",
        status: "CANCELLED",
        cancelReason: "SAME_MAILBOX_AS_TAKER",
        cancelledAt: expect.any(Date),
      }),
    );
    expect(rowFor("TAKER_COPY").bodyHtml).toContain("Coached by Jane Coach");
    expect(rowFor("TAKER_COPY").bodyHtml).toContain(
      "https://images.example/jane.png",
    );
    expect(coachRow?.bodyHtml).toBe("");
    expect(info).toHaveBeenCalledWith(
      "[assessment-email] coach self-notification suppressed",
      expect.objectContaining({
        submissionScope: "public-quiz",
        coachId: "coach-1",
      }),
    );
    info.mockRestore();
  });

  it("outbox rows are created inside the transaction (via txMock)", async () => {
    process.env.QUICK_ASSESSMENT_TEAM_EMAIL = "team@scalingup.com";
    // Verify it's txMock.assessmentEmailOutbox.create being called (not db.assessmentEmailOutbox)
    await POST(makeRequest(VALID_BODY) as never, makeParams() as never);
    // txMock.assessmentEmailOutbox.create was called → confirms it's inside $transaction
    expect(txMock.assessmentEmailOutbox.create).toHaveBeenCalled();
  });

  // Wave D regression: the PUBLIC quiz path must NOT read the INVITED-only
  // sendResultsToRespondent toggle, and must NOT enqueue the invited
  // RESPONDENT / OWNING_COACH rows. The public taker email is unchanged.
  it("Wave D regression: PUBLIC path never selects sendResultsToRespondent", async () => {
    await POST(makeRequest(VALID_BODY) as never, makeParams() as never);
    const select = (db.assessmentCampaign.findUnique as jest.Mock).mock
      .calls[0][0].select;
    expect(select).not.toHaveProperty("sendResultsToRespondent");
    expect(select).not.toHaveProperty("notifyCoachOnCompletion");
  });

  it("Wave D regression: PUBLIC path never enqueues RESPONDENT or OWNING_COACH rows", async () => {
    process.env.QUICK_ASSESSMENT_TEAM_EMAIL = "team@scalingup.com";
    await POST(makeRequest(VALID_BODY) as never, makeParams() as never);
    const roles = enqueuedRoles();
    expect(roles).not.toContain("RESPONDENT");
    expect(roles).not.toContain("OWNING_COACH");
  });
});

/* -------------------------------------------------------------------------- */
/*  Jeff #83: verified referring-coach ownership                              */
/* -------------------------------------------------------------------------- */
describe("verified referring-coach ownership", () => {
  it("persists the resolved Coach identity and canonical email", async () => {
    (db.coach.findUnique as jest.Mock).mockResolvedValue({
      id: "coach-1",
      email: " Coach@Example.COM ",
      firstName: "Bob",
      lastName: "Coach",
      profileImage: null,
      certificationStatus: "ACTIVE",
      certificationExpiry: null,
    });

    const response = await POST(
      makeRequest({
        ...VALID_BODY,
        referringCoachEmail: "  COACH@example.com  ",
      }) as never,
      makeParams() as never,
    );
    expect((await response.json()).data.referringCoachEmail).toBe(
      "coach@example.com",
    );

    expect(db.coach.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "coach@example.com" },
      }),
    );
    expect(txMock.assessmentSubmission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          referringCoachId: "coach-1",
          referringCoachEmail: "coach@example.com",
        }),
      }),
    );
    const coachOutboxRow = txMock.assessmentEmailOutbox.create.mock.calls
      .map((call: Array<{ data: { recipientRole: string; recipientEmail: string } }>) => call[0].data)
      .find((row: { recipientRole: string }) => row.recipientRole === "REFERRING_COACH");
    expect(coachOutboxRow?.recipientEmail).toBe("coach@example.com");
    expect(rowFor("TAKER_COPY").bodyHtml).toContain(
      "mailto:coach%40example.com",
    );
    expect(rowFor("TAKER_COPY").bodyHtml).not.toContain(
      "mailto:Coach%40Example.COM",
    );
  });

  it("persists no ownership and sends no coach email when verification fails", async () => {
    const response = await POST(
      makeRequest({
        ...VALID_BODY,
        referringCoachEmail: "unknown@example.com",
      }) as never,
      makeParams() as never,
    );
    expect((await response.json()).data.referringCoachEmail).toBeNull();

    expect(txMock.assessmentSubmission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          referringCoachId: null,
          referringCoachEmail: null,
        }),
      }),
    );
    const enqueuedRoles = txMock.assessmentEmailOutbox.create.mock.calls.map(
      (call: Array<{ data: { recipientRole: string } }>) => call[0].data.recipientRole,
    );
    expect(enqueuedRoles).not.toContain("REFERRING_COACH");
  });

  it("drops ownership, coach delivery, and response contact when eligibility changes before the write", async () => {
    (db.coach.findUnique as jest.Mock).mockResolvedValue({
      id: "coach-1",
      email: "coach@example.com",
      firstName: "Bob",
      lastName: "Coach",
      profileImage: null,
      certificationStatus: "ACTIVE",
      certificationExpiry: null,
    });
    txMock.coach.findFirst.mockResolvedValueOnce(null);

    const response = await POST(
      makeRequest({
        ...VALID_BODY,
        referringCoachEmail: "coach@example.com",
      }) as never,
      makeParams() as never,
    );
    const body = await response.json();

    expect(body.data.referringCoachEmail).toBeNull();
    expect(txMock.assessmentSubmission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          referringCoachId: null,
          referringCoachEmail: null,
        }),
      }),
    );
    expect(
      txMock.assessmentEmailOutbox.create.mock.calls
        .map((call) => call[0].data.recipientRole)
        .filter((role) => role === "REFERRING_COACH"),
    ).toHaveLength(0);
  });

  it.each([
    "not-an-email",
    "   ",
    "coach@example.com extra",
    42,
    [],
    { email: "coach@example.com" },
  ])(
    "degrades malformed referral %p to Scaling Up-only without blocking submission",
    async (referringCoachEmail) => {
      const res = await POST(
        makeRequest({
          ...VALID_BODY,
          referringCoachEmail,
        }) as never,
        makeParams() as never,
      );

      expect(res.status).toBe(200);
      expect(db.coach.findUnique).not.toHaveBeenCalled();
      expect(txMock.assessmentSubmission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            referringCoachId: null,
            referringCoachEmail: null,
          }),
        }),
      );
      const enqueuedRoles = txMock.assessmentEmailOutbox.create.mock.calls.map(
        (call: Array<{ data: { recipientRole: string } }>) => call[0].data.recipientRole,
      );
      expect(enqueuedRoles).not.toContain("REFERRING_COACH");
    },
  );

  it("retries as Scaling Up-only when the verified Coach is deleted before the write", async () => {
    process.env.WAVE_228_REPORT_EMAIL_CHROME_ENABLED = "1";
    (db.coach.findUnique as jest.Mock).mockResolvedValue({
      id: "coach-1",
      email: "coach@example.com",
      firstName: "Bob",
      lastName: "Coach",
      profileImage: "https://images.example/bob.png",
      certificationStatus: "ACTIVE",
      certificationExpiry: null,
    });
    txMock.assessmentSubmission.create
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError(
          "Foreign key constraint failed",
          {
            code: "P2003",
            clientVersion: "6.0",
            meta: {
              field_name:
                "assessment_submissions_referringCoachId_fkey (index)",
            },
          },
        ),
      )
      .mockResolvedValueOnce({ id: "sub-1" });

    const res = await POST(
      makeRequest({
        ...VALID_BODY,
        referringCoachEmail: "coach@example.com",
      }) as never,
      makeParams() as never,
    );

    expect(res.status).toBe(200);
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(reportStyleLockMock).toHaveBeenCalledTimes(2);
    expect(reportStyleLockMock.mock.calls).toEqual([
      [txMock, "camp-1", expect.any(Date)],
      [txMock, "camp-1", expect.any(Date)],
    ]);
    expect(reportStyleLockMock.mock.calls[1][2]).toBe(
      reportStyleLockMock.mock.calls[0][2],
    );
    expect(transactionRollbackMarker).toHaveBeenCalledTimes(1);
    expect(transactionCommitMarker).toHaveBeenCalledTimes(1);
    expect(txMock.assessmentSubmission.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          referringCoachId: null,
          referringCoachEmail: null,
        }),
      }),
    );
    const outboxRows = txMock.assessmentEmailOutbox.create.mock.calls.map(
      (call: Array<{
        data: {
          recipientRole: string;
          bodyHtml: string;
        };
      }>) => call[0].data,
    );
    expect(outboxRows.map((row) => row.recipientRole)).not.toContain(
      "REFERRING_COACH",
    );
    expect(
      outboxRows.find((row) => row.recipientRole === "TAKER_COPY")?.bodyHtml,
    ).not.toContain("mailto:coach@example.com");
    expect(
      outboxRows.find((row) => row.recipientRole === "TAKER_COPY")?.bodyHtml,
    ).toContain("cid:su-report-logo-v1");
    expect(
      outboxRows.find((row) => row.recipientRole === "TAKER_COPY")?.bodyHtml,
    ).not.toContain("Coached by");
  });

  it.each([
    {
      label: "inactive",
      certificationStatus: "INACTIVE",
      certificationExpiry: null,
    },
    {
      label: "expired",
      certificationStatus: "ACTIVE",
      certificationExpiry: new Date("2020-01-01T00:00:00Z"),
    },
  ])("persists no ownership for a known $label Coach", async (coachState) => {
    (db.coach.findUnique as jest.Mock).mockResolvedValue({
      id: "coach-1",
      email: "coach@example.com",
      firstName: "Bob",
      lastName: "Coach",
      profileImage: null,
      certificationStatus: coachState.certificationStatus,
      certificationExpiry: coachState.certificationExpiry,
    });

    await POST(
      makeRequest({
        ...VALID_BODY,
        referringCoachEmail: "coach@example.com",
      }) as never,
      makeParams() as never,
    );

    expect(txMock.assessmentSubmission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          referringCoachId: null,
          referringCoachEmail: null,
        }),
      }),
    );
    const enqueuedRoles = txMock.assessmentEmailOutbox.create.mock.calls.map(
      (call: Array<{ data: { recipientRole: string } }>) => call[0].data.recipientRole,
    );
    expect(enqueuedRoles).not.toContain("REFERRING_COACH");
  });
});

/* -------------------------------------------------------------------------- */
/*  Task 6 new behavior: idempotency (P2002 on duplicate idempotencyKey)     */
/* -------------------------------------------------------------------------- */
describe("idempotency — duplicate idempotencyKey (P2002)", () => {
  const IDEMPOTENT_BODY = { ...VALID_BODY, idempotencyKey: "client-key-xyz" };

  // Existing submission stored in DB
  const EXISTING_SUB = {
    id: "sub-existing",
    campaignId: "camp-1",
    publicTaker: VALID_BODY.publicTaker,
    answers: VALID_BODY.answers,
    referringCoach: null,
    result: {
      tier: { label: "Good" },
      overallScore: 7,
      perDomain: [
        { key: "people", label: "People", averagePoints: 8.0 },
      ],
    },
  };

  beforeEach(() => {
    // Make $transaction throw P2002 (unique constraint violation on idempotencyKey)
    const p2002 = new Prisma.PrismaClientKnownRequestError("Unique constraint", {
      code: "P2002",
      clientVersion: "6.0.0",
    });
    (db.$transaction as jest.Mock).mockRejectedValue(p2002);
    // findUnique by idempotencyKey returns the existing submission
    (db.assessmentSubmission.findFirst as jest.Mock).mockResolvedValue(EXISTING_SUB);
  });

  it("rolls back one locked write transaction before recovering a concurrent P2002 replay", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint",
      {
        code: "P2002",
        clientVersion: "6.0.0",
      },
    );
    (db.assessmentSubmission.findFirst as jest.Mock)
      .mockReset()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(EXISTING_SUB);
    txMock.assessmentSubmission.create.mockRejectedValueOnce(p2002);
    (db.$transaction as jest.Mock).mockImplementation(
      async (cb: (tx: typeof txMock) => Promise<unknown>) => {
        transactionActive = true;
        try {
          const value = await cb(txMock);
          transactionCommitMarker();
          return value;
        } catch (error) {
          transactionRollbackMarker();
          throw error;
        } finally {
          transactionActive = false;
        }
      },
    );
    const lockTransactions: unknown[] = [];
    const lockTransactionStates: boolean[] = [];
    reportStyleLockMock.mockImplementation((tx) => {
      lockTransactions.push(tx);
      lockTransactionStates.push(transactionActive);
      return Promise.resolve();
    });

    const response = await POST(
      makeRequest(IDEMPOTENT_BODY) as never,
      makeParams() as never,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: {
        submissionId: "sub-existing",
        scoreResult: EXISTING_SUB.result,
      },
    });
    expect(db.assessmentSubmission.findFirst).toHaveBeenCalledTimes(2);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(reportStyleLockMock).toHaveBeenCalledTimes(1);
    expect(lockTransactions).toEqual([txMock]);
    expect(lockTransactionStates).toEqual([true]);
    expect(txMock.assessmentSubmission.create).toHaveBeenCalledTimes(1);
    expect(transactionRollbackMarker).toHaveBeenCalledTimes(1);
    expect(transactionCommitMarker).not.toHaveBeenCalled();
    expect(txMock.assessmentEmailOutbox.create).not.toHaveBeenCalled();
  });

  it("returns 200 with existing submission data (no new create)", async () => {
    const res = await POST(makeRequest(IDEMPOTENT_BODY) as never, makeParams() as never);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.submissionId).toBe("sub-existing");
    expect(body.data.scoreResult).toEqual(EXISTING_SUB.result);
    expect(body.data.redirectUrl).toBe("/quiz/quick-assessment/thank-you");
  });

  it("recovers a matching lost response after the campaign closes", async () => {
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      ...CAMPAIGN,
      status: "CLOSED",
      closeAt: new Date("2026-01-02T00:00:00.000Z"),
    });

    const res = await POST(
      makeRequest(IDEMPOTENT_BODY) as never,
      makeParams() as never,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      success: true,
      data: {
        submissionId: "sub-existing",
        scoreResult: EXISTING_SUB.result,
      },
    });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it("matches a lost-response retry against the originally pruned answers", async () => {
    const rawAnswers = [
      { stableKey: "Q_GATE", value: ["cash"] },
      { stableKey: "Q_DEP", value: "hidden answer from the client" },
    ];
    (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue({
      ...CAMPAIGN,
      status: "CLOSED",
      closeAt: new Date("2026-01-02T00:00:00.000Z"),
    });
    (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue({
      ...VERSION,
      questions: [
        {
          stableKey: "Q_GATE",
          sortOrder: 1,
          sectionStableKey: "S1",
          type: "MULTI_CHOICE",
          label: "Gate",
          isRequired: false,
          options: [
            { key: "sales", label: "Sales" },
            { key: "cash", label: "Cash" },
          ],
        },
        {
          stableKey: "Q_DEP",
          sortOrder: 2,
          sectionStableKey: "S1",
          type: "TEXT",
          label: "Dependent",
          isRequired: false,
          showIf: { questionKey: "Q_GATE", optionKey: "sales" },
        },
      ],
    });
    (db.assessmentSubmission.findFirst as jest.Mock).mockResolvedValue({
      ...EXISTING_SUB,
      answers: [{ stableKey: "Q_GATE", value: ["cash"] }],
    });

    const res = await POST(
      makeRequest({ ...IDEMPOTENT_BODY, answers: rawAnswers }) as never,
      makeParams() as never,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      success: true,
      data: { submissionId: "sub-existing" },
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("does NOT call inngest.send on duplicate key path", async () => {
    await POST(makeRequest(IDEMPOTENT_BODY) as never, makeParams() as never);
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it("does NOT call auditLog.create on duplicate key path", async () => {
    await POST(makeRequest(IDEMPOTENT_BODY) as never, makeParams() as never);
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("looks up existing submission by idempotencyKey", async () => {
    await POST(makeRequest(IDEMPOTENT_BODY) as never, makeParams() as never);
    expect(db.assessmentSubmission.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ idempotencyKey: "client-key-xyz" }),
      }),
    );
  });

  it("returns 409 when a key is reused for different submission input", async () => {
    const res = await POST(
      makeRequest({
        ...IDEMPOTENT_BODY,
        publicTaker: {
          ...IDEMPOTENT_BODY.publicTaker,
          email: "different@example.com",
        },
      }) as never,
      makeParams() as never,
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      success: false,
      error: "IDEMPOTENCY_KEY_REUSED",
    });
  });

  it("returns 409 when a key is reused across campaigns", async () => {
    (db.assessmentSubmission.findFirst as jest.Mock).mockResolvedValue({
      ...EXISTING_SUB,
      campaignId: "camp-other",
    });

    const res = await POST(
      makeRequest(IDEMPOTENT_BODY) as never,
      makeParams() as never,
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      success: false,
      error: "IDEMPOTENCY_KEY_REUSED",
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("500s if P2002 fires but no existing row found (idempotencyKey race-lost)", async () => {
    // No existing row → should rethrow as 500
    (db.assessmentSubmission.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await POST(makeRequest(IDEMPOTENT_BODY) as never, makeParams() as never);
    expect(res.status).toBe(500);
  });

  it("500s when P2002 fires WITHOUT an idempotencyKey in the body", async () => {
    // P2002 on a non-idempotency constraint → should NOT be silenced
    const res = await POST(makeRequest(VALID_BODY) as never, makeParams() as never);
    expect(res.status).toBe(500);
  });
});
