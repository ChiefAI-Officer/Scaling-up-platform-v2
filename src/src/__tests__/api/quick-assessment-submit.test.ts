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
  assessmentSubmission: {
    create: jest.fn(),
  },
  assessmentEmailOutbox: {
    create: jest.fn(),
  },
};

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

/* -------------------------------------------------------------------------- */
/*  Fixtures                                                                  */
/* -------------------------------------------------------------------------- */
const CAMPAIGN = {
  id: "camp-1",
  status: "ACTIVE",
  accessMode: "PUBLIC",
  openAt: new Date("2026-01-01T00:00:00Z"),
  closeAt: null as Date | null,
  templateId: "tmpl-1",
  versionId: "ver-1",
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

beforeEach(() => {
  jest.clearAllMocks();
  // Reset $transaction to the default callback-passthrough
  (db.$transaction as jest.Mock).mockImplementation(
    (cb: (tx: unknown) => Promise<unknown>) => cb(txMock),
  );
  // Default: rate limit allowed
  (withRateLimit as jest.Mock).mockResolvedValue({ allowed: true, headers: {} });
  // Default: campaign + version found
  (db.assessmentCampaign.findUnique as jest.Mock).mockResolvedValue(CAMPAIGN);
  (db.assessmentTemplateVersion.findUnique as jest.Mock).mockResolvedValue(VERSION);
  // Default tx: submission create returns id
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
  it("enqueues 0 outbox rows when SU team address is blank and no coach", async () => {
    // No env vars set → suTeamAddress = ""
    await POST(makeRequest(VALID_BODY) as never, makeParams() as never);
    expect(txMock.assessmentEmailOutbox.create).not.toHaveBeenCalled();
  });

  it("enqueues 1 SU_TEAM row when SU address is set and no coach", async () => {
    process.env.QUICK_ASSESSMENT_TEAM_EMAIL = "team@scalingup.com";
    await POST(makeRequest(VALID_BODY) as never, makeParams() as never);

    expect(txMock.assessmentEmailOutbox.create).toHaveBeenCalledTimes(1);
    const call = txMock.assessmentEmailOutbox.create.mock.calls[0][0];
    expect(call.data.recipientRole).toBe("SU_TEAM");
    expect(call.data.recipientEmail).toBe("team@scalingup.com");
    expect(call.data.emailType).toBe("QUICK_ASSESSMENT_LEAD");
    expect(call.data.submissionId).toBe("sub-1");
  });

  it("enqueues 2 rows (SU_TEAM + REFERRING_COACH) when SU address set and active coach found", async () => {
    process.env.QUICK_ASSESSMENT_TEAM_EMAIL = "team@scalingup.com";
    // Active coach returned by findUnique
    (db.coach.findUnique as jest.Mock).mockResolvedValue({
      id: "coach-1",
      email: "coach@example.com",
      firstName: "Bob",
      lastName: "Coach",
      certificationStatus: "ACTIVE",
      certificationExpiry: null,
    });

    const bodyWithCoach = {
      ...VALID_BODY,
      referringCoachEmail: "coach@example.com",
    };
    await POST(makeRequest(bodyWithCoach) as never, makeParams() as never);

    expect(txMock.assessmentEmailOutbox.create).toHaveBeenCalledTimes(2);
    const roles = txMock.assessmentEmailOutbox.create.mock.calls.map(
      (c: Array<{ data: { recipientRole: string } }>) => c[0].data.recipientRole,
    );
    expect(roles).toContain("SU_TEAM");
    expect(roles).toContain("REFERRING_COACH");
  });

  it("outbox rows are created inside the transaction (via txMock)", async () => {
    process.env.QUICK_ASSESSMENT_TEAM_EMAIL = "team@scalingup.com";
    // Verify it's txMock.assessmentEmailOutbox.create being called (not db.assessmentEmailOutbox)
    await POST(makeRequest(VALID_BODY) as never, makeParams() as never);
    // txMock.assessmentEmailOutbox.create was called → confirms it's inside $transaction
    expect(txMock.assessmentEmailOutbox.create).toHaveBeenCalled();
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
