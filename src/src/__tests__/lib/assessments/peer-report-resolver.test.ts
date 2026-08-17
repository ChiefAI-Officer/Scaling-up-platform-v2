jest.mock("@/lib/assessments/report-config", () => ({
  hasSourcePublicResult: jest.fn(() => false),
}));

import {
  resolvePeerReportEnhancements,
  resolvePeerReportEnhancementsForCampaign,
  resolvePeerReportEnhancementsForSubmission,
} from "@/lib/assessments/peer-report-resolver";
import {
  completeSuFullBenchmarkRows,
  completeSuFullPeerReport,
} from "@/__tests__/fixtures/su-full-peer";
import { hasSourcePublicResult } from "@/lib/assessments/report-config";
import { LVA_TEMPLATE_ALIAS } from "@/lib/assessments/lva-report-display";
import type { RespondentReport } from "@/lib/assessments/respondent-report";

const findMany = jest.fn();
const findSubmission = jest.fn();
const findCampaign = jest.fn();
const warn = jest.fn();
const db = {
  assessmentBenchmark: { findMany },
  assessmentSubmission: { findFirst: findSubmission },
  assessmentCampaign: { findFirst: findCampaign },
};
const mockHasSourcePublicResult = hasSourcePublicResult as jest.Mock;

beforeEach(() => {
  findMany.mockReset();
  findSubmission.mockReset();
  findCampaign.mockReset();
  warn.mockReset();
  mockHasSourcePublicResult.mockReset().mockReturnValue(false);
});

function lvaReport(): RespondentReport {
  return {
    ...completeSuFullPeerReport(),
    templateAlias: LVA_TEMPLATE_ALIAS,
    reportStyle: "MODERN_DASHBOARD",
    questionsByKey: {
      S3_culture: {
        type: "SLIDER_LIKERT",
        label: "Culture",
        sectionStableKey: "S3_strengths",
      },
    },
    rawAnswers: [{ stableKey: "S3_culture", value: 3 }],
  };
}

test("flag off returns the original report without a DB read", async () => {
  const report = completeSuFullPeerReport();

  const result = await resolvePeerReportEnhancements({
    db,
    report,
    templateId: "tpl-su",
    reportStylesAvailable: true,
    peerBenchmarksEnabled: false,
    logger: { warn },
  });

  expect(findMany).not.toHaveBeenCalled();
  expect(result.report).toBe(report);
  expect(result.lvaPeerComparison).toBeNull();
});

test("eligible Classic SU Full performs one query and attaches the ready model", async () => {
  findMany.mockResolvedValue(completeSuFullBenchmarkRows());

  const result = await resolvePeerReportEnhancements({
    db,
    report: completeSuFullPeerReport(),
    templateId: "tpl-su",
    reportStylesAvailable: true,
    peerBenchmarksEnabled: true,
    enabledAliases: ["scaling-up-full"],
    logger: { warn },
  });

  expect(findMany).toHaveBeenCalledTimes(1);
  expect(findMany).toHaveBeenCalledWith({
    where: { templateId: "tpl-su", metricKind: "QUESTION" },
    select: { metricKey: true, value: true, updatedAt: true },
  });
  expect(
    result.report.suFullPeerPresentation?.sections.flatMap(
      (section) => section.questions,
    ),
  ).toHaveLength(61);
});

test("an absent render alias skips the benchmark query", async () => {
  const report = completeSuFullPeerReport();

  const result = await resolvePeerReportEnhancements({
    db,
    report,
    templateId: "tpl-su",
    reportStylesAvailable: true,
    peerBenchmarksEnabled: true,
    enabledAliases: [LVA_TEMPLATE_ALIAS],
    logger: { warn },
  });

  expect(findMany).not.toHaveBeenCalled();
  expect(result.report).toBe(report);
});

test.each(["EXECUTIVE_BOARDROOM", "MODERN_DASHBOARD"])(
  "SU Full %s skips the benchmark query",
  async (reportStyle) => {
    const report = { ...completeSuFullPeerReport(), reportStyle } as RespondentReport;

    const result = await resolvePeerReportEnhancements({
      db,
      report,
      templateId: "tpl-su",
      reportStylesAvailable: true,
      peerBenchmarksEnabled: true,
      enabledAliases: ["scaling-up-full"],
      logger: { warn },
    });

    expect(findMany).not.toHaveBeenCalled();
    expect(result.report).toBe(report);
  },
);

test("unavailable report styles fall back to Classic and query", async () => {
  findMany.mockResolvedValue(completeSuFullBenchmarkRows());
  const report = {
    ...completeSuFullPeerReport(),
    reportStyle: "MODERN_DASHBOARD",
  } as RespondentReport;

  const result = await resolvePeerReportEnhancements({
    db,
    report,
    templateId: "tpl-su",
    reportStylesAvailable: false,
    peerBenchmarksEnabled: true,
    enabledAliases: ["scaling-up-full"],
    logger: { warn },
  });

  expect(findMany).toHaveBeenCalledTimes(1);
  expect(result.report.suFullPeerPresentation).toBeDefined();
});

test("a source-owned result resolves to Classic before querying", async () => {
  mockHasSourcePublicResult.mockReturnValue(true);
  findMany.mockResolvedValue(completeSuFullBenchmarkRows());
  const report = {
    ...completeSuFullPeerReport(),
    reportStyle: "MODERN_DASHBOARD",
    publicLeadActions: true,
  } as RespondentReport;

  const result = await resolvePeerReportEnhancements({
    db,
    report,
    templateId: "tpl-su",
    reportStylesAvailable: true,
    peerBenchmarksEnabled: true,
    enabledAliases: ["scaling-up-full"],
    logger: { warn },
  });

  expect(findMany).toHaveBeenCalledTimes(1);
  expect(result.report.suFullPeerPresentation).toBeDefined();
});

test("incomplete SU benchmark rows retain the original report and log a bounded warning", async () => {
  const report = completeSuFullPeerReport();
  findMany.mockResolvedValue(completeSuFullBenchmarkRows().slice(1));

  const result = await resolvePeerReportEnhancements({
    db,
    report,
    templateId: "tpl-su",
    reportStylesAvailable: true,
    peerBenchmarksEnabled: true,
    enabledAliases: ["scaling-up-full"],
    logger: { warn },
  });

  expect(result.report).toBe(report);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledWith("assessment.peer_benchmark.unavailable", {
    reason: "MISSING_ROWS",
    templateAlias: "scaling-up-full",
    templateId: "tpl-su",
    submissionId: "sub-1",
    versionId: "ver-4",
    expectedCount: 61,
    benchmarkCount: 60,
    scoreCount: 61,
  });
});

test("a benchmark DB failure retains the original report and logs only the error name", async () => {
  const report = completeSuFullPeerReport();
  findMany.mockRejectedValue(new TypeError("database credentials are secret"));

  const result = await resolvePeerReportEnhancements({
    db,
    report,
    templateId: "tpl-su",
    reportStylesAvailable: true,
    peerBenchmarksEnabled: true,
    enabledAliases: ["scaling-up-full"],
    logger: { warn },
  });

  expect(result.report).toBe(report);
  expect(warn).toHaveBeenCalledWith("assessment.peer_benchmark.unavailable", {
    reason: "DB_ERROR",
    templateAlias: "scaling-up-full",
    templateId: "tpl-su",
    submissionId: "sub-1",
    versionId: "ver-4",
    errorName: "TypeError",
  });
});

test("LVA preserves its existing PeerComparisonSection builder behavior", async () => {
  const report = lvaReport();
  findMany.mockResolvedValue([
    { metricKey: "S3_culture", value: 6.3, updatedAt: new Date("2026-08-14T00:00:00Z") },
  ]);

  const result = await resolvePeerReportEnhancements({
    db,
    report,
    templateId: "tpl-lva",
    reportStylesAvailable: true,
    peerBenchmarksEnabled: true,
    enabledAliases: [LVA_TEMPLATE_ALIAS],
    logger: { warn },
  });

  expect(findMany).toHaveBeenCalledTimes(1);
  expect(result.report).toBe(report);
  expect(result.lvaPeerComparison?.items).toEqual([
    expect.objectContaining({ stableKey: "S3_culture", ownValue: 10, peers: 6.3 }),
  ]);
});

test("the submission wrapper performs one template lookup then one benchmark query", async () => {
  findSubmission.mockResolvedValue({ campaign: { templateId: "tpl-su" } });
  findMany.mockResolvedValue(completeSuFullBenchmarkRows());

  await resolvePeerReportEnhancementsForSubmission({
    db,
    report: completeSuFullPeerReport(),
    reportStylesAvailable: true,
    peerBenchmarksEnabled: true,
    enabledAliases: ["scaling-up-full"],
    logger: { warn },
  });

  expect(findSubmission).toHaveBeenCalledWith({
    where: { id: "sub-1" },
    select: { campaign: { select: { templateId: true } } },
  });
  expect(findMany).toHaveBeenCalledTimes(1);
});

test("the campaign wrapper performs one template lookup then one benchmark query", async () => {
  findCampaign.mockResolvedValue({ templateId: "tpl-su" });
  findMany.mockResolvedValue(completeSuFullBenchmarkRows());

  await resolvePeerReportEnhancementsForCampaign({
    db,
    report: completeSuFullPeerReport(),
    campaignId: "camp-1",
    reportStylesAvailable: true,
    peerBenchmarksEnabled: true,
    enabledAliases: ["scaling-up-full"],
    logger: { warn },
  });

  expect(findCampaign).toHaveBeenCalledWith({
    where: { id: "camp-1", deletedAt: null },
    select: { templateId: true },
  });
  expect(findMany).toHaveBeenCalledTimes(1);
});

const wrapperGateCases: Array<[
  string,
  {
    report: RespondentReport;
    reportStylesAvailable: boolean;
    peerBenchmarksEnabled: boolean;
    enabledAliases?: readonly string[];
  },
]> = [
  ["the flag is off", {
    report: completeSuFullPeerReport(),
    reportStylesAvailable: true,
    peerBenchmarksEnabled: false,
  }],
  ["the alias is absent", {
    report: completeSuFullPeerReport(),
    reportStylesAvailable: true,
    peerBenchmarksEnabled: true,
    enabledAliases: [LVA_TEMPLATE_ALIAS],
  }],
  ["SU Full is not Classic", {
    report: {
      ...completeSuFullPeerReport(),
      reportStyle: "MODERN_DASHBOARD",
    } as RespondentReport,
    reportStylesAvailable: true,
    peerBenchmarksEnabled: true,
    enabledAliases: ["scaling-up-full"],
  }],
];

test.each(wrapperGateCases)(
  "the campaign wrapper skips its template lookup when %s",
  async (_caseName, options) => {
    const result = await resolvePeerReportEnhancementsForCampaign({
      db,
      ...options,
      campaignId: "camp-1",
      logger: { warn },
    });

    expect(findCampaign).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
    expect(result.report).toBe(options.report);
  },
);

test.each(wrapperGateCases)(
  "the submission wrapper skips its template lookup when %s",
  async (_caseName, options) => {
    const result = await resolvePeerReportEnhancementsForSubmission({
      db,
      ...options,
      logger: { warn },
    });

    expect(findSubmission).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
    expect(result.report).toBe(options.report);
  },
);

test("a missing submission retains the original report without a benchmark query", async () => {
  const report = completeSuFullPeerReport();
  findSubmission.mockResolvedValue(null);

  const result = await resolvePeerReportEnhancementsForSubmission({
    db,
    report,
    reportStylesAvailable: true,
    peerBenchmarksEnabled: true,
    enabledAliases: ["scaling-up-full"],
    logger: { warn },
  });

  expect(findMany).not.toHaveBeenCalled();
  expect(result.report).toBe(report);
  expect(warn).toHaveBeenCalledWith("assessment.peer_benchmark.unavailable", {
    reason: "SUBMISSION_TEMPLATE_NOT_FOUND",
    templateAlias: "scaling-up-full",
    templateId: undefined,
    submissionId: "sub-1",
    versionId: "ver-4",
  });
});
