/**
 * Assessment v7.6 — getLongitudinalTrend() unit tests (Task H).
 *
 * Pure aggregation function against a stubbed Prisma-shape DB. Covers:
 *   - Zero campaigns
 *   - Single campaign
 *   - Multi-campaign means + sparklines
 *   - Older-version filtering
 *   - Missing template / org (throws)
 */

import {
  getLongitudinalTrend,
  type TrendsDb,
} from "@/lib/assessments/trends";
import type { ScoreResult } from "@/lib/assessments/scoring";

// ─── Fixture builders ────────────────────────────────────────────────────

function buildResult(opts: {
  countAchieved: number;
  overallTotal: number;
  overallAverage: number;
  tierLabel?: string;
  perQuestion?: Array<{ stableKey: string; value: number; achieved?: boolean }>;
  perSection?: Array<{
    stableKey: string;
    name: string;
    totalPoints: number;
    averagePoints: number;
  }>;
}): ScoreResult {
  return {
    perQuestion: (opts.perQuestion ?? []).map((p) => ({
      stableKey: p.stableKey,
      value: p.value,
      achieved: p.achieved ?? false,
    })),
    perSection: (opts.perSection ?? []).map((p) => ({
      stableKey: p.stableKey,
      name: p.name,
      totalPoints: p.totalPoints,
      averagePoints: p.averagePoints,
      achievedCount: 0,
      totalCount: 4,
    })),
    overallTotal: opts.overallTotal,
    overallAverage: opts.overallAverage,
    countAchieved: opts.countAchieved,
    tier: opts.tierLabel ? { label: opts.tierLabel, message: "" } : null,
    tierMetricValue: opts.countAchieved,
    unansweredKeys: [],
  };
}

interface CampaignFixture {
  id: string;
  name: string;
  alias: string;
  openAt: Date;
  closeAt: Date | null;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
  versionId: string;
  versionNumber: number;
  language: string;
  submissions: Array<{
    respondentId: string | null;
    respondentName: { firstName: string; lastName: string } | null;
    publicTaker?: { firstName: string; lastName: string } | null;
    submittedAt: Date;
    result: ScoreResult;
  }>;
}

interface DbFixture {
  template?: { id: string; name: string; alias: string } | null;
  organization?: { id: string; name: string; deletedAt: Date | null } | null;
  versions: Array<{
    id: string;
    templateId: string;
    versionNumber: number;
    language: string;
    publishedAt: Date | null;
    questions: Array<{ stableKey: string; label: string; sortOrder: number }>;
  }>;
  campaigns: CampaignFixture[];
}

function buildDb(f: DbFixture): TrendsDb {
  return {
    assessmentTemplate: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          f.template === undefined
            ? { id: "tpl-1", name: "Rockefeller Habits", alias: "RockHabits" }
            : f.template,
        ),
    },
    organization: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          f.organization === undefined
            ? { id: "org-1", name: "Acme Corp", deletedAt: null }
            : f.organization,
        ),
    },
    assessmentTemplateVersion: {
      findMany: jest.fn().mockResolvedValue(f.versions),
    },
    assessmentCampaign: {
      findMany: jest.fn().mockResolvedValue(
        f.campaigns.map((c) => ({
          id: c.id,
          name: c.name,
          alias: c.alias,
          openAt: c.openAt,
          closeAt: c.closeAt,
          status: c.status,
          versionId: c.versionId,
          version: {
            id: c.versionId,
            versionNumber: c.versionNumber,
            language: c.language,
          },
        })),
      ),
    },
    assessmentSubmission: {
      findMany: jest.fn().mockImplementation(async (args) => {
        const includedIds = new Set(args.where.campaignId.in as string[]);
        const rows: Array<{
          campaignId: string;
          respondentId: string | null;
          submittedAt: Date;
          result: ScoreResult;
          publicTaker: { firstName: string; lastName: string } | null;
          respondent: {
            id: string;
            firstName: string;
            lastName: string;
          } | null;
        }> = [];
        for (const c of f.campaigns) {
          if (!includedIds.has(c.id)) continue;
          for (const s of c.submissions) {
            rows.push({
              campaignId: c.id,
              respondentId: s.respondentId,
              submittedAt: s.submittedAt,
              result: s.result,
              publicTaker: s.publicTaker ?? null,
              respondent:
                s.respondentName && s.respondentId
                  ? {
                      id: s.respondentId,
                      firstName: s.respondentName.firstName,
                      lastName: s.respondentName.lastName,
                    }
                  : null,
            });
          }
        }
        return rows;
      }),
    },
  };
}

const baseQuestions = [
  { stableKey: "Q1", label: "Question 1", sortOrder: 1 },
  { stableKey: "Q2", label: "Question 2", sortOrder: 2 },
  { stableKey: "Q3", label: "Question 3", sortOrder: 3 },
];

const v1 = {
  id: "ver-1",
  templateId: "tpl-1",
  versionNumber: 1,
  language: "enUS",
  publishedAt: new Date("2026-01-01T00:00:00Z"),
  questions: baseQuestions,
};

const v2 = {
  id: "ver-2",
  templateId: "tpl-1",
  versionNumber: 2,
  language: "enUS",
  publishedAt: new Date("2026-04-01T00:00:00Z"),
  questions: baseQuestions,
};

// ─── Tests ───────────────────────────────────────────────────────────────

describe("getLongitudinalTrend", () => {
  it("zero campaigns → campaigns is empty, sparklines empty, no flags", async () => {
    const db = buildDb({
      versions: [v1],
      campaigns: [],
    });

    const out = await getLongitudinalTrend(db, "tpl-1", "org-1");

    expect(out.campaigns).toEqual([]);
    expect(out.questionSparklines).toEqual({});
    expect(out.hasMultipleVersions).toBe(false);
    expect(out.excludedCampaignCount).toBe(0);
    expect(out.latestVersion.id).toBe("ver-1");
    expect(out.template.name).toBe("Rockefeller Habits");
    expect(out.organization.name).toBe("Acme Corp");
  });

  it("single campaign → one campaign entry, sparklines have one point per question", async () => {
    const db = buildDb({
      versions: [v1],
      campaigns: [
        {
          id: "c-1",
          name: "Q1 2026 Rockefeller",
          alias: "acme_q1",
          openAt: new Date("2026-02-15T10:00:00Z"),
          closeAt: null,
          status: "ACTIVE",
          versionId: "ver-1",
          versionNumber: 1,
          language: "enUS",
          submissions: [
            {
              respondentId: "r-1",
              respondentName: { firstName: "Alice", lastName: "Anders" },
              submittedAt: new Date("2026-02-16T10:00:00Z"),
              result: buildResult({
                countAchieved: 20,
                overallTotal: 60,
                overallAverage: 1.5,
                tierLabel: "OK",
                perQuestion: [
                  { stableKey: "Q1", value: 2 },
                  { stableKey: "Q2", value: 3 },
                  { stableKey: "Q3", value: 1 },
                ],
                perSection: [
                  { stableKey: "S1", name: "Section 1", totalPoints: 6, averagePoints: 2 },
                ],
              }),
            },
            {
              respondentId: "r-2",
              respondentName: { firstName: "Bob", lastName: "Brown" },
              submittedAt: new Date("2026-02-17T10:00:00Z"),
              result: buildResult({
                countAchieved: 30,
                overallTotal: 90,
                overallAverage: 2.25,
                tierLabel: "OK",
                perQuestion: [
                  { stableKey: "Q1", value: 4 },
                  { stableKey: "Q2", value: 1 },
                  { stableKey: "Q3", value: 3 },
                ],
                perSection: [
                  { stableKey: "S1", name: "Section 1", totalPoints: 8, averagePoints: 2.67 },
                ],
              }),
            },
          ],
        },
      ],
    });

    const out = await getLongitudinalTrend(db, "tpl-1", "org-1");

    expect(out.campaigns).toHaveLength(1);
    const c = out.campaigns[0];
    expect(c.submissions).toHaveLength(2);
    expect(c.submissions[0].respondentName).toBe("Alice Anders");
    expect(c.submissions[1].respondentName).toBe("Bob Brown");
    expect(c.meanCountAchieved).toBe(25);
    expect(c.meanOverallTotal).toBe(75);
    expect(c.meanOverallAverage).toBeCloseTo(1.875, 5);

    // Sparklines: 3 questions × 1 campaign each.
    expect(Object.keys(out.questionSparklines).sort()).toEqual(["Q1", "Q2", "Q3"]);
    expect(out.questionSparklines.Q1).toHaveLength(1);
    expect(out.questionSparklines.Q1[0].mean).toBe(3); // (2+4)/2
    expect(out.questionSparklines.Q1[0].n).toBe(2);
    expect(out.questionSparklines.Q2[0].mean).toBe(2); // (3+1)/2
    expect(out.questionSparklines.Q3[0].mean).toBe(2); // (1+3)/2

    expect(out.hasMultipleVersions).toBe(false);
    expect(out.excludedCampaignCount).toBe(0);
  });

  it("multi-campaign: 3 campaigns × 2 submissions each → 3 sparkline points", async () => {
    const db = buildDb({
      versions: [v1],
      campaigns: [
        {
          id: "c-1",
          name: "Q1",
          alias: "acme_q1",
          openAt: new Date("2026-01-01T00:00:00Z"),
          closeAt: null,
          status: "CLOSED",
          versionId: "ver-1",
          versionNumber: 1,
          language: "enUS",
          submissions: [
            {
              respondentId: "r-1",
              respondentName: { firstName: "A", lastName: "A" },
              submittedAt: new Date("2026-01-15T00:00:00Z"),
              result: buildResult({
                countAchieved: 10,
                overallTotal: 30,
                overallAverage: 1.0,
                perQuestion: [{ stableKey: "Q1", value: 1 }],
              }),
            },
            {
              respondentId: "r-2",
              respondentName: { firstName: "B", lastName: "B" },
              submittedAt: new Date("2026-01-16T00:00:00Z"),
              result: buildResult({
                countAchieved: 12,
                overallTotal: 36,
                overallAverage: 1.2,
                perQuestion: [{ stableKey: "Q1", value: 3 }],
              }),
            },
          ],
        },
        {
          id: "c-2",
          name: "Q2",
          alias: "acme_q2",
          openAt: new Date("2026-02-01T00:00:00Z"),
          closeAt: null,
          status: "CLOSED",
          versionId: "ver-1",
          versionNumber: 1,
          language: "enUS",
          submissions: [
            {
              respondentId: "r-1",
              respondentName: { firstName: "A", lastName: "A" },
              submittedAt: new Date("2026-02-15T00:00:00Z"),
              result: buildResult({
                countAchieved: 20,
                overallTotal: 60,
                overallAverage: 2.0,
                perQuestion: [{ stableKey: "Q1", value: 2 }],
              }),
            },
            {
              respondentId: "r-2",
              respondentName: { firstName: "B", lastName: "B" },
              submittedAt: new Date("2026-02-16T00:00:00Z"),
              result: buildResult({
                countAchieved: 22,
                overallTotal: 66,
                overallAverage: 2.2,
                perQuestion: [{ stableKey: "Q1", value: 4 }],
              }),
            },
          ],
        },
        {
          id: "c-3",
          name: "Q3",
          alias: "acme_q3",
          openAt: new Date("2026-03-01T00:00:00Z"),
          closeAt: null,
          status: "ACTIVE",
          versionId: "ver-1",
          versionNumber: 1,
          language: "enUS",
          submissions: [
            {
              respondentId: "r-1",
              respondentName: { firstName: "A", lastName: "A" },
              submittedAt: new Date("2026-03-15T00:00:00Z"),
              result: buildResult({
                countAchieved: 30,
                overallTotal: 90,
                overallAverage: 3.0,
                perQuestion: [{ stableKey: "Q1", value: 3 }],
              }),
            },
            {
              respondentId: "r-2",
              respondentName: { firstName: "B", lastName: "B" },
              submittedAt: new Date("2026-03-16T00:00:00Z"),
              result: buildResult({
                countAchieved: 32,
                overallTotal: 96,
                overallAverage: 3.2,
                perQuestion: [{ stableKey: "Q1", value: 5 }],
              }),
            },
          ],
        },
      ],
    });

    const out = await getLongitudinalTrend(db, "tpl-1", "org-1");

    expect(out.campaigns).toHaveLength(3);
    expect(out.campaigns.map((c) => c.campaign.id)).toEqual([
      "c-1",
      "c-2",
      "c-3",
    ]);

    // Means
    expect(out.campaigns[0].meanCountAchieved).toBe(11);
    expect(out.campaigns[1].meanCountAchieved).toBe(21);
    expect(out.campaigns[2].meanCountAchieved).toBe(31);

    // Sparklines: 3 points for Q1.
    expect(out.questionSparklines.Q1).toHaveLength(3);
    expect(out.questionSparklines.Q1.map((p) => p.mean)).toEqual([2, 3, 4]);
    expect(out.questionSparklines.Q1.map((p) => p.n)).toEqual([2, 2, 2]);
    expect(out.questionSparklines.Q1[0].campaignId).toBe("c-1");
  });

  it("version filtering: 1 latest-version campaign + 1 older-version campaign → only latest included", async () => {
    // v1 (latest, published Apr 1) + v0 (older, published Jan 1)
    const v0 = {
      id: "ver-0",
      templateId: "tpl-1",
      versionNumber: 1,
      language: "enUS",
      publishedAt: new Date("2026-01-01T00:00:00Z"),
      questions: baseQuestions,
    };
    const vLatest = {
      id: "ver-2",
      templateId: "tpl-1",
      versionNumber: 2,
      language: "enUS",
      publishedAt: new Date("2026-04-01T00:00:00Z"),
      questions: baseQuestions,
    };

    const db = buildDb({
      versions: [v0, vLatest],
      campaigns: [
        {
          id: "c-old",
          name: "Old Campaign",
          alias: "acme_old",
          openAt: new Date("2026-02-01T00:00:00Z"),
          closeAt: null,
          status: "CLOSED",
          versionId: "ver-0",
          versionNumber: 1,
          language: "enUS",
          submissions: [],
        },
        {
          id: "c-new",
          name: "New Campaign",
          alias: "acme_new",
          openAt: new Date("2026-05-01T00:00:00Z"),
          closeAt: null,
          status: "ACTIVE",
          versionId: "ver-2",
          versionNumber: 2,
          language: "enUS",
          submissions: [
            {
              respondentId: "r-1",
              respondentName: { firstName: "A", lastName: "A" },
              submittedAt: new Date("2026-05-10T00:00:00Z"),
              result: buildResult({
                countAchieved: 25,
                overallTotal: 75,
                overallAverage: 2.5,
                perQuestion: [{ stableKey: "Q1", value: 3 }],
              }),
            },
          ],
        },
      ],
    });

    const out = await getLongitudinalTrend(db, "tpl-1", "org-1");

    expect(out.campaigns).toHaveLength(1);
    expect(out.campaigns[0].campaign.id).toBe("c-new");
    expect(out.excludedCampaignCount).toBe(1);
    expect(out.hasMultipleVersions).toBe(true);
    expect(out.latestVersion.id).toBe("ver-2");
  });

  it("missing template → throws", async () => {
    const db = buildDb({
      template: null,
      versions: [v1],
      campaigns: [],
    });
    await expect(
      getLongitudinalTrend(db, "tpl-missing", "org-1"),
    ).rejects.toThrow(/not found/);
  });

  it("missing org → throws", async () => {
    const db = buildDb({
      organization: null,
      versions: [v1],
      campaigns: [],
    });
    await expect(
      getLongitudinalTrend(db, "tpl-1", "org-missing"),
    ).rejects.toThrow(/not found/);
  });

  it("soft-deleted org (deletedAt set) → throws", async () => {
    const db = buildDb({
      organization: {
        id: "org-1",
        name: "Acme",
        deletedAt: new Date("2026-05-01T00:00:00Z"),
      },
      versions: [v1],
      campaigns: [],
    });
    await expect(
      getLongitudinalTrend(db, "tpl-1", "org-1"),
    ).rejects.toThrow(/not found/);
  });

  it("no published versions → returns empty placeholder", async () => {
    const db = buildDb({
      versions: [{ ...v1, publishedAt: null }],
      campaigns: [],
    });

    const out = await getLongitudinalTrend(db, "tpl-1", "org-1");

    expect(out.campaigns).toEqual([]);
    expect(out.latestVersion.id).toBe("");
    expect(out.latestVersion.versionNumber).toBe(0);
  });

  it("publicTaker fallback for anonymous submissions", async () => {
    const db = buildDb({
      versions: [v1],
      campaigns: [
        {
          id: "c-1",
          name: "Public",
          alias: "acme_pub",
          openAt: new Date("2026-03-01T00:00:00Z"),
          closeAt: null,
          status: "ACTIVE",
          versionId: "ver-1",
          versionNumber: 1,
          language: "enUS",
          submissions: [
            {
              respondentId: null,
              respondentName: null,
              publicTaker: { firstName: "Pub", lastName: "Lic" },
              submittedAt: new Date("2026-03-15T00:00:00Z"),
              result: buildResult({
                countAchieved: 5,
                overallTotal: 15,
                overallAverage: 0.5,
              }),
            },
            {
              respondentId: null,
              respondentName: null,
              publicTaker: null,
              submittedAt: new Date("2026-03-16T00:00:00Z"),
              result: buildResult({
                countAchieved: 10,
                overallTotal: 30,
                overallAverage: 1.0,
              }),
            },
          ],
        },
      ],
    });

    const out = await getLongitudinalTrend(db, "tpl-1", "org-1");
    expect(out.campaigns[0].submissions[0].respondentName).toBe("Pub Lic");
    expect(out.campaigns[0].submissions[1].respondentName).toBe("Anonymous");
  });
});
