/**
 * Wave V (V-3) — `isImported` flows from `campaign.importManifest != null`
 * through all three loaders, as a BOOLEAN only (the manifest payload — salted
 * hashes etc. — must never reach a report/overview model).
 *
 * Fail-closed: absent/undefined manifest → false/undefined → no badge.
 */
import type { ApiActor } from "@/lib/auth/access-control";
import { getRespondentReport } from "@/lib/assessments/respondent-report";
import { getCampaignGroupReport } from "@/lib/assessments/group-report";
import { getCampaignOverview } from "@/lib/assessments/campaign-detail";

const mockCanManageCampaign = jest.fn<Promise<boolean>, unknown[]>();
const mockCanViewGroupReport = jest.fn<Promise<boolean>, unknown[]>();
jest.mock("@/lib/assessments/access-control", () => ({
  canManageCampaign: (...args: unknown[]) => mockCanManageCampaign(...args),
  canViewGroupReport: (...args: unknown[]) => mockCanViewGroupReport(...args),
  asAccessDb: (prisma: unknown) => prisma,
}));

const actor: ApiActor = {
  userId: "user-1",
  email: "admin@example.com",
  role: "ADMIN",
  coachId: null,
} as ApiActor;

const MANIFEST = { cid: "hash", roundLabel: "year-1" };

beforeEach(() => {
  jest.clearAllMocks();
  mockCanManageCampaign.mockResolvedValue(true);
  mockCanViewGroupReport.mockResolvedValue(true);
  process.env.WAVE_F_GROUP_REPORT_ENABLED = "1";
});
afterEach(() => {
  delete process.env.WAVE_F_GROUP_REPORT_ENABLED;
});

// ── getCampaignOverview ──────────────────────────────────────────────────

function overviewDb(importManifest: unknown) {
  return {
    assessmentCampaign: {
      findUnique: jest.fn().mockResolvedValue({
        id: "camp-1",
        name: "Imported Year 1",
        alias: "walk-import",
        status: "CLOSED",
        openAt: new Date("2025-01-01T00:00:00Z"),
        closeAt: new Date("2025-01-31T00:00:00Z"),
        createdAt: new Date("2026-07-01T00:00:00Z"),
        invitationSubject: null,
        invitationBodyMarkdown: null,
        invitationBodyHtml: null,
        importManifest,
        template: { id: "tpl-1", name: "Scaling Up Full" },
        organization: { id: "org-1", name: "Acme Corp" },
      }),
    },
    assessmentCampaignParticipant: { findMany: jest.fn().mockResolvedValue([]) },
    assessmentInvitation: { findMany: jest.fn().mockResolvedValue([]) },
    assessmentSubmission: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe("getCampaignOverview.isImported", () => {
  it("true when importManifest is set", async () => {
    const overview = await getCampaignOverview(overviewDb(MANIFEST) as never, "camp-1");
    expect(overview.campaign.isImported).toBe(true);
  });

  it("false when importManifest is null", async () => {
    const overview = await getCampaignOverview(overviewDb(null) as never, "camp-1");
    expect(overview.campaign.isImported).toBe(false);
  });

  it("false (fail-closed) when the select omits the field entirely", async () => {
    const overview = await getCampaignOverview(overviewDb(undefined) as never, "camp-1");
    expect(overview.campaign.isImported).toBe(false);
  });
});

// ── getRespondentReport ──────────────────────────────────────────────────

const SCORE_RESULT = {
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

function respondentDb(importManifest: unknown) {
  const submission = {
    id: "sub-1",
    submittedAt: new Date("2026-01-15T10:00:00Z"),
    answers: [{ stableKey: "q1", value: 3 }],
    result: SCORE_RESULT,
    respondent: {
      id: "resp-1",
      firstName: "Alice",
      lastName: "Smith",
      email: "alice@acme.example",
      jobTitle: "CEO",
    },
    campaign: {
      name: "Imported Year 1",
      importManifest,
      template: { id: "tpl-1", name: "Scaling Up Full", alias: "scaling-up-full" },
      organization: { name: "Acme Corp" },
      creatorCoach: null,
      version: {
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
        ],
        scoringConfig: { tiers: [] },
      },
    },
  };
  const tx = { assessmentSubmission: { findFirst: jest.fn().mockResolvedValue(submission) } };
  return {
    $transaction: jest
      .fn()
      .mockImplementation(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  };
}

describe("getRespondentReport.isImported", () => {
  it("true when the campaign carries an import manifest", async () => {
    const outcome = await getRespondentReport(respondentDb(MANIFEST) as never, actor, "c1", "r1");
    expect(outcome.status).toBe("ok");
    if (outcome.status === "ok") {
      expect(outcome.report.isImported).toBe(true);
      // the manifest itself must NOT be on the report model
      expect(JSON.stringify(outcome.report)).not.toContain("roundLabel");
    }
  });

  it("false when the manifest is null", async () => {
    const outcome = await getRespondentReport(respondentDb(null) as never, actor, "c1", "r1");
    expect(outcome.status).toBe("ok");
    if (outcome.status === "ok") expect(outcome.report.isImported).toBe(false);
  });
});

// ── getCampaignGroupReport ───────────────────────────────────────────────

function groupDb(importManifest: unknown) {
  const campaign = {
    id: "camp-1",
    accessMode: "INVITED",
    organizationId: "org-1",
    createdByCoachId: null,
    templateId: "tpl-1",
    versionId: "ver-1",
    deletedAt: null,
    importManifest,
    organization: { name: "Acme Corp" },
    template: { alias: "leadership-vision-alignment", name: "Leadership Vision Alignment" },
    creatorCoach: null,
    version: {
      id: "ver-1",
      versionNumber: 2,
      contentHash: "vhash-1",
      publishedAt: new Date("2026-05-15T00:00:00Z"),
      sections: [{ stableKey: "S3_strengths", name: "Strengths" }],
      questions: [
        {
          stableKey: "S3_culture",
          type: "SLIDER_LIKERT",
          label: "Culture",
          sectionStableKey: "S3_strengths",
          scale: { min: 1, max: 3, step: 1, anchorMin: "Weak", anchorMax: "Strong" },
        },
      ],
    },
  };
  const respondent = { firstName: "X", lastName: "Y", jobTitle: null };
  const tx = {
    assessmentCampaign: { findFirst: jest.fn().mockResolvedValue(campaign) },
    assessmentCampaignParticipant: {
      findMany: jest.fn().mockResolvedValue([
        { respondentId: "r1", isCEO: true, respondent },
        { respondentId: "r2", isCEO: false, respondent },
      ]),
    },
    assessmentSubmission: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: "sub-r1",
          respondentId: "r1",
          submittedAt: new Date("2026-06-01T10:00:00Z"),
          answers: [{ stableKey: "S3_culture", value: 3 }],
          result: {},
          respondent,
        },
        {
          id: "sub-r2",
          respondentId: "r2",
          submittedAt: new Date("2026-06-01T11:00:00Z"),
          answers: [{ stableKey: "S3_culture", value: 2 }],
          result: {},
          respondent,
        },
      ]),
    },
    assessmentInvitation: { count: jest.fn().mockResolvedValue(2) },
    assessmentBenchmark: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return {
    $transaction: jest
      .fn()
      .mockImplementation(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  };
}

describe("getCampaignGroupReport.isImported", () => {
  it("true when the campaign carries an import manifest (on provenance — the page wires provenance → props)", async () => {
    const result = await getCampaignGroupReport(
      groupDb(MANIFEST) as never,
      actor,
      "camp-1",
      new Date("2026-07-06T00:00:00Z"),
    );
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.provenance.isImported).toBe(true);
      // the manifest payload must reach neither the model nor provenance
      expect(JSON.stringify(result.report)).not.toContain("roundLabel");
      expect(JSON.stringify(result.provenance)).not.toContain("roundLabel");
    }
  });

  it("false when the manifest is null", async () => {
    const result = await getCampaignGroupReport(
      groupDb(null) as never,
      actor,
      "camp-1",
      new Date("2026-07-06T00:00:00Z"),
    );
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.provenance.isImported).toBe(false);
  });
});
