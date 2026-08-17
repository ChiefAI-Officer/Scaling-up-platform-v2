import type { RespondentReport } from "@/lib/assessments/respondent-report";
import {
  SCALING_UP_FULL_TEMPLATE_ALIAS,
  SU_FULL_QUESTION_BENCHMARKS,
} from "@/lib/assessments/su-full-question-benchmarks";

const EXPECTED_KEYS = SU_FULL_QUESTION_BENCHMARKS.map((row) => row.stableKey);
const EXPECTED_KEY_SET = new Set<string>(EXPECTED_KEYS);

export type SuFullPeerBenchmarkRow = Readonly<{
  metricKey: string;
  value: number;
  updatedAt: Date | string;
}>;

export type SuFullPeerQuestionComparison = Readonly<{
  stableKey: string;
  label: string;
  you: number;
  peers: number;
  recommendation: string | null;
}>;

export type SuFullPeerSectionComparison = Readonly<{
  stableKey: string;
  label: string;
  domain: string | null;
  youTotal: number;
  peersTotal: number;
  questions: readonly SuFullPeerQuestionComparison[];
}>;

export type SuFullPeerPresentation = Readonly<{
  benchmarkUpdatedAt: string;
  sections: readonly SuFullPeerSectionComparison[];
}>;

export type SuFullPeerBuildReason =
  | "WRONG_TEMPLATE"
  | "DEGRADED_REPORT"
  | "KEY_MISMATCH"
  | "MISSING_ROWS"
  | "DUPLICATE_ROWS"
  | "INVALID_BENCHMARK"
  | "INVALID_SCORE"
  | "INVALID_UPDATED_AT";

export type SuFullPeerBuildResult =
  | Readonly<{ status: "ready"; presentation: SuFullPeerPresentation }>
  | Readonly<{
      status: "unavailable";
      reason: SuFullPeerBuildReason;
      expectedCount: number;
      benchmarkCount: number;
      scoreCount: number;
    }>;

type FrozenQuestionMeta = Readonly<{
  type?: unknown;
  label?: unknown;
  sectionStableKey?: unknown;
}>;

type FrozenSection = Readonly<{
  stableKey?: unknown;
  name?: unknown;
  domain?: unknown;
}>;

function unavailable(
  reason: SuFullPeerBuildReason,
  benchmarkCount: number,
  scoreCount: number,
): SuFullPeerBuildResult {
  return {
    status: "unavailable",
    reason,
    expectedCount: EXPECTED_KEYS.length,
    benchmarkCount,
    scoreCount,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactlyExpectedKeys(keys: readonly string[]): boolean {
  return keys.length === EXPECTED_KEYS.length
    && new Set(keys).size === EXPECTED_KEYS.length
    && keys.every((key) => EXPECTED_KEY_SET.has(key));
}

function roundedTotal(values: readonly number[]): number {
  return Math.round((values.reduce((total, value) => total + value, 0) + Number.EPSILON) * 10) / 10;
}

function dateFromUpdatedAt(value: Date | string): Date | null {
  const date = value instanceof Date
    ? value
    : typeof value === "string"
      ? new Date(value)
      : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") return value;
  const object = value as object;
  if (seen.has(object)) return value;
  seen.add(object);
  for (const child of Object.values(object)) deepFreeze(child, seen);
  return Object.freeze(value);
}

/**
 * Builds an all-or-nothing Scaling Up Full comparison from frozen submission
 * values and current template-level peer benchmark rows. It never re-scores or
 * re-resolves feedback.
 */
export function buildSuFullPeerPresentationResult(input: {
  report: RespondentReport;
  benchmarks: readonly SuFullPeerBenchmarkRow[];
}): SuFullPeerBuildResult {
  const report = input?.report;
  const benchmarks = Array.isArray(input?.benchmarks) ? input.benchmarks : [];
  const benchmarkCount = benchmarks.length;
  const scoreRows = Array.isArray(report?.result?.perQuestion)
    ? report.result.perQuestion
    : [];
  const scoreCount = scoreRows.length;

  if (!report || report.templateAlias !== SCALING_UP_FULL_TEMPLATE_ALIAS) {
    return unavailable("WRONG_TEMPLATE", benchmarkCount, scoreCount);
  }
  if (report.degraded) {
    return unavailable("DEGRADED_REPORT", benchmarkCount, scoreCount);
  }

  const questionsByKey = report.questionsByKey;
  if (!isRecord(questionsByKey)) {
    return unavailable("KEY_MISMATCH", benchmarkCount, scoreCount);
  }
  const sliderQuestionEntries = Object.entries(questionsByKey).filter(
    ([, question]) => isRecord(question) && (question as FrozenQuestionMeta).type === "SLIDER_LIKERT",
  ) as Array<[string, FrozenQuestionMeta]>;
  if (!hasExactlyExpectedKeys(sliderQuestionEntries.map(([key]) => key))) {
    return unavailable("KEY_MISMATCH", benchmarkCount, scoreCount);
  }

  if (scoreCount < EXPECTED_KEYS.length) {
    return unavailable("MISSING_ROWS", benchmarkCount, scoreCount);
  }
  if (!hasExactlyExpectedKeys(scoreRows.map((row) => row?.stableKey))) {
    return unavailable("KEY_MISMATCH", benchmarkCount, scoreCount);
  }

  const duplicateBenchmarkKey = new Set<string>();
  for (const row of benchmarks) {
    if (!row || typeof row.metricKey !== "string" || duplicateBenchmarkKey.has(row.metricKey)) {
      return unavailable("DUPLICATE_ROWS", benchmarkCount, scoreCount);
    }
    duplicateBenchmarkKey.add(row.metricKey);
  }
  if (benchmarkCount < EXPECTED_KEYS.length) {
    return unavailable("MISSING_ROWS", benchmarkCount, scoreCount);
  }
  if (!hasExactlyExpectedKeys(benchmarks.map((row) => row.metricKey))) {
    return unavailable("KEY_MISMATCH", benchmarkCount, scoreCount);
  }

  for (const row of benchmarks) {
    if (!Number.isFinite(row.value) || row.value < 0 || row.value > 10) {
      return unavailable("INVALID_BENCHMARK", benchmarkCount, scoreCount);
    }
  }
  for (const row of scoreRows) {
    if (!Number.isFinite(row.value) || row.value < 0 || row.value > 10) {
      return unavailable("INVALID_SCORE", benchmarkCount, scoreCount);
    }
  }

  const datedBenchmarks = benchmarks.map((row) => ({
    row,
    updatedAt: dateFromUpdatedAt(row.updatedAt),
  }));
  if (datedBenchmarks.some(({ updatedAt }) => updatedAt === null)) {
    return unavailable("INVALID_UPDATED_AT", benchmarkCount, scoreCount);
  }

  const sections = Array.isArray(report.sections)
    ? report.sections as FrozenSection[]
    : [];
  const scoreByKey = new Map(scoreRows.map((row) => [row.stableKey, row]));
  const benchmarkByKey = new Map(benchmarks.map((row) => [row.metricKey, row]));
  const presentationSections: SuFullPeerSectionComparison[] = [];
  const emittedKeys: string[] = [];

  for (const section of sections) {
    if (!isRecord(section) || typeof section.stableKey !== "string" || typeof section.name !== "string") {
      return unavailable("KEY_MISMATCH", benchmarkCount, scoreCount);
    }
    if (section.domain !== undefined && section.domain !== null && typeof section.domain !== "string") {
      return unavailable("KEY_MISMATCH", benchmarkCount, scoreCount);
    }
    const questions = sliderQuestionEntries
      .filter(([, question]) => question.sectionStableKey === section.stableKey)
      .map(([stableKey, question]) => {
        const score = scoreByKey.get(stableKey);
        const benchmark = benchmarkByKey.get(stableKey);
        if (!score || !benchmark || typeof question.label !== "string") return null;
        emittedKeys.push(stableKey);
        return {
          stableKey,
          label: question.label,
          you: score.value,
          peers: benchmark.value,
          recommendation: typeof score.recommendation === "string" && score.recommendation.trim() !== ""
            ? score.recommendation
            : null,
        };
      });

    if (questions.some((question) => question === null)) {
      return unavailable("KEY_MISMATCH", benchmarkCount, scoreCount);
    }
    if (questions.length > 0) {
      const comparisons = questions as SuFullPeerQuestionComparison[];
      presentationSections.push({
        stableKey: section.stableKey,
        label: section.name,
        domain: typeof section.domain === "string" ? section.domain : null,
        youTotal: roundedTotal(comparisons.map((question) => question.you)),
        peersTotal: roundedTotal(comparisons.map((question) => question.peers)),
        questions: comparisons,
      });
    }
  }

  if (!hasExactlyExpectedKeys(emittedKeys)) {
    return unavailable("KEY_MISMATCH", benchmarkCount, scoreCount);
  }

  const greatestUpdatedAt = datedBenchmarks.reduce(
    (greatest, { updatedAt }) => greatest && updatedAt && updatedAt > greatest ? updatedAt : greatest,
    datedBenchmarks[0]?.updatedAt,
  );
  if (!greatestUpdatedAt) {
    return unavailable("INVALID_UPDATED_AT", benchmarkCount, scoreCount);
  }

  return {
    status: "ready",
    presentation: deepFreeze({
      benchmarkUpdatedAt: greatestUpdatedAt.toISOString(),
      sections: presentationSections,
    }),
  };
}

export function buildSuFullPeerPresentation(input: {
  report: RespondentReport;
  benchmarks: readonly SuFullPeerBenchmarkRow[];
}): SuFullPeerPresentation | null {
  const result = buildSuFullPeerPresentationResult(input);
  return result.status === "ready" ? result.presentation : null;
}
