import {
  buildSuFullPeerPresentation,
  buildSuFullPeerPresentationResult,
} from "@/lib/assessments/su-full-peer-presentation";
import type { RespondentReport } from "@/lib/assessments/respondent-report";
import {
  completeSuFullBenchmarkRows,
  completeSuFullPeerReport,
} from "@/__tests__/fixtures/su-full-peer";

test("builds both sections in frozen order and joins all 61 rows by stable key", () => {
  const benchmarks = completeSuFullBenchmarkRows().reverse();
  const result = buildSuFullPeerPresentationResult({
    report: completeSuFullPeerReport(),
    benchmarks,
  });

  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error(result.reason);
  expect(result.presentation.sections.flatMap((section) => section.questions)).toHaveLength(61);
  expect(result.presentation.sections[0].stableKey).toBe("S_PEOPLE_YE");
  expect(result.presentation.sections[0].questions[0]).toMatchObject({
    stableKey: "Q01",
    peers: 6.3,
    recommendation: "Frozen feedback Q01",
  });
  expect(result.presentation.benchmarkUpdatedAt).toBe("2026-08-18T00:00:00.000Z");
  expect(Object.isFrozen(result.presentation)).toBe(true);
  expect(Object.isFrozen(result.presentation.sections[0].questions)).toBe(true);
});

test.each([
  ["wrong alias", (report: RespondentReport) => ({ ...report, templateAlias: "qsp-v2" }), "WRONG_TEMPLATE"],
  ["degraded", (report: RespondentReport) => ({ ...report, degraded: true }), "DEGRADED_REPORT"],
])("%s fails closed", (_name, mutate, reason) => {
  const result = buildSuFullPeerPresentationResult({
    report: mutate(completeSuFullPeerReport()),
    benchmarks: completeSuFullBenchmarkRows(),
  });

  expect(result).toMatchObject({ status: "unavailable", reason });
  expect(buildSuFullPeerPresentation({
    report: mutate(completeSuFullPeerReport()),
    benchmarks: completeSuFullBenchmarkRows(),
  })).toBeNull();
});

test("a blank frozen recommendation remains null and is never invented", () => {
  const report = completeSuFullPeerReport();
  const q01 = report.result.perQuestion.find((row) => row.stableKey === "Q01");
  if (q01) q01.recommendation = "";

  const result = buildSuFullPeerPresentationResult({
    report,
    benchmarks: completeSuFullBenchmarkRows(),
  });

  expect(result.status).toBe("ready");
  if (result.status === "ready") {
    expect(result.presentation.sections[0].questions[0].recommendation).toBeNull();
  }
});

test.each([
  ["a missing benchmark", (report: RespondentReport, benchmarks: ReturnType<typeof completeSuFullBenchmarkRows>) => ({ report, benchmarks: benchmarks.slice(1) }), "MISSING_ROWS"],
  ["duplicate benchmark Q01", (report: RespondentReport, benchmarks: ReturnType<typeof completeSuFullBenchmarkRows>) => ({ report, benchmarks: [benchmarks[0], benchmarks[0], ...benchmarks.slice(1)] }), "DUPLICATE_ROWS"],
  ["a NaN benchmark", (report: RespondentReport, benchmarks: ReturnType<typeof completeSuFullBenchmarkRows>) => ({ report, benchmarks: benchmarks.map((row, index) => index === 0 ? { ...row, value: Number.NaN } : row) }), "INVALID_BENCHMARK"],
  ["an out-of-range benchmark", (report: RespondentReport, benchmarks: ReturnType<typeof completeSuFullBenchmarkRows>) => ({ report, benchmarks: benchmarks.map((row, index) => index === 0 ? { ...row, value: 10.1 } : row) }), "INVALID_BENCHMARK"],
  ["a missing frozen score", (report: RespondentReport, benchmarks: ReturnType<typeof completeSuFullBenchmarkRows>) => ({ report: { ...report, result: { ...report.result, perQuestion: report.result.perQuestion.slice(1) } }, benchmarks }), "MISSING_ROWS"],
  ["an invalid frozen score", (report: RespondentReport, benchmarks: ReturnType<typeof completeSuFullBenchmarkRows>) => ({ report: { ...report, result: { ...report.result, perQuestion: report.result.perQuestion.map((row, index) => index === 0 ? { ...row, value: -1 } : row) } }, benchmarks }), "INVALID_SCORE"],
  ["a missing frozen question key", (report: RespondentReport, benchmarks: ReturnType<typeof completeSuFullBenchmarkRows>) => { const questionsByKey = { ...report.questionsByKey }; delete questionsByKey.Q01; return { report: { ...report, questionsByKey }, benchmarks }; }, "KEY_MISMATCH"],
  ["an invalid benchmark timestamp", (report: RespondentReport, benchmarks: ReturnType<typeof completeSuFullBenchmarkRows>) => ({ report, benchmarks: benchmarks.map((row, index) => index === 0 ? { ...row, updatedAt: "not-a-date" } : row) }), "INVALID_UPDATED_AT"],
  ["an unexpected required slider key", (report: RespondentReport, benchmarks: ReturnType<typeof completeSuFullBenchmarkRows>) => ({ report: { ...report, questionsByKey: { ...report.questionsByKey, Q62: { type: "SLIDER_LIKERT", label: "Unexpected", max: 10 } } }, benchmarks }), "KEY_MISMATCH"],
])("%s returns a bounded unavailable result", (_name, mutate, reason) => {
  const { report, benchmarks } = mutate(
    completeSuFullPeerReport(),
    completeSuFullBenchmarkRows(),
  );
  const result = buildSuFullPeerPresentationResult({ report, benchmarks });

  expect(result).toMatchObject({ status: "unavailable", reason });
  expect(result).not.toHaveProperty("presentation");
});

test("ignores a legitimate non-slider background question", () => {
  const report = completeSuFullPeerReport();
  report.questionsByKey.BACKGROUND_FTE = {
    type: "NUMBER",
    label: "How many employees?",
    sectionStableKey: "S_BACKGROUND",
  };

  const result = buildSuFullPeerPresentationResult({
    report,
    benchmarks: completeSuFullBenchmarkRows(),
  });

  expect(result.status).toBe("ready");
});
