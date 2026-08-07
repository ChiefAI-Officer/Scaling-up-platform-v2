export interface ComparisonQuestionMeta {
  type: string | null;
  min: number | null;
  max: number | null;
}

export interface ComparisonSnapshot {
  submissionId: string;
  campaignId: string;
  campaignLabel: string | null;
  submittedAt: Date;
  versionId: string;
  versionNumber: number;
  isImported: boolean;
  result: unknown;
  questionMetaByKey: Record<string, ComparisonQuestionMeta>;
}

export interface ComparableValue {
  current: number | null;
  previous: number | null;
  delta: number | null;
  status: "comparable" | "different-version" | "unmatched";
}

export interface ReportComparisonCandidate {
  submissionId: string;
  campaignId: string;
  campaignLabel: string | null;
  submittedAt: Date;
  versionId: string;
  versionNumber: number;
  isImported: boolean;
}

export interface ReportComparisonModel {
  baseline: ReportComparisonCandidate;
  sameVersion: boolean;
  overall: ComparableValue;
  domains: Record<string, ComparableValue>;
  sections: Record<string, ComparableValue>;
  questions: Record<string, ComparableValue>;
  coverage: {
    currentQuestionCount: number;
    matchedQuestionCount: number;
    unmatchedCurrentCount: number;
    baselineOnlyCount: number;
  };
}

export interface ReportComparisonInput {
  focus: ComparisonSnapshot;
  baseline: ComparisonSnapshot;
}

type FrozenRow = Record<string, unknown>;

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function record(value: unknown): FrozenRow | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as FrozenRow
    : null;
}

function rows(result: unknown, field: string): FrozenRow[] {
  const value = record(result)?.[field];
  return Array.isArray(value) ? value.flatMap((entry) => {
    const row = record(entry);
    return row ? [row] : [];
  }) : [];
}

function indexedValues(result: unknown, field: string, keyField: string, valueField: string): Record<string, number | null> {
  const values: Record<string, number | null> = Object.create(null);
  rows(result, field).forEach((row) => {
    const key = row[keyField];
    if (typeof key === "string") values[key] = finite(row[valueField]);
  });
  return values;
}

function comparable(current: number | null, previous: number | null): ComparableValue {
  if (current === null || previous === null) {
    return { current, previous, delta: null, status: "unmatched" };
  }
  return { current, previous, delta: current - previous, status: "comparable" };
}

function aggregateValue(current: number | null, previous: number | null, sameVersion: boolean): ComparableValue {
  const value = comparable(current, previous);
  return !sameVersion && value.status === "comparable"
    ? { ...value, delta: null, status: "different-version" }
    : value;
}

function questionCompatible(
  current: ComparisonQuestionMeta | undefined,
  previous: ComparisonQuestionMeta | undefined,
): boolean {
  return current?.type === "SLIDER_LIKERT" &&
    previous?.type === "SLIDER_LIKERT" &&
    Number.isFinite(current.min) &&
    Number.isFinite(current.max) &&
    Number.isFinite(previous.min) &&
    Number.isFinite(previous.max) &&
    current.min === previous.min &&
    current.max === previous.max;
}

function comparisonRows(
  current: Record<string, number | null>,
  previous: Record<string, number | null>,
  valueFor: (currentValue: number | null, previousValue: number | null, key: string) => ComparableValue,
): Record<string, ComparableValue> {
  const keys = new Set([...Object.keys(current), ...Object.keys(previous)]);
  const values: Record<string, ComparableValue> = Object.create(null);
  keys.forEach((key) => {
    values[key] = valueFor(
      Object.hasOwn(current, key) ? current[key] : null,
      Object.hasOwn(previous, key) ? previous[key] : null,
      key,
    );
  });
  return values;
}

function toCandidate(snapshot: ComparisonSnapshot): ReportComparisonCandidate {
  const { submissionId, campaignId, campaignLabel, submittedAt, versionId, versionNumber, isImported } = snapshot;
  return { submissionId, campaignId, campaignLabel, submittedAt, versionId, versionNumber, isImported };
}

export function buildReportComparisonModel({ focus, baseline }: ReportComparisonInput): ReportComparisonModel {
  const sameVersion = focus.versionId === baseline.versionId;
  const currentDomains = indexedValues(focus.result, "perDomain", "key", "averagePoints");
  const previousDomains = indexedValues(baseline.result, "perDomain", "key", "averagePoints");
  const currentSections = indexedValues(focus.result, "perSection", "stableKey", "averagePoints");
  const previousSections = indexedValues(baseline.result, "perSection", "stableKey", "averagePoints");
  const currentQuestions = indexedValues(focus.result, "perQuestion", "stableKey", "value");
  const previousQuestions = indexedValues(baseline.result, "perQuestion", "stableKey", "value");
  const questions = comparisonRows(currentQuestions, previousQuestions, (current, previous, key) => {
    if (!Object.hasOwn(currentQuestions, key)) {
      return { current, previous, delta: null, status: "unmatched" };
    }
    if (!questionCompatible(focus.questionMetaByKey[key], baseline.questionMetaByKey[key])) {
      return { current, previous: null, delta: null, status: "unmatched" };
    }
    const value = comparable(current, previous);
    return value.status === "comparable"
      ? value
      : { ...value, previous: null };
  });
  const matchedQuestionCount = Object.entries(questions).filter(
    ([key, value]) => Object.hasOwn(currentQuestions, key) && value.status === "comparable",
  ).length;

  return {
    baseline: toCandidate(baseline),
    sameVersion,
    overall: aggregateValue(finite(record(focus.result)?.scaleUpScore), finite(record(baseline.result)?.scaleUpScore), sameVersion),
    domains: comparisonRows(currentDomains, previousDomains, (current, previous) => aggregateValue(current, previous, sameVersion)),
    sections: comparisonRows(currentSections, previousSections, (current, previous) => aggregateValue(current, previous, sameVersion)),
    questions,
    coverage: {
      currentQuestionCount: Object.keys(currentQuestions).length,
      matchedQuestionCount,
      unmatchedCurrentCount: Object.keys(currentQuestions).length - matchedQuestionCount,
      baselineOnlyCount: Object.keys(previousQuestions).filter((key) => !Object.hasOwn(currentQuestions, key)).length,
    },
  };
}
