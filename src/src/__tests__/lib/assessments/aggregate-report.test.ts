/**
 * Assessment Tool v7.6 — getAggregateReport() unit tests.
 *
 * Pure aggregation function. Mocks a minimal AggregateReportDb.
 * Coverage: empty, single, multi-submission with multiple orgs/tiers,
 * per-section means, submissions-over-time bucketing.
 */

import {
  getAggregateReport,
  type AggregateReportDb,
} from "@/lib/assessments/aggregate-report";
import type { ScoreResult } from "@/lib/assessments/scoring";

function buildVersionJson() {
  return {
    id: "ver-1",
    sections: [
      { stableKey: "S1", name: "Section 1", sortOrder: 1 },
      { stableKey: "S2", name: "Section 2", sortOrder: 2 },
    ],
    scoringConfig: {
      tierMetric: "countAchieved",
      passThreshold: 2,
      tiers: [
        { minMetric: 0, maxMetric: 16, label: "Low", message: "Low msg" },
        { minMetric: 17, maxMetric: 32, label: "OK", message: "OK msg" },
        { minMetric: 33, maxMetric: 40, label: "Great", message: "Great msg" },
      ],
    },
  };
}

function buildResult(opts: {
  countAchieved: number;
  overallTotal: number;
  overallAverage: number;
  tierLabel: string;
  tierMessage?: string;
  perSection?: Array<{
    stableKey: string;
    totalPoints: number;
    averagePoints: number;
  }>;
}): ScoreResult {
  return {
    perQuestion: [],
    perSection: (opts.perSection ?? []).map((p) => ({
      stableKey: p.stableKey,
      name: p.stableKey,
      totalPoints: p.totalPoints,
      averagePoints: p.averagePoints,
      achievedCount: 0,
      totalCount: 4,
    })),
    overallTotal: opts.overallTotal,
    overallAverage: opts.overallAverage,
    countAchieved: opts.countAchieved,
    tier: { label: opts.tierLabel, message: opts.tierMessage ?? "" },
    tierMetricValue: opts.countAchieved,
    unansweredKeys: [],
  };
}

function buildDb(submissions: Array<{
  submittedAt: Date;
  result: ScoreResult;
  organizationId: string;
}>): AggregateReportDb {
  return {
    assessmentTemplateVersion: {
      findUnique: jest.fn().mockResolvedValue(buildVersionJson()),
    },
    assessmentSubmission: {
      findMany: jest.fn().mockResolvedValue(
        submissions.map((s) => ({
          submittedAt: s.submittedAt,
          result: s.result,
          campaign: { organizationId: s.organizationId },
        })),
      ),
    },
  };
}

describe("getAggregateReport", () => {
  it("zero submissions → all-zero report shape with tier and section skeletons", async () => {
    const db = buildDb([]);
    const report = await getAggregateReport(db, "tpl-1", "ver-1");

    expect(report).toEqual({
      templateId: "tpl-1",
      versionId: "ver-1",
      totalSubmissions: 0,
      distinctOrgs: 0,
      avgCountAchieved: 0,
      avgOverallTotal: 0,
      avgOverallAverage: 0,
      tierHistogram: [
        { label: "Low", message: "Low msg", count: 0 },
        { label: "OK", message: "OK msg", count: 0 },
        { label: "Great", message: "Great msg", count: 0 },
      ],
      perSectionMeans: [
        {
          stableKey: "S1",
          name: "Section 1",
          totalPointsAvg: 0,
          averagePointsAvg: 0,
        },
        {
          stableKey: "S2",
          name: "Section 2",
          totalPointsAvg: 0,
          averagePointsAvg: 0,
        },
      ],
      submissionsOverTime: [],
    });
  });

  it("single submission → means equal that submission's values, one tier hit", async () => {
    const db = buildDb([
      {
        submittedAt: new Date("2026-05-15T10:00:00Z"),
        organizationId: "org-1",
        result: buildResult({
          countAchieved: 25,
          overallTotal: 80,
          overallAverage: 2.0,
          tierLabel: "OK",
          tierMessage: "OK msg",
          perSection: [
            { stableKey: "S1", totalPoints: 8, averagePoints: 2.0 },
            { stableKey: "S2", totalPoints: 10, averagePoints: 2.5 },
          ],
        }),
      },
    ]);

    const report = await getAggregateReport(db, "tpl-1", "ver-1");

    expect(report.totalSubmissions).toBe(1);
    expect(report.distinctOrgs).toBe(1);
    expect(report.avgCountAchieved).toBe(25);
    expect(report.avgOverallTotal).toBe(80);
    expect(report.avgOverallAverage).toBe(2.0);

    expect(report.tierHistogram).toEqual([
      { label: "Low", message: "Low msg", count: 0 },
      { label: "OK", message: "OK msg", count: 1 },
      { label: "Great", message: "Great msg", count: 0 },
    ]);

    expect(report.perSectionMeans).toEqual([
      {
        stableKey: "S1",
        name: "Section 1",
        totalPointsAvg: 8,
        averagePointsAvg: 2.0,
      },
      {
        stableKey: "S2",
        name: "Section 2",
        totalPointsAvg: 10,
        averagePointsAvg: 2.5,
      },
    ]);

    expect(report.submissionsOverTime).toEqual([
      { date: "2026-05-15", count: 1 },
    ]);
  });

  it("3 submissions across 2 orgs and different tiers → distinctOrgs=2, histogram correct", async () => {
    const db = buildDb([
      {
        submittedAt: new Date("2026-05-15T08:00:00Z"),
        organizationId: "org-A",
        result: buildResult({
          countAchieved: 10,
          overallTotal: 40,
          overallAverage: 1.0,
          tierLabel: "Low",
          tierMessage: "Low msg",
        }),
      },
      {
        submittedAt: new Date("2026-05-15T18:00:00Z"),
        organizationId: "org-A",
        result: buildResult({
          countAchieved: 20,
          overallTotal: 60,
          overallAverage: 1.5,
          tierLabel: "OK",
          tierMessage: "OK msg",
        }),
      },
      {
        submittedAt: new Date("2026-05-15T20:00:00Z"),
        organizationId: "org-B",
        result: buildResult({
          countAchieved: 36,
          overallTotal: 110,
          overallAverage: 2.75,
          tierLabel: "Great",
          tierMessage: "Great msg",
        }),
      },
    ]);

    const report = await getAggregateReport(db, "tpl-1", "ver-1");

    expect(report.totalSubmissions).toBe(3);
    expect(report.distinctOrgs).toBe(2);
    expect(report.avgCountAchieved).toBe((10 + 20 + 36) / 3);
    expect(report.avgOverallTotal).toBe((40 + 60 + 110) / 3);
    expect(report.avgOverallAverage).toBeCloseTo((1.0 + 1.5 + 2.75) / 3, 10);

    expect(report.tierHistogram).toEqual([
      { label: "Low", message: "Low msg", count: 1 },
      { label: "OK", message: "OK msg", count: 1 },
      { label: "Great", message: "Great msg", count: 1 },
    ]);
  });

  it("per-section means: 2 submissions with different per-section scores produce correct means", async () => {
    const db = buildDb([
      {
        submittedAt: new Date("2026-05-15T08:00:00Z"),
        organizationId: "org-A",
        result: buildResult({
          countAchieved: 20,
          overallTotal: 60,
          overallAverage: 1.5,
          tierLabel: "OK",
          perSection: [
            { stableKey: "S1", totalPoints: 8, averagePoints: 2.0 },
            { stableKey: "S2", totalPoints: 4, averagePoints: 1.0 },
          ],
        }),
      },
      {
        submittedAt: new Date("2026-05-15T09:00:00Z"),
        organizationId: "org-A",
        result: buildResult({
          countAchieved: 10,
          overallTotal: 40,
          overallAverage: 1.0,
          tierLabel: "Low",
          perSection: [
            { stableKey: "S1", totalPoints: 4, averagePoints: 1.0 },
            { stableKey: "S2", totalPoints: 12, averagePoints: 3.0 },
          ],
        }),
      },
    ]);

    const report = await getAggregateReport(db, "tpl-1", "ver-1");

    expect(report.perSectionMeans).toEqual([
      {
        stableKey: "S1",
        name: "Section 1",
        totalPointsAvg: 6,
        averagePointsAvg: 1.5,
      },
      {
        stableKey: "S2",
        name: "Section 2",
        totalPointsAvg: 8,
        averagePointsAvg: 2.0,
      },
    ]);
  });

  it("submissions-over-time: 3 submissions on 2 dates → 2 buckets ascending", async () => {
    const db = buildDb([
      {
        // 2026-05-16 UTC
        submittedAt: new Date("2026-05-16T01:00:00Z"),
        organizationId: "org-A",
        result: buildResult({
          countAchieved: 10,
          overallTotal: 40,
          overallAverage: 1.0,
          tierLabel: "Low",
        }),
      },
      {
        // 2026-05-15 UTC
        submittedAt: new Date("2026-05-15T23:30:00Z"),
        organizationId: "org-A",
        result: buildResult({
          countAchieved: 20,
          overallTotal: 60,
          overallAverage: 1.5,
          tierLabel: "OK",
        }),
      },
      {
        // 2026-05-16 UTC
        submittedAt: new Date("2026-05-16T11:00:00Z"),
        organizationId: "org-B",
        result: buildResult({
          countAchieved: 30,
          overallTotal: 90,
          overallAverage: 2.25,
          tierLabel: "OK",
        }),
      },
    ]);

    const report = await getAggregateReport(db, "tpl-1", "ver-1");

    expect(report.submissionsOverTime).toEqual([
      { date: "2026-05-15", count: 1 },
      { date: "2026-05-16", count: 2 },
    ]);
  });

  it("missing version row → tier/section skeletons are empty arrays, still aggregates submissions", async () => {
    const db: AggregateReportDb = {
      assessmentTemplateVersion: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      assessmentSubmission: {
        findMany: jest.fn().mockResolvedValue([
          {
            submittedAt: new Date("2026-05-15T08:00:00Z"),
            result: buildResult({
              countAchieved: 20,
              overallTotal: 60,
              overallAverage: 1.5,
              tierLabel: "OK",
            }),
            campaign: { organizationId: "org-A" },
          },
        ]),
      },
    };

    const report = await getAggregateReport(db, "tpl-1", "ver-missing");

    expect(report.totalSubmissions).toBe(1);
    expect(report.tierHistogram).toEqual([]);
    expect(report.perSectionMeans).toEqual([]);
  });
});
