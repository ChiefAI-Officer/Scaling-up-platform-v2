/**
 * Tests for getRespondentReport — authorized enriched loader (Task 1).
 *
 * Mocking strategy:
 *   - `canManageCampaign` from access-control is mocked via jest.mock.
 *   - `db` is a hand-built object that exposes `$transaction` + a
 *     `assessmentSubmission.findFirst` stub on the transaction client.
 *   - `db.$transaction(cb)` calls its callback with a `tx` object so we
 *     can assert (a) that $transaction was called and (b) that the actual
 *     fetch uses the tx delegate, not the outer db delegate.
 */

import type { ApiActor } from "@/lib/auth/access-control";
import type { ScoreResult } from "@/lib/assessments/scoring";
import { getRespondentReport } from "@/lib/assessments/respondent-report";

// ── Mock access-control so canManageCampaign is fully controllable ───────
const mockCanManageCampaign = jest.fn<Promise<boolean>, [unknown, unknown, string, string]>();

jest.mock("@/lib/assessments/access-control", () => ({
  canManageCampaign: (...args: unknown[]) => mockCanManageCampaign(...(args as [unknown, unknown, string, string])),
  asAccessDb: (prisma: unknown) => prisma,
}));

// ── Helpers ──────────────────────────────────────────────────────────────

function makeActor(overrides: Partial<ApiActor> = {}): ApiActor {
  return {
    userId: "user-1",
    email: "coach@example.com",
    role: "COACH",
    coachId: "coach-1",
    ...overrides,
  };
}

const GOOD_SCORE_RESULT: ScoreResult = {
  perQuestion: [{ stableKey: "q1", value: 3, achieved: true }],
  perSection: [
    {
      stableKey: "s1",
      name: "Section One",
      totalPoints: 3,
      averagePoints: 3,
      achievedCount: 1,
      totalCount: 1,
    },
  ],
  overallTotal: 3,
  overallAverage: 3,
  countAchieved: 1,
  tier: { label: "Good", message: "Good tier" },
  tierMetricValue: 3,
  unansweredKeys: [],
};

const GOOD_VERSION = {
  id: "ver-1",
  contentHash: "abc123",
  sections: [{ stableKey: "s1", name: "Section One" }],
  questions: [
    { stableKey: "q1", label: "Question One", type: "SLIDER_LIKERT" },
  ],
  scoringConfig: { tiers: [] },
};

const GOOD_SUBMISSION = {
  id: "sub-1",
  submittedAt: new Date("2026-01-15T10:00:00Z"),
  answers: [{ stableKey: "q1", value: 3 }],
  result: GOOD_SCORE_RESULT as unknown as Record<string, unknown>,
  respondent: {
    id: "resp-1",
    firstName: "Alice",
    lastName: "Smith",
    jobTitle: "CEO",
  },
  campaign: {
    name: "Acme Q1 Campaign",
    template: {
      id: "tpl-1",
      name: "Rockefeller",
    },
    organization: {
      name: "Acme Corp",
    },
    version: GOOD_VERSION,
  },
};

interface MockTx {
  assessmentSubmission: { findFirst: jest.Mock };
}

/** Build a mock db whose $transaction calls the callback with tx. */
function makeMockDb(submission: typeof GOOD_SUBMISSION | null) {
  const txFindFirst = jest.fn().mockResolvedValue(submission);

  const tx: MockTx = {
    assessmentSubmission: {
      findFirst: txFindFirst,
    },
  };

  const $transaction = jest.fn().mockImplementation(
    async (cb: (tx: MockTx) => Promise<unknown>) => cb(tx),
  );

  return { $transaction, _txFindFirst: txFindFirst, _tx: tx };
}

// ─────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

test("1. owning coach + submission → status:ok, all fields populated, provenance correct", async () => {
  mockCanManageCampaign.mockResolvedValue(true);
  const { $transaction } = makeMockDb(GOOD_SUBMISSION);

  const result = await getRespondentReport(
    { $transaction } as unknown as Parameters<typeof getRespondentReport>[0],
    makeActor(),
    "camp-1",
    "resp-1",
  );

  expect(result.status).toBe("ok");
  if (result.status !== "ok") return;

  const { report } = result;

  // Respondent fields
  expect(report.respondentName).toBe("Alice Smith");
  expect(report.jobTitle).toBe("CEO");
  expect(report.companyName).toBe("Acme Corp");

  // Assessment name uses campaign.name when present
  expect(report.assessmentName).toBe("Acme Q1 Campaign");

  // Submission/result fields
  expect(report.submittedAt).toEqual(new Date("2026-01-15T10:00:00Z"));
  expect(report.result).toEqual(GOOD_SCORE_RESULT);
  expect(report.sections).toEqual(GOOD_VERSION.sections);
  expect(report.scoringConfig).toEqual(GOOD_VERSION.scoringConfig);
  expect(report.rawAnswers).toEqual(GOOD_SUBMISSION.answers);

  // Question maps
  expect(report.questionByKey).toEqual({ q1: "Question One" });
  expect(report.questionsByKey["q1"]).toEqual({
    type: "SLIDER_LIKERT",
    label: "Question One",
  });

  // Provenance
  expect(report.provenance.submissionId).toBe("sub-1");
  expect(report.provenance.versionId).toBe("ver-1");
  expect(report.provenance.contentHash).toBe("abc123");
  expect(report.provenance.templateName).toBe("Rockefeller");

  // Not degraded
  expect(report.degraded).toBe(false);
});

test("2. ADMIN actor → status:ok (not blocked by canManageCampaign)", async () => {
  mockCanManageCampaign.mockResolvedValue(true);
  const { $transaction } = makeMockDb(GOOD_SUBMISSION);

  const result = await getRespondentReport(
    { $transaction } as unknown as Parameters<typeof getRespondentReport>[0],
    makeActor({ role: "ADMIN", coachId: null }),
    "camp-1",
    "resp-1",
  );

  expect(result.status).toBe("ok");
});

test("2b. STAFF actor → status:ok (not blocked)", async () => {
  mockCanManageCampaign.mockResolvedValue(true);
  const { $transaction } = makeMockDb(GOOD_SUBMISSION);

  const result = await getRespondentReport(
    { $transaction } as unknown as Parameters<typeof getRespondentReport>[0],
    makeActor({ role: "STAFF", coachId: null }),
    "camp-1",
    "resp-1",
  );

  expect(result.status).toBe("ok");
});

test("3. canManageCampaign → false → status:forbidden", async () => {
  mockCanManageCampaign.mockResolvedValue(false);
  const { $transaction } = makeMockDb(GOOD_SUBMISSION);

  const result = await getRespondentReport(
    { $transaction } as unknown as Parameters<typeof getRespondentReport>[0],
    makeActor(),
    "camp-1",
    "resp-1",
  );

  expect(result.status).toBe("forbidden");
});

test("4. no submission → status:not-found", async () => {
  mockCanManageCampaign.mockResolvedValue(true);
  const { $transaction } = makeMockDb(null);

  const result = await getRespondentReport(
    { $transaction } as unknown as Parameters<typeof getRespondentReport>[0],
    makeActor(),
    "camp-1",
    "resp-999",
  );

  expect(result.status).toBe("not-found");
});

test("5. duplicate stableKey in version.questions → first-wins, no throw", async () => {
  mockCanManageCampaign.mockResolvedValue(true);

  const dupQuestionsSubmission = {
    ...GOOD_SUBMISSION,
    campaign: {
      ...GOOD_SUBMISSION.campaign,
      version: {
        ...GOOD_VERSION,
        questions: [
          { stableKey: "q1", label: "First Label", type: "SLIDER_LIKERT" },
          { stableKey: "q1", label: "Duplicate Label", type: "SLIDER_LIKERT" },
          { stableKey: "q2", label: "Question Two", type: "SLIDER_LIKERT" },
        ],
      },
    },
  };

  const { $transaction } = makeMockDb(dupQuestionsSubmission);
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

  const result = await getRespondentReport(
    { $transaction } as unknown as Parameters<typeof getRespondentReport>[0],
    makeActor(),
    "camp-1",
    "resp-1",
  );

  expect(result.status).toBe("ok");
  if (result.status !== "ok") return;

  // First-wins: "q1" keeps first label
  expect(result.report.questionByKey["q1"]).toBe("First Label");
  expect(result.report.questionsByKey["q1"].label).toBe("First Label");

  // Second question is still present
  expect(result.report.questionByKey["q2"]).toBe("Question Two");

  // console.warn called once for the duplicate
  expect(warnSpy).toHaveBeenCalledTimes(1);
  expect(warnSpy.mock.calls[0][0]).toMatch(/duplicate.*stableKey.*q1/i);

  warnSpy.mockRestore();
});

test("6. malformed result (missing perSection) → status:ok with degraded:true, no throw", async () => {
  mockCanManageCampaign.mockResolvedValue(true);

  const malformedSubmission = {
    ...GOOD_SUBMISSION,
    result: { overallTotal: 5 } as unknown as Record<string, unknown>, // missing perSection + perQuestion
  };

  const { $transaction } = makeMockDb(malformedSubmission);

  const result = await getRespondentReport(
    { $transaction } as unknown as Parameters<typeof getRespondentReport>[0],
    makeActor(),
    "camp-1",
    "resp-1",
  );

  expect(result.status).toBe("ok");
  if (result.status !== "ok") return;
  expect(result.report.degraded).toBe(true);
});

test("7. db.$transaction is invoked and the fetch happens within its callback", async () => {
  mockCanManageCampaign.mockResolvedValue(true);
  const { $transaction, _txFindFirst } = makeMockDb(GOOD_SUBMISSION);

  await getRespondentReport(
    { $transaction } as unknown as Parameters<typeof getRespondentReport>[0],
    makeActor(),
    "camp-1",
    "resp-1",
  );

  // Transaction was invoked
  expect($transaction).toHaveBeenCalledTimes(1);

  // The findFirst was called on the TX client (not a separate outer db)
  expect(_txFindFirst).toHaveBeenCalledTimes(1);
  expect(_txFindFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        campaignId: "camp-1",
        respondentId: "resp-1",
      }),
    }),
  );
});

test("assessmentName falls back to template.name when campaign.name is empty/null", async () => {
  mockCanManageCampaign.mockResolvedValue(true);

  const noNameSubmission = {
    ...GOOD_SUBMISSION,
    campaign: {
      ...GOOD_SUBMISSION.campaign,
      name: "",
    },
  };

  const { $transaction } = makeMockDb(noNameSubmission);

  const result = await getRespondentReport(
    { $transaction } as unknown as Parameters<typeof getRespondentReport>[0],
    makeActor(),
    "camp-1",
    "resp-1",
  );

  expect(result.status).toBe("ok");
  if (result.status !== "ok") return;
  expect(result.report.assessmentName).toBe("Rockefeller");
});
