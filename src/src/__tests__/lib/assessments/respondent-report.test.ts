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
import {
  buildStoredRespondentReport,
  getCeoSelfRespondentReport,
  getRespondentReport,
} from "@/lib/assessments/respondent-report";
import { isReportStylesEnabled } from "@/lib/assessments/wave-report-styles-flags";

const mockRevalidateCeoReportAccessInTransaction = jest.fn();

jest.mock("@/lib/assessments/ceo-report-access", () => ({
  revalidateCeoReportAccessInTransaction: (...args: unknown[]) =>
    mockRevalidateCeoReportAccessInTransaction(...args),
}));

// ── Mock access-control so canManageCampaign is fully controllable ───────
const mockCanManageCampaign = jest.fn<Promise<boolean>, [unknown, unknown, string, string]>();

jest.mock("@/lib/assessments/access-control", () => ({
  canManageCampaign: (...args: unknown[]) => mockCanManageCampaign(...(args as [unknown, unknown, string, string])),
  asAccessDb: (prisma: unknown) => prisma,
}));

jest.mock("@/lib/assessments/wave-report-styles-flags", () => ({
  isReportStylesEnabled: jest.fn(() => true),
}));

const mockReportStylesEnabled = isReportStylesEnabled as jest.Mock;

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
    {
      stableKey: "q1",
      label: "Question One",
      type: "SLIDER_LIKERT",
      sectionStableKey: "s1",
      scale: { min: 0, max: 3 },
    },
    {
      stableKey: "q2",
      label: "Open Question",
      type: "TEXT",
      sectionStableKey: "s1",
      // no scale — qualitative question
    },
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
    email: "alice@example.com",
    jobTitle: "CEO",
  },
  campaign: {
    name: "Acme Q1 Campaign",
    reportStyle: "MODERN_DASHBOARD" as const,
    template: {
      id: "tpl-1",
      name: "Rockefeller",
      alias: "leadership-vision-alignment",
    },
    organization: {
      name: "Acme Corp",
    },
    creatorCoach: {
      profileImage: "https://cdn.example.com/coach-logo.png",
      firstName: "Dana",
      lastName: "Coach",
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
  mockReportStylesEnabled.mockReturnValue(true);
});

test("buildStoredRespondentReport exposes the shared pure frozen-report seam", () => {
  const report = buildStoredRespondentReport({
    submission: {
      id: GOOD_SUBMISSION.id,
      submittedAt: GOOD_SUBMISSION.submittedAt,
      answers: GOOD_SUBMISSION.answers,
      result: GOOD_SCORE_RESULT,
    },
    respondent: {
      ...GOOD_SUBMISSION.respondent,
      email: "alice@example.com",
    },
    campaign: {
      ...GOOD_SUBMISSION.campaign,
      name: GOOD_SUBMISSION.campaign.name,
      organizationName: GOOD_SUBMISSION.campaign.organization.name,
      template: GOOD_SUBMISSION.campaign.template,
      creatorCoach: GOOD_SUBMISSION.campaign.creatorCoach,
      version: GOOD_SUBMISSION.campaign.version,
    },
  });

  expect(report.result).toBe(GOOD_SCORE_RESULT);
  expect(report.respondentEmail).toBe("alice@example.com");
  expect(report.rawAnswers).toBe(GOOD_SUBMISSION.answers);
  expect(Object.getOwnPropertyDescriptor(report, "reportStyle")?.value).toBe("MODERN_DASHBOARD");
  expect(report.provenance).toEqual({
    submissionId: "sub-1",
    versionId: "ver-1",
    contentHash: "abc123",
    templateName: "Rockefeller",
  });
});

test("stored reports keep the submission-time paragraph without consulting later question content", () => {
  const frozenResult: ScoreResult = {
    ...GOOD_SCORE_RESULT,
    recommendationPhase: 4,
    perQuestion: [{
      stableKey: "q1",
      value: 3,
      achieved: true,
      recommendation: "Frozen submission-time phase paragraph",
    }],
  };
  const report = buildStoredRespondentReport({
    submission: {
      id: GOOD_SUBMISSION.id,
      submittedAt: GOOD_SUBMISSION.submittedAt,
      answers: GOOD_SUBMISSION.answers,
      result: frozenResult,
    },
    respondent: GOOD_SUBMISSION.respondent,
    campaign: {
      ...GOOD_SUBMISSION.campaign,
      organizationName: GOOD_SUBMISSION.campaign.organization.name,
      version: {
        ...GOOD_VERSION,
        questions: [{
          ...GOOD_VERSION.questions[0],
          phaseRecommendations: [{
            phase: 4,
            bands: [{ minScore: 0, maxScore: 10, text: "Later edition paragraph" }],
          }],
        }],
      },
    },
  });

  expect(report.result).toBe(frozenResult);
  expect(report.result.recommendationPhase).toBe(4);
  expect(report.result.perQuestion[0].recommendation).toBe(
    "Frozen submission-time phase paragraph",
  );
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
  expect(report.respondentEmail).toBe("alice@example.com");
  expect(report.jobTitle).toBe("CEO");
  expect(report.companyName).toBe("Acme Corp");

  // assessmentName is ALWAYS the instrument/template name
  expect(report.assessmentName).toBe("Rockefeller");
  // templateAlias is the stable instrument slug (template.alias)
  expect(report.templateAlias).toBe("leadership-vision-alignment");
  expect(Object.getOwnPropertyDescriptor(report, "reportStyle")?.value).toBe("MODERN_DASHBOARD");
  expect(result.reportStylesAvailable).toBe(true);
  expect(mockReportStylesEnabled).toHaveBeenCalledWith({
    templateId: "tpl-1",
    campaignId: "camp-1",
  });
  // campaignLabel is the coach's label when present
  expect(report.campaignLabel).toBe("Acme Q1 Campaign");

  // Submission/result fields
  expect(report.submittedAt).toEqual(new Date("2026-01-15T10:00:00Z"));
  expect(report.result).toEqual(GOOD_SCORE_RESULT);
  expect(report.sections).toEqual(GOOD_VERSION.sections);
  expect(report.scoringConfig).toEqual(GOOD_VERSION.scoringConfig);
  expect(report.rawAnswers).toEqual(GOOD_SUBMISSION.answers);

  // Question maps
  expect(report.questionByKey["q1"]).toBe("Question One");
  expect(report.questionByKey["q2"]).toBe("Open Question");

  // Slider question: sectionStableKey + min/max populated
  expect(report.questionsByKey["q1"]).toEqual({
    type: "SLIDER_LIKERT",
    label: "Question One",
    sectionStableKey: "s1",
    min: 0,
    max: 3,
  });

  // Qualitative question (TEXT, no scale): sectionStableKey present, no min/max
  expect(report.questionsByKey["q2"]).toEqual({
    type: "TEXT",
    label: "Open Question",
    sectionStableKey: "s1",
  });
  expect(report.questionsByKey["q2"].min).toBeUndefined();
  expect(report.questionsByKey["q2"].max).toBeUndefined();

  // Provenance
  expect(report.provenance.submissionId).toBe("sub-1");
  expect(report.provenance.versionId).toBe("ver-1");
  expect(report.provenance.contentHash).toBe("abc123");
  expect(report.provenance.templateName).toBe("Rockefeller");

  // Not degraded
  expect(report.degraded).toBe(false);
});

test("1b. gate false propagates exactly while preserving the frozen non-Classic appearance", async () => {
  mockCanManageCampaign.mockResolvedValue(true);
  mockReportStylesEnabled.mockReturnValue(false);
  const { $transaction } = makeMockDb(GOOD_SUBMISSION);

  const result = await getRespondentReport(
    { $transaction } as unknown as Parameters<typeof getRespondentReport>[0],
    makeActor(),
    "camp-1",
    "resp-1",
  );

  expect(result.status).toBe("ok");
  if (result.status !== "ok") return;
  expect(result.reportStylesAvailable).toBe(false);
  expect(result.report.reportStyle).toBe("MODERN_DASHBOARD");
  expect(mockReportStylesEnabled).toHaveBeenCalledTimes(1);
  expect(mockReportStylesEnabled).toHaveBeenCalledWith({
    templateId: "tpl-1",
    campaignId: "camp-1",
  });
});

test("organization-free invited submission → status:not-found", async () => {
  mockCanManageCampaign.mockResolvedValue(true);
  const { $transaction } = makeMockDb({
    ...GOOD_SUBMISSION,
    campaign: { ...GOOD_SUBMISSION.campaign, organization: null },
  } as never);

  const result = await getRespondentReport(
    { $transaction } as unknown as Parameters<typeof getRespondentReport>[0],
    makeActor(),
    "camp-1",
    "resp-1",
  );

  expect(result).toEqual({ status: "not-found" });
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
  expect(mockReportStylesEnabled).not.toHaveBeenCalled();
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
  expect(mockReportStylesEnabled).not.toHaveBeenCalled();
});

test("CEO self report revalidates the sealed grant and loads only its bound submission inside one transaction", async () => {
  const { $transaction, _txFindFirst } = makeMockDb(GOOD_SUBMISSION);
  mockRevalidateCeoReportAccessInTransaction.mockResolvedValue({
    focusCampaignId: "camp-1",
    focusSubmissionId: "sub-1",
    invitationId: "invite-1",
    respondentId: "resp-1",
    expiresAt: "2026-08-30T00:00:00.000Z",
  });

  const outcome = await getCeoSelfRespondentReport(
    { $transaction } as unknown as Parameters<typeof getCeoSelfRespondentReport>[0],
    {
      focusCampaignId: "camp-1",
      focusSubmissionId: "sub-1",
      invitationId: "invite-1",
      respondentId: "resp-1",
      expiresAt: "2026-08-30T00:00:00.000Z",
    },
  );

  expect(outcome.status).toBe("ok");
  expect(_txFindFirst).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({
      id: "sub-1",
      campaignId: "camp-1",
      respondentId: "resp-1",
    }),
  }));
  expect(mockCanManageCampaign).not.toHaveBeenCalled();
});

test("CEO self report final fetch is bound to every revocable live eligibility relation", async () => {
  const { $transaction, _txFindFirst } = makeMockDb(GOOD_SUBMISSION);
  const expectedWhere = {
    id: "sub-1",
    campaignId: "camp-1",
    respondentId: "resp-1",
    invitationId: "invite-1",
    invitation: {
      is: {
        id: "invite-1",
        campaignId: "camp-1",
        respondentId: "resp-1",
        status: "SUBMITTED",
        revokedAt: null,
      },
    },
    respondent: {
      is: {
        id: "resp-1",
        deletedAt: null,
      },
    },
    campaign: {
      is: {
        id: "camp-1",
        deletedAt: null,
        accessMode: "INVITED",
        template: { is: { alias: "scaling-up-full" } },
        organization: {
          is: {
            deletedAt: null,
            respondents: {
              some: { id: "resp-1", deletedAt: null },
            },
          },
        },
        participants: {
          some: { respondentId: "resp-1", isCEO: true },
        },
        OR: [
          { showResultsOnScreen: true },
          { sendResultsToRespondent: true },
        ],
      },
    },
  };
  _txFindFirst.mockImplementation(async (args: { where?: unknown }) =>
    JSON.stringify(args.where) === JSON.stringify(expectedWhere)
      ? GOOD_SUBMISSION
      : null,
  );
  mockRevalidateCeoReportAccessInTransaction.mockResolvedValue({
    focusCampaignId: "camp-1",
    focusSubmissionId: "sub-1",
    invitationId: "invite-1",
    respondentId: "resp-1",
    expiresAt: "2026-08-30T00:00:00.000Z",
  });

  const outcome = await getCeoSelfRespondentReport(
    { $transaction } as unknown as Parameters<typeof getCeoSelfRespondentReport>[0],
    {
      focusCampaignId: "camp-1",
      focusSubmissionId: "sub-1",
      invitationId: "invite-1",
      respondentId: "resp-1",
      expiresAt: "2026-08-30T00:00:00.000Z",
    },
  );

  expect(outcome.status).toBe("ok");
});

test("CEO self report fails closed if current records no longer revalidate the session", async () => {
  const { $transaction, _txFindFirst } = makeMockDb(GOOD_SUBMISSION);
  mockRevalidateCeoReportAccessInTransaction.mockResolvedValue(null);

  await expect(getCeoSelfRespondentReport(
    { $transaction } as unknown as Parameters<typeof getCeoSelfRespondentReport>[0],
    {
      focusCampaignId: "camp-1",
      focusSubmissionId: "sub-1",
      invitationId: "invite-1",
      respondentId: "resp-1",
      expiresAt: "2026-08-30T00:00:00.000Z",
    },
  )).resolves.toEqual({ status: "forbidden" });
  expect(_txFindFirst).not.toHaveBeenCalled();
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

  const { $transaction } = makeMockDb(dupQuestionsSubmission as typeof GOOD_SUBMISSION);
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

test("templateAlias surfaces template.alias on the report payload", async () => {
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
  expect(result.report.templateAlias).toBe("leadership-vision-alignment");
});

test("assessmentName is always template.name; campaignLabel is null when campaign.name is empty", async () => {
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
  expect(result.report.campaignLabel).toBeNull();
});

test("assessmentName === template.name and campaignLabel === campaign.name when they differ", async () => {
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
  // Template name is the instrument
  expect(result.report.assessmentName).toBe("Rockefeller");
  // Campaign label is the coach's own label (differs from template name)
  expect(result.report.campaignLabel).toBe("Acme Q1 Campaign");
  expect(result.report.campaignLabel).not.toBe(result.report.assessmentName);
});

// ── Wave K — coach logo (reuse Coach.profileImage; no migration) ────────────

test("Wave K: select includes campaign.creatorCoach.profileImage (+ name for alt)", async () => {
  mockCanManageCampaign.mockResolvedValue(true);
  const { $transaction, _txFindFirst } = makeMockDb(GOOD_SUBMISSION);

  await getRespondentReport(
    { $transaction } as unknown as Parameters<typeof getRespondentReport>[0],
    makeActor(),
    "camp-1",
    "resp-1",
  );

  const selectArg = _txFindFirst.mock.calls[0][0].select;
  const creatorCoachSelect = selectArg.campaign.select.creatorCoach.select;
  expect(creatorCoachSelect).toEqual(
    expect.objectContaining({
      profileImage: true,
      firstName: true,
      lastName: true,
    }),
  );
});

test("Wave K: coachLogoUrl + coachName surface from campaign.creatorCoach", async () => {
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
  expect(result.report.coachLogoUrl).toBe("https://cdn.example.com/coach-logo.png");
  expect(result.report.coachName).toBe("Dana Coach");
});

test("Wave K: coachLogoUrl is null when creatorCoach is null (admin PUBLIC campaign)", async () => {
  mockCanManageCampaign.mockResolvedValue(true);
  const noCoachSubmission = {
    ...GOOD_SUBMISSION,
    campaign: {
      ...GOOD_SUBMISSION.campaign,
      creatorCoach: null,
    },
  };
  const { $transaction } = makeMockDb(
    noCoachSubmission as unknown as typeof GOOD_SUBMISSION,
  );

  const result = await getRespondentReport(
    { $transaction } as unknown as Parameters<typeof getRespondentReport>[0],
    makeActor(),
    "camp-1",
    "resp-1",
  );

  expect(result.status).toBe("ok");
  if (result.status !== "ok") return;
  expect(result.report.coachLogoUrl).toBeNull();
  expect(result.report.coachName).toBeNull();
});

test("Wave K: coachLogoUrl is null when coach has no profileImage", async () => {
  mockCanManageCampaign.mockResolvedValue(true);
  const noImageSubmission = {
    ...GOOD_SUBMISSION,
    campaign: {
      ...GOOD_SUBMISSION.campaign,
      creatorCoach: { profileImage: null, firstName: "Dana", lastName: "Coach" },
    },
  };
  const { $transaction } = makeMockDb(
    noImageSubmission as unknown as typeof GOOD_SUBMISSION,
  );

  const result = await getRespondentReport(
    { $transaction } as unknown as Parameters<typeof getRespondentReport>[0],
    makeActor(),
    "camp-1",
    "resp-1",
  );

  expect(result.status).toBe("ok");
  if (result.status !== "ok") return;
  expect(result.report.coachLogoUrl).toBeNull();
  // coachName still resolves (used for alt when an image IS present elsewhere)
  expect(result.report.coachName).toBe("Dana Coach");
});

// ── Wave P (Jeff #5): blank-name respondent falls back to email ───────────

test("Wave P: blank first/last name → respondentName falls back to the respondent's email", async () => {
  mockCanManageCampaign.mockResolvedValue(true);
  const blankNameSubmission = {
    ...GOOD_SUBMISSION,
    respondent: {
      ...GOOD_SUBMISSION.respondent,
      firstName: "",
      lastName: "",
      email: "alice@example.com",
    },
  };
  const { $transaction } = makeMockDb(
    blankNameSubmission as unknown as typeof GOOD_SUBMISSION,
  );

  const result = await getRespondentReport(
    { $transaction } as unknown as Parameters<typeof getRespondentReport>[0],
    makeActor(),
    "camp-1",
    "resp-1",
  );

  expect(result.status).toBe("ok");
  if (result.status !== "ok") return;
  // Never " " (the truthy-single-space trap) or "" — the email is shown.
  expect(result.report.respondentName).toBe("alice@example.com");
});

test("Wave P: the submission select fetches respondent.email (fallback source)", async () => {
  mockCanManageCampaign.mockResolvedValue(true);
  const { $transaction, _txFindFirst } = makeMockDb(GOOD_SUBMISSION);

  await getRespondentReport(
    { $transaction } as unknown as Parameters<typeof getRespondentReport>[0],
    makeActor(),
    "camp-1",
    "resp-1",
  );

  const callArgs = _txFindFirst.mock.calls[0][0];
  expect(callArgs.select.respondent.select.email).toBe(true);
});

test("Wave P: a normally-named respondent still renders first+last (no email leakage)", async () => {
  mockCanManageCampaign.mockResolvedValue(true);
  const named = {
    ...GOOD_SUBMISSION,
    respondent: { ...GOOD_SUBMISSION.respondent, email: "alice@example.com" },
  };
  const { $transaction } = makeMockDb(named as unknown as typeof GOOD_SUBMISSION);

  const result = await getRespondentReport(
    { $transaction } as unknown as Parameters<typeof getRespondentReport>[0],
    makeActor(),
    "camp-1",
    "resp-1",
  );

  expect(result.status).toBe("ok");
  if (result.status !== "ok") return;
  expect(result.report.respondentName).toBe("Alice Smith");
});
