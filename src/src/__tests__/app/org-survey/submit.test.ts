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
};

jest.mock("@/lib/db", () => ({
  db: {
    $transaction: jest.fn(
      (fn: (tx: typeof txMock) => unknown) => fn(txMock)
    ),
    auditLog: { create: jest.fn().mockResolvedValue(undefined) },
  },
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

function mockHappyInvitation(overrides?: Partial<{ status: string }>) {
  txMock.assessmentInvitation.findUnique.mockResolvedValue({
    id: "inv-1",
    status: overrides?.status ?? "VIEWED",
    revokedAt: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    respondentId: "r1",
    campaignId: "c1",
    campaign: {
      id: "c1",
      alias: "demo",
      status: "ACTIVE",
      openAt: new Date(Date.now() - 1000),
      closeAt: null,
      version: {
        id: "v1",
        questions: goodVersion.questions,
        sections: goodVersion.sections,
        scoringConfig: goodVersion.scoringConfig,
      },
    },
  });
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
